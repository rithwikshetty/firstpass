import { NextRequest, NextResponse } from "next/server";
import { buildRubricPrompt } from "@/lib/rubric";
import { CLAUDE_MODEL, reviewWithClaude } from "@/lib/models/anthropic";
import { GPT_MODEL, reviewWithGPT } from "@/lib/models/openai";
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
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "@/lib/request-security";
import { elapsedMs, logger, serializeError } from "@/lib/logger";
import { withRequestLogging } from "@/lib/route-logging";

export const runtime = "nodejs";

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

    const model = request.nextUrl.searchParams.get("model");
    if (!model || !(model in MODELS)) {
      logger.warn("review.invalid_model", {
        ...logContext,
        model: model ?? "missing",
      });
      return NextResponse.json(
        { error: "Invalid model. Use ?model=claude|gpt" },
        { status: 400 },
      );
    }
    const { run, keyEnv, label, modelId } = MODELS[model as ModelName];

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

    const oversized = rejectOversizedContentLength(
      request,
      MAX_REVIEW_REQUEST_BYTES,
      logContext,
    );
    if (oversized) return oversized;

    logger.debug("review.form_data.start", { ...logContext, model });
    const formData = await request.formData();
    logger.debug("review.form_data.finish", { ...logContext, model });

    // Both sections accept one or more PDF/DOCX uploads (the job description may
    // also be pasted). Each file is parsed server-side and combined. Resolve the
    // job description first so we never parse the CV for an already-invalid request.
    let jobDescription: string;
    let cvText: string;
    const uploadLogContext = { ...logContext, workflow: "review", model };
    try {
      jobDescription = await resolveJobDescription(formData, uploadLogContext);
      cvText = await resolveCv(formData, uploadLogContext);
    } catch (err) {
      if (err instanceof UploadError) {
        logger.warn("review.upload_rejected", {
          ...logContext,
          model,
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
      model,
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
          model,
          status: err.status,
          estimatedPromptTokens,
        });
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    // Model failures are returned as 200 with an `error` so the client can show a
    // per-model error while the other model's result still renders.
    const modelStartedAt = Date.now();
    logger.info("review.model.start", {
      ...logContext,
      model,
      modelId,
      provider: label,
      estimatedPromptTokens,
    });
    try {
      const data = await run(system, user);
      logger.info("review.model.finish", {
        ...logContext,
        model,
        modelId,
        provider: label,
        durationMs: elapsedMs(modelStartedAt),
        matchScore: Math.round(data.match_score),
        suggestionsCount: data.suggestions.length,
        presentKeywordCount: data.keywords.present.length,
        missingKeywordCount: data.keywords.missing.length,
      });
      return NextResponse.json({ data, error: null });
    } catch (err) {
      logger.error("review.model.failed", {
        ...logContext,
        model,
        modelId,
        provider: label,
        durationMs: elapsedMs(modelStartedAt),
        error: serializeError(err),
      });
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ data: null, error: msg }, { status: 200 });
    }
  });
}
