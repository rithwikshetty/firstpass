import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import {
  MAX_CV_TEXT_CHARS,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_REVIEW_JSON_CHARS,
} from "@/lib/budgets";
import type { ReviewResult } from "@/lib/schema";

// Mock the model adapter so the route never makes a real API call.
vi.mock("@/lib/models/anthropic", () => ({ consolidateWithClaude: vi.fn() }));
vi.mock("@/lib/parser", () => ({ extractText: vi.fn() }));

import { extractText } from "@/lib/parser";
import { consolidateWithClaude } from "@/lib/models/anthropic";
import { POST } from "./route";

function makeReq(opts: { token?: string; body?: FormData } = {}): NextRequest {
  if (!opts.body) {
    const req = new NextRequest("http://localhost/api/consolidate", {
      method: "POST",
    });
    if (opts.token) req.cookies.set(SESSION_COOKIE, opts.token);
    return req;
  }

  return {
    nextUrl: new URL("http://localhost/api/consolidate"),
    cookies: {
      get: (name: string) =>
        opts.token && name === SESSION_COOKIE
          ? { name: SESSION_COOKIE, value: opts.token }
          : undefined,
    },
    formData: async () => opts.body,
  } as unknown as NextRequest;
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

function makeBody({
  jobDescription = "We need TypeScript experience.",
  claude = JSON.stringify(reviewResult),
  gpt = JSON.stringify(reviewResult),
}: {
  jobDescription?: string;
  claude?: string;
  gpt?: string;
} = {}) {
  const values = new Map<string, FormDataEntryValue>([
    [
      "cv",
      {
        name: "cv.pdf",
        size: 4,
        arrayBuffer: async () => new ArrayBuffer(4),
      } as File,
    ],
    ["jobDescription", jobDescription],
    ["claude", claude],
    ["gpt", gpt],
  ]);
  return { get: (name: string) => values.get(name) ?? null } as FormData;
}

describe("/api/consolidate gating", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "test-password";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.mocked(extractText).mockReset();
    vi.mocked(consolidateWithClaude).mockReset();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated request missing inputs with 400", async () => {
    const res = await POST(makeReq({ token: sessionToken()!, body: new FormData() }));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized job description before parsing the CV", async () => {
    const res = await POST(
      makeReq({
        token: sessionToken()!,
        body: makeBody({
          jobDescription: "x".repeat(MAX_JOB_DESCRIPTION_CHARS + 1),
        }),
      }),
    );

    expect(res.status).toBe(413);
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects oversized review JSON before parsing the CV", async () => {
    const res = await POST(
      makeReq({
        token: sessionToken()!,
        body: makeBody({ claude: "x".repeat(MAX_REVIEW_JSON_CHARS + 1) }),
      }),
    );

    expect(res.status).toBe(413);
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects oversized extracted CV text before consolidation", async () => {
    vi.mocked(extractText).mockResolvedValue("x".repeat(MAX_CV_TEXT_CHARS + 1));

    const res = await POST(
      makeReq({ token: sessionToken()!, body: makeBody() }),
    );

    expect(res.status).toBe(413);
    expect(vi.mocked(consolidateWithClaude)).not.toHaveBeenCalled();
  });

  it("still consolidates inputs within budget", async () => {
    vi.mocked(extractText).mockResolvedValue("CV text");
    vi.mocked(consolidateWithClaude).mockResolvedValue({
      headline_verdict: "Good fit.",
      consensus: { scores: "", agreement_note: "Both agree." },
      fix_first: [],
      honest_caveat: null,
    });

    const res = await POST(
      makeReq({ token: sessionToken()!, body: makeBody() }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.consensus.scores).toBe("Claude 82 · GPT 82");
    expect(vi.mocked(consolidateWithClaude)).toHaveBeenCalledOnce();
  });
});
