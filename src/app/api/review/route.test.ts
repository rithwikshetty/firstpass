import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import {
  MAX_CV_TEXT_CHARS,
  MAX_JOB_DESCRIPTION_CHARS,
} from "@/lib/budgets";
import type { ReviewResult } from "@/lib/schema";

// Mock the model adapters so the route never makes a real API call.
vi.mock("@/lib/models/anthropic", () => ({
  CLAUDE_MODEL: "claude-opus-4-8",
  reviewWithClaude: vi.fn(),
}));
vi.mock("@/lib/models/openai", () => ({
  GPT_MODEL: "gpt-5.6-sol",
  reviewWithGPT: vi.fn(),
}));
vi.mock("@/lib/parser", () => ({ extractText: vi.fn() }));

import { extractText } from "@/lib/parser";
import { reviewWithClaude } from "@/lib/models/anthropic";
import { POST } from "./route";

function makeReq(
  query: string,
  opts: { token?: string; body?: FormData } = {},
): NextRequest {
  if (!opts.body) {
    const req = new NextRequest(`http://localhost/api/review${query}`, {
      method: "POST",
    });
    if (opts.token) req.cookies.set(SESSION_COOKIE, opts.token);
    return req;
  }

  return {
    nextUrl: new URL(`http://localhost/api/review${query}`),
    cookies: {
      get: (name: string) =>
        opts.token && name === SESSION_COOKIE
          ? { name: SESSION_COOKIE, value: opts.token }
          : undefined,
    },
    formData: async () => opts.body,
  } as unknown as NextRequest;
}

function uploadFile(name: string): File {
  return {
    name,
    size: 4,
    arrayBuffer: async () => new ArrayBuffer(4),
  } as File;
}

function makeBody(
  jobDescription = "We need TypeScript experience.",
  jobFiles: File[] = [],
  cvFiles: File[] = [uploadFile("cv.pdf")],
) {
  return {
    get: (name: string) => (name === "jobDescription" ? jobDescription : null),
    getAll: (name: string) =>
      name === "cv"
        ? cvFiles
        : name === "jobFile"
          ? jobFiles
          : ([] as FormDataEntryValue[]),
  } as unknown as FormData;
}

const reviewResult: ReviewResult = {
  match_score: 82,
  match_summary: "Good match.",
  keywords: { present: ["TypeScript"], missing: [], semantic: [] },
  experience_alignment: { score: 80, explanation: "Aligned." },
  skills_gap: { score: 85, present: ["TypeScript"], missing: [] },
  formatting: { score: 90, issues: [] },
  section_completeness: { score: 75, present: ["Experience"], missing: [] },
  suggestions: ["Keep relevant experience prominent."],
};

describe("/api/review gating", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "test-password";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.OPENAI_API_KEY = "sk-test";
    vi.mocked(extractText).mockReset();
    vi.mocked(reviewWithClaude).mockReset();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await POST(makeReq("?model=claude"));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid model with 400 when authenticated", async () => {
    const res = await POST(makeReq("?model=banana", { token: sessionToken()! }));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing the CV and job description with 400", async () => {
    const res = await POST(
      makeReq("?model=claude", { token: sessionToken()!, body: new FormData() }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an oversized job description before parsing the CV", async () => {
    const res = await POST(
      makeReq("?model=claude", {
        token: sessionToken()!,
        body: makeBody("x".repeat(MAX_JOB_DESCRIPTION_CHARS + 1)),
      }),
    );

    expect(res.status).toBe(413);
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects oversized extracted CV text before calling the model", async () => {
    vi.mocked(extractText).mockResolvedValue("x".repeat(MAX_CV_TEXT_CHARS + 1));

    const res = await POST(
      makeReq("?model=claude", {
        token: sessionToken()!,
        body: makeBody(),
      }),
    );

    expect(res.status).toBe(413);
    expect(vi.mocked(reviewWithClaude)).not.toHaveBeenCalled();
  });

  it("still calls the selected model for inputs within budget", async () => {
    vi.mocked(extractText).mockResolvedValue("CV text");
    vi.mocked(reviewWithClaude).mockResolvedValue(reviewResult);

    const res = await POST(
      makeReq("?model=claude", {
        token: sessionToken()!,
        body: makeBody(),
      }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual(reviewResult);
    expect(vi.mocked(reviewWithClaude)).toHaveBeenCalledOnce();
  });

  it("accepts a job description supplied only as an uploaded file", async () => {
    vi.mocked(extractText).mockResolvedValue("Senior engineer, TypeScript.");
    vi.mocked(reviewWithClaude).mockResolvedValue(reviewResult);

    const jobFile = {
      name: "role.pdf",
      size: 8,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as File;

    const res = await POST(
      makeReq("?model=claude", {
        token: sessionToken()!,
        body: makeBody("", [jobFile]),
      }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(reviewWithClaude)).toHaveBeenCalledOnce();
    // Parsed once for the job-description file and once for the CV.
    expect(vi.mocked(extractText)).toHaveBeenCalledTimes(2);
  });

  it("accepts a CV split across multiple uploaded files", async () => {
    vi.mocked(extractText).mockResolvedValue("CV text");
    vi.mocked(reviewWithClaude).mockResolvedValue(reviewResult);

    const res = await POST(
      makeReq("?model=claude", {
        token: sessionToken()!,
        body: makeBody("We need TypeScript experience.", [], [
          uploadFile("cv.pdf"),
          uploadFile("cover-letter.docx"),
        ]),
      }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(reviewWithClaude)).toHaveBeenCalledOnce();
    // Parsed once per CV file (the job description here is pasted text).
    expect(vi.mocked(extractText)).toHaveBeenCalledTimes(2);
  });

  it("rejects a request with neither a job description nor a file", async () => {
    const res = await POST(
      makeReq("?model=claude", {
        token: sessionToken()!,
        body: makeBody(""),
      }),
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(reviewWithClaude)).not.toHaveBeenCalled();
  });
});
