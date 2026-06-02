import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/parser";
import { buildRubricPrompt } from "@/lib/rubric";
import { reviewWithClaude } from "@/lib/models/anthropic";
import { reviewWithGPT } from "@/lib/models/openai";
import { SESSION_COOKIE, isAuthorized } from "@/lib/auth";
import {
  BudgetError,
  MAX_CV_TEXT_CHARS,
  MAX_JOB_DESCRIPTION_CHARS,
  assertPromptBudget,
  assertTextBudget,
} from "@/lib/budgets";
import {
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "@/lib/request-security";

export const runtime = "nodejs";

const MODELS = {
  claude: { run: reviewWithClaude, keyEnv: "ANTHROPIC_API_KEY", label: "Claude" },
  gpt: { run: reviewWithGPT, keyEnv: "OPENAI_API_KEY", label: "GPT" },
} as const;

type ModelName = keyof typeof MODELS;

const MAX_CV_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_REVIEW_REQUEST_BYTES = MAX_CV_BYTES + 512 * 1024;

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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const model = request.nextUrl.searchParams.get("model");
  if (!model || !(model in MODELS)) {
    return NextResponse.json(
      { error: "Invalid model. Use ?model=claude|gpt" },
      { status: 400 },
    );
  }
  const { run, keyEnv, label } = MODELS[model as ModelName];

  if (!process.env[keyEnv]) {
    return NextResponse.json(
      { error: `${label} API key is not configured on the server.` },
      { status: 500 },
    );
  }

  const oversized = rejectOversizedContentLength(
    request,
    MAX_REVIEW_REQUEST_BYTES,
  );
  if (oversized) return oversized;

  const formData = await request.formData();
  const file = formData.get("cv");
  const jobDescription = formData.get("jobDescription");

  if (
    !isUploadedFile(file) ||
    typeof jobDescription !== "string" ||
    !jobDescription.trim()
  ) {
    return NextResponse.json(
      { error: "A CV file and a job description are both required." },
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
  } catch (err) {
    if (err instanceof BudgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
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

  if (!cvText.trim()) {
    return NextResponse.json(
      { error: "No text found — the file may be image-based or empty." },
      { status: 400 },
    );
  }

  const { system, user } = buildRubricPrompt(cvText, jobDescription);
  try {
    assertPromptBudget(system, user);
  } catch (err) {
    if (err instanceof BudgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Model failures are returned as 200 with an `error` so the client can show a
  // per-model error while the other model's result still renders.
  try {
    const data = await run(system, user);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ data: null, error: msg }, { status: 200 });
  }
}
