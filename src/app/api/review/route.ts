import { NextRequest, NextResponse } from "next/server";
import { buildRubricPrompt } from "@/lib/rubric";
import { CLAUDE_MODEL, reviewWithClaude, consolidateWithClaude } from "@/lib/models/anthropic";
import { GPT_MODEL, reviewWithGPT } from "@/lib/models/openai";
import { buildConsolidationPrompt } from "@/lib/consolidator";
import { reviewJsonSchema } from "@/lib/schema";
import type { ReviewEvent, ReviewStage } from "@/lib/review-stream";
import { SESSION_COOKIE, isAuthorized } from "@/lib/auth";
import {
  BudgetError,
  MAX_CV_FILES,
  MAX_CV_FILE_BYTES,
  MAX_JD_FILES,
  MAX_JOB_FILE_BYTES,
  assertPromptBudget,
  estimateTokenCount,
} from "@/lib/budgets";
import { UploadError, resolveCv, resolveJobDescription } from "@/lib/uploads";
import {
  RequestBodyError,
  readRequestFormData,
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "@/lib/request-security";
import { elapsedMs, logger, serializeError } from "@/lib/logger";
import { withRequestLogging } from "@/lib/route-logging";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODELS = {
  claude: {
    run: reviewWithClaude,
    keyEnv: "ANTHROPIC_API_KEY",
    label: "Claude",
    modelId: CLAUDE_MODEL,
  },
  gpt: {
    run: reviewWithGPT,
    keyEnv: "OPENAI_API_KEY",
    label: "GPT",
    modelId: GPT_MODEL,
  },
} as const;

type ModelName = keyof typeof MODELS;

const MAX_REVIEW_REQUEST_BYTES =
  MAX_CV_FILES * MAX_CV_FILE_BYTES +
  MAX_JD_FILES * MAX_JOB_FILE_BYTES +
  512 * 1024;

export async function POST(request: NextRequest) {
  return withRequestLogging(request, "api.review", async (logContext) => {
    if (!isAuthorized(request.cookies.get(SESSION_COOKIE)?.value)) {
      logger.warn("auth.unauthorized", {
        ...logContext,
        reason: "missing_or_invalid_session",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const crossOrigin = rejectCrossOrigin(request, logContext);
    if (crossOrigin) return crossOrigin;

    for (const [model, { keyEnv, label }] of Object.entries(MODELS)) {
      if (!process.env[keyEnv]) {
        logger.error("review.provider_not_configured", {
          ...logContext,
          model,
          provider: label,
          keyEnv,
        });
        return NextResponse.json(
          { error: `${label} API key is not configured on the server.` },
          { status: 500 },
        );
      }
    }

    const oversized = rejectOversizedContentLength(
      request,
      MAX_REVIEW_REQUEST_BYTES,
      logContext,
    );
    if (oversized) return oversized;

    logger.debug("review.form_data.start", logContext);
    let formData: FormData;
    try {
      formData = await readRequestFormData(
        request,
        MAX_REVIEW_REQUEST_BYTES,
        logContext,
      );
    } catch (err) {
      if (err instanceof RequestBodyError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
    logger.debug("review.form_data.finish", logContext);

    // Both sections accept one or more PDF/DOCX uploads (the job description may
    // also be pasted). Each file is parsed server-side and combined. Resolve the
    // job description first so we never parse the CV for an already-invalid request.
    let jobDescription: string;
    let cvText: string;
    const uploadLogContext = { ...logContext, workflow: "review" };
    try {
      jobDescription = await resolveJobDescription(formData, uploadLogContext);
      cvText = await resolveCv(formData, uploadLogContext);
    } catch (err) {
      if (err instanceof UploadError) {
        logger.warn("review.upload_rejected", {
          ...logContext,
          status: err.status,
          errorName: err.name,
        });
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const { system, user } = buildRubricPrompt(cvText, jobDescription);
    const estimatedPromptTokens =
      estimateTokenCount(system) + estimateTokenCount(user);
    logger.debug("review.prompt_built", {
      ...logContext,
      cvChars: cvText.length,
      jobDescriptionChars: jobDescription.length,
      systemChars: system.length,
      userChars: user.length,
      estimatedPromptTokens,
    });
    try {
      assertPromptBudget(system, user);
    } catch (err) {
      if (err instanceof BudgetError) {
        logger.warn("review.prompt_rejected", {
          ...logContext,
          status: err.status,
          estimatedPromptTokens,
        });
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal]);
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let lastSentAt = Date.now();
        const send = (event: ReviewEvent) => {
          if (closed || signal.aborted) return;
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          lastSentAt = Date.now();
        };
        const heartbeat = setInterval(() => {
          if (Date.now() - lastSentAt >= 15_000) send({ type: "ping" });
        }, 1_000);
        const close = () => {
          clearInterval(heartbeat);
          signal.removeEventListener("abort", close);
          if (!closed) {
            closed = true;
            if (!cancelled) controller.close();
          }
        };
        signal.addEventListener("abort", close, { once: true });
        if (signal.aborted) {
          close();
          return;
        }

        const runModel = async (model: ModelName) => {
          const { run, label, modelId } = MODELS[model];
          const modelStartedAt = Date.now();
          const modelContext = { ...logContext, model, modelId, provider: label };
          logger.info("review.model.start", { ...modelContext, estimatedPromptTokens });
          let text = "";
          let stage: ReviewStage | undefined;
          const onText = (delta: string) => {
            text += delta;
            let lastIndex = -1;
            let nextStage = stage;
            for (const key of Object.keys(reviewJsonSchema.properties) as ReviewStage[]) {
              const index = text.lastIndexOf(`"${key}"`);
              if (index > lastIndex) {
                lastIndex = index;
                nextStage = key;
              }
            }
            if (nextStage && nextStage !== stage) {
              stage = nextStage;
              send({ type: "stage", model, stage });
            }
          };
          try {
            const data = await run(system, user, { onText, signal });
            logger.info("review.model.finish", {
              ...modelContext,
              durationMs: elapsedMs(modelStartedAt),
              matchScore: Math.round(data.match_score),
              suggestionsCount: data.suggestions.length,
              presentKeywordCount: data.keywords.present.length,
              missingKeywordCount: data.keywords.missing.length,
            });
            send({ type: "review", model, data });
            return data;
          } catch (err) {
            if (signal.aborted) {
              logger.info("review.model.cancelled", {
                ...modelContext,
                durationMs: elapsedMs(modelStartedAt),
              });
              return null;
            }
            logger.error("review.model.failed", {
              ...modelContext,
              durationMs: elapsedMs(modelStartedAt),
              error: serializeError(err),
            });
            send({ type: "review", model, error: err instanceof Error ? err.message : "Unknown error" });
            return null;
          }
        };

        try {
          const [claude, gpt] = await Promise.all([runModel("claude"), runModel("gpt")]);
          if (claude && gpt && !signal.aborted) {
            const modelStartedAt = Date.now();
            const modelContext = { ...logContext, provider: "Claude", modelId: CLAUDE_MODEL };
            try {
              const prompt = buildConsolidationPrompt(cvText, jobDescription, claude, gpt);
              assertPromptBudget(prompt.system, prompt.user);
              logger.info("consolidate.model.start", {
                ...modelContext,
                estimatedPromptTokens: estimateTokenCount(prompt.system) + estimateTokenCount(prompt.user),
              });
              const data = await consolidateWithClaude(prompt.system, prompt.user, { signal });
              // The two scores are facts, not a model judgement — set them deterministically
              // from the reviews so the lead can never disagree with the columns below.
              data.consensus.scores = `Claude ${Math.round(claude.match_score)} · GPT ${Math.round(gpt.match_score)}`;
              // The schema can't cap lead_with (maxItems unsupported), so cap it here.
              data.lead_with = data.lead_with.slice(0, 3);
              logger.info("consolidate.model.finish", {
                ...modelContext,
                durationMs: elapsedMs(modelStartedAt),
                fixFirstCount: data.fix_first.length,
                leadWithCount: data.lead_with.length,
                hasHonestCaveat: Boolean(data.honest_caveat),
              });
              send({ type: "consolidation", data });
            } catch (err) {
              if (signal.aborted) {
                logger.info("consolidate.model.cancelled", {
                  ...modelContext,
                  durationMs: elapsedMs(modelStartedAt),
                });
                return;
              }
              logger.error("consolidate.model.failed", {
                ...modelContext,
                durationMs: elapsedMs(modelStartedAt),
                error: serializeError(err),
              });
              send({ type: "consolidation", error: err instanceof Error ? err.message : "Unknown error" });
            }
          }
          send({ type: "done" });
        } finally {
          close();
        }
      },
      cancel() {
        cancelled = true;
        cancellation.abort();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  });
}
