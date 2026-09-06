import { NextRequest, NextResponse } from "next/server";
import { buildConsolidationPrompt } from "@/lib/consolidator";
import {
  CLAUDE_MODEL,
  consolidateWithClaude,
} from "@/lib/models/anthropic";
import { SESSION_COOKIE, isAuthorized } from "@/lib/auth";
import { type ReviewResult, isReviewResult } from "@/lib/schema";
import {
  BudgetError,
  MAX_CV_FILES,
  MAX_CV_FILE_BYTES,
  MAX_JD_FILES,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_JOB_FILE_BYTES,
  MAX_REVIEW_JSON_CHARS,
  assertPromptBudget,
  assertTextBudget,
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

const MAX_CONSOLIDATE_REQUEST_BYTES =
  MAX_CV_FILES * MAX_CV_FILE_BYTES +
  MAX_JD_FILES * MAX_JOB_FILE_BYTES +
  MAX_JOB_DESCRIPTION_CHARS +
  MAX_REVIEW_JSON_CHARS * 2 +
  512 * 1024;

/**
 * Consolidate the two model reviews the client already has into one honest
 * action plan. The client re-sends the CV file and job description (so we can
 * extract the CV text for grounding) plus both reviews as JSON. This is one
 * Claude call; it never re-runs the screeners.
 */
export async function POST(request: NextRequest) {
  return withRequestLogging(request, "api.consolidate", async (logContext) => {
    if (!isAuthorized(request.cookies.get(SESSION_COOKIE)?.value)) {
      logger.warn("auth.unauthorized", {
        ...logContext,
        reason: "missing_or_invalid_session",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const crossOrigin = rejectCrossOrigin(request, logContext);
    if (crossOrigin) return crossOrigin;

    if (!process.env.ANTHROPIC_API_KEY) {
      logger.error("consolidate.provider_not_configured", {
        ...logContext,
        provider: "Claude",
        keyEnv: "ANTHROPIC_API_KEY",
      });
      return NextResponse.json(
        { error: "Consolidation is not configured on the server." },
        { status: 500 },
      );
    }

    const oversized = rejectOversizedContentLength(
      request,
      MAX_CONSOLIDATE_REQUEST_BYTES,
      logContext,
    );
    if (oversized) return oversized;

    logger.debug("consolidate.form_data.start", logContext);
    let formData: FormData;
    try {
      formData = await readRequestFormData(
        request,
        MAX_CONSOLIDATE_REQUEST_BYTES,
        logContext,
      );
    } catch (err) {
      if (err instanceof RequestBodyError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
    logger.debug("consolidate.form_data.finish", logContext);
    const claudeRaw = formData.get("claude");
    const gptRaw = formData.get("gpt");

    if (typeof claudeRaw !== "string" || typeof gptRaw !== "string") {
      logger.warn("consolidate.missing_review_payloads", {
        ...logContext,
        hasClaudeReview: typeof claudeRaw === "string",
        hasGptReview: typeof gptRaw === "string",
      });
      return NextResponse.json(
        { error: "A CV file, a job description, and both reviews are required." },
        { status: 400 },
      );
    }
    logger.debug("consolidate.review_payloads_received", {
      ...logContext,
      claudeReviewChars: claudeRaw.length,
      gptReviewChars: gptRaw.length,
    });
    try {
      assertTextBudget("Claude review", claudeRaw, MAX_REVIEW_JSON_CHARS);
      assertTextBudget("GPT review", gptRaw, MAX_REVIEW_JSON_CHARS);
    } catch (err) {
      if (err instanceof BudgetError) {
        logger.warn("consolidate.review_payload_rejected", {
          ...logContext,
          status: err.status,
          claudeReviewChars: claudeRaw.length,
          gptReviewChars: gptRaw.length,
        });
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    // Parse and shape-check both reviews before touching the uploads: a
    // malformed review is cheap to reject and must never reach the model.
    let claude: ReviewResult;
    let gpt: ReviewResult;
    try {
      const claudeParsed: unknown = JSON.parse(claudeRaw);
      const gptParsed: unknown = JSON.parse(gptRaw);
      if (!isReviewResult(claudeParsed) || !isReviewResult(gptParsed)) {
        throw new Error("Review payload does not match the review schema.");
      }
      claude = claudeParsed;
      gpt = gptParsed;
    } catch {
      logger.warn("consolidate.review_json_invalid", logContext);
      return NextResponse.json(
        { error: "Could not read the model reviews." },
        { status: 400 },
      );
    }

    // Rebuild the same inputs the review used: pasted text and/or the re-sent
    // files for the job description, plus the CV document(s) — all parsed and
    // combined server-side.
    let jobDescription: string;
    let cvText: string;
    const uploadLogContext = { ...logContext, workflow: "consolidate" };
    try {
      jobDescription = await resolveJobDescription(formData, uploadLogContext);
      cvText = await resolveCv(formData, uploadLogContext);
    } catch (err) {
      if (err instanceof UploadError) {
        logger.warn("consolidate.upload_rejected", {
          ...logContext,
          status: err.status,
          errorName: err.name,
        });
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const { system, user } = buildConsolidationPrompt(
      cvText,
      jobDescription,
      claude,
      gpt,
    );
    const estimatedPromptTokens =
      estimateTokenCount(system) + estimateTokenCount(user);
    logger.debug("consolidate.prompt_built", {
      ...logContext,
      cvChars: cvText.length,
      jobDescriptionChars: jobDescription.length,
      systemChars: system.length,
      userChars: user.length,
      estimatedPromptTokens,
      claudeScore: Math.round(claude.match_score),
      gptScore: Math.round(gpt.match_score),
    });
    try {
      assertPromptBudget(system, user);
    } catch (err) {
      if (err instanceof BudgetError) {
        logger.warn("consolidate.prompt_rejected", {
          ...logContext,
          status: err.status,
          estimatedPromptTokens,
        });
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    // A consolidation failure comes back as 200 { data: null, error } so the
    // client can quietly fall back to the two full reviews below.
    const modelStartedAt = Date.now();
    logger.info("consolidate.model.start", {
      ...logContext,
      provider: "Claude",
      modelId: CLAUDE_MODEL,
      estimatedPromptTokens,
    });
    try {
      const data = await consolidateWithClaude(system, user);
      // The two scores are facts, not a model judgement — set them deterministically
      // from the reviews so the lead can never disagree with the columns below.
      data.consensus.scores = `Claude ${Math.round(claude.match_score)} · GPT ${Math.round(gpt.match_score)}`;
      // The schema can't cap lead_with (maxItems unsupported), so cap it here.
      data.lead_with = data.lead_with.slice(0, 3);
      logger.info("consolidate.model.finish", {
        ...logContext,
        provider: "Claude",
        modelId: CLAUDE_MODEL,
        durationMs: elapsedMs(modelStartedAt),
        fixFirstCount: data.fix_first.length,
        leadWithCount: data.lead_with.length,
        hasHonestCaveat: Boolean(data.honest_caveat),
      });
      return NextResponse.json({ data, error: null });
    } catch (err) {
      logger.error("consolidate.model.failed", {
        ...logContext,
        provider: "Claude",
        modelId: CLAUDE_MODEL,
        durationMs: elapsedMs(modelStartedAt),
        error: serializeError(err),
      });
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ data: null, error: msg }, { status: 200 });
    }
  });
}
