import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/parser";
import { buildConsolidationPrompt } from "@/lib/consolidator";
import { consolidateWithClaude } from "@/lib/models/anthropic";
import { SESSION_COOKIE, isAuthorized } from "@/lib/auth";
import type { ReviewResult } from "@/lib/schema";
import {
  BudgetError,
  MAX_CV_TEXT_CHARS,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_REVIEW_JSON_CHARS,
  assertPromptBudget,
  assertTextBudget,
} from "@/lib/budgets";
import {
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "@/lib/request-security";

export const runtime = "nodejs";

const MAX_CV_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_CONSOLIDATE_REQUEST_BYTES =
  MAX_CV_BYTES + MAX_JOB_DESCRIPTION_CHARS + MAX_REVIEW_JSON_CHARS * 2 + 512 * 1024;

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string" &&
    typeof value.size === "number"
  );
}

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
  const file = formData.get("cv");
  const jobDescription = formData.get("jobDescription");
  const claudeRaw = formData.get("claude");
  const gptRaw = formData.get("gpt");

  if (
    !isUploadedFile(file) ||
    typeof jobDescription !== "string" ||
    !jobDescription.trim() ||
    typeof claudeRaw !== "string" ||
    typeof gptRaw !== "string"
  ) {
    return NextResponse.json(
      { error: "A CV file, a job description, and both reviews are required." },
      { status: 400 },
    );
  }
  if (file.size > MAX_CV_BYTES) {
    return NextResponse.json(
      { error: "That CV is too large — please keep it under 8 MB." },
      { status: 413 },
    );
  }
  try {
    assertTextBudget(
      "Job description",
      jobDescription,
      MAX_JOB_DESCRIPTION_CHARS,
    );
    assertTextBudget("Claude review", claudeRaw, MAX_REVIEW_JSON_CHARS);
    assertTextBudget("GPT review", gptRaw, MAX_REVIEW_JSON_CHARS);
  } catch (err) {
    if (err instanceof BudgetError) {
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

  let cvText: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    cvText = await extractText(buffer, file.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown parse error";
    return NextResponse.json(
      { error: `Could not read that CV: ${msg}` },
      { status: 400 },
    );
  }
  try {
    assertTextBudget("Extracted CV text", cvText, MAX_CV_TEXT_CHARS);
  } catch (err) {
    if (err instanceof BudgetError) {
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
