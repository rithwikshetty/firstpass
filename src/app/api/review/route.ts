import { NextRequest, NextResponse } from "next/server";
import { buildRubricPrompt } from "@/lib/rubric";
import { reviewWithClaude } from "@/lib/models/anthropic";
import { reviewWithGPT } from "@/lib/models/openai";
import { SESSION_COOKIE, isAuthorized } from "@/lib/auth";
import {
  BudgetError,
  MAX_CV_FILES,
  MAX_CV_FILE_BYTES,
  MAX_JD_FILES,
  MAX_JOB_FILE_BYTES,
  assertPromptBudget,
} from "@/lib/budgets";
import { UploadError, resolveCv, resolveJobDescription } from "@/lib/uploads";
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

const MAX_REVIEW_REQUEST_BYTES =
  MAX_CV_FILES * MAX_CV_FILE_BYTES +
  MAX_JD_FILES * MAX_JOB_FILE_BYTES +
  512 * 1024;

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

  // Both sections accept one or more PDF/DOCX uploads (the job description may
  // also be pasted). Each file is parsed server-side and combined. Resolve the
  // job description first so we never parse the CV for an already-invalid request.
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
