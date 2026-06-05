import { NextRequest, NextResponse } from "next/server";
import { buildConsolidationPrompt } from "@/lib/consolidator";
import { consolidateWithClaude } from "@/lib/models/anthropic";
import { SESSION_COOKIE, isAuthorized } from "@/lib/auth";
import type { ReviewResult } from "@/lib/schema";
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
} from "@/lib/budgets";
import { UploadError, resolveCv, resolveJobDescription } from "@/lib/uploads";
import {
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "@/lib/request-security";

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
  if (!isAuthorized(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Consolidation is not configured on the server." },
      { status: 500 },
    );
  }

  const oversized = rejectOversizedContentLength(
    request,
    MAX_CONSOLIDATE_REQUEST_BYTES,
  );
  if (oversized) return oversized;

  const formData = await request.formData();
  const claudeRaw = formData.get("claude");
  const gptRaw = formData.get("gpt");

  if (typeof claudeRaw !== "string" || typeof gptRaw !== "string") {
    return NextResponse.json(
      { error: "A CV file, a job description, and both reviews are required." },
      { status: 400 },
    );
  }
  try {
    assertTextBudget("Claude review", claudeRaw, MAX_REVIEW_JSON_CHARS);
    assertTextBudget("GPT review", gptRaw, MAX_REVIEW_JSON_CHARS);
  } catch (err) {
    if (err instanceof BudgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Rebuild the same inputs the review used: pasted text and/or the re-sent
  // files for the job description, plus the CV document(s) — all parsed and
  // combined server-side.
  let jobDescription: string;
  let cvText: string;
  try {
    jobDescription = await resolveJobDescription(formData);
    cvText = await resolveCv(formData);
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let claude: ReviewResult;
  let gpt: ReviewResult;
  try {
    claude = JSON.parse(claudeRaw);
    gpt = JSON.parse(gptRaw);
  } catch {
    return NextResponse.json(
      { error: "Could not read the model reviews." },
      { status: 400 },
    );
  }

  const { system, user } = buildConsolidationPrompt(
    cvText,
    jobDescription,
    claude,
    gpt,
  );
  try {
    assertPromptBudget(system, user);
  } catch (err) {
    if (err instanceof BudgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // A consolidation failure comes back as 200 { data: null, error } so the
  // client can quietly fall back to the two full reviews below.
  try {
    const data = await consolidateWithClaude(system, user);
    // The two scores are facts, not a model judgement — set them deterministically
    // from the reviews so the lead can never disagree with the columns below.
    data.consensus.scores = `Claude ${Math.round(claude.match_score)} · GPT ${Math.round(gpt.match_score)}`;
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ data: null, error: msg }, { status: 200 });
  }
}
