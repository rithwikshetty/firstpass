// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { MAX_CV_TEXT_CHARS, MAX_JOB_DESCRIPTION_CHARS } from "@/lib/budgets";
import type { ReviewResult } from "@/lib/schema";
import type { ReviewEvent, ReviewOptions } from "@/lib/review-stream";

vi.mock("@/lib/models/anthropic", () => ({
  CLAUDE_MODEL: "claude-opus-5",
  reviewWithClaude: vi.fn(),
  consolidateWithClaude: vi.fn(),
}));
vi.mock("@/lib/models/openai", () => ({
  GPT_MODEL: "gpt-5.6-sol",
  reviewWithGPT: vi.fn(),
}));
vi.mock("@/lib/parser", () => ({ extractText: vi.fn() }));

import { extractText } from "@/lib/parser";
import { reviewWithClaude, consolidateWithClaude } from "@/lib/models/anthropic";
import { reviewWithGPT } from "@/lib/models/openai";
import * as rubric from "@/lib/rubric";
import { POST } from "./route";

function makeBody(jobDescription = "We need TypeScript experience.") {
  const body = new FormData();
  body.append("cv", new File(["CV"], "cv.pdf", { type: "application/pdf" }));
  body.append("jobDescription", jobDescription);
  return body;
}

function makeReq(body = makeBody(), options: RequestInit = {}) {
  return new NextRequest("http://localhost/api/review", {
    method: "POST",
    body,
    ...options,
    headers: { cookie: `${SESSION_COOKIE}=${sessionToken()}`, ...options.headers },
  });
}

async function events(res: Response): Promise<ReviewEvent[]> {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/x-ndjson");
  expect(res.headers.get("cache-control")).toBe("no-store");
  return (await res.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
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

async function review(_system: string, _user: string, options?: ReviewOptions) {
  options?.onText?.('{"match_score":82,');
  options?.onText?.('"key');
  options?.onText?.('words":{"present":[]},"suggestions":[');
  options?.onText?.('"Keep relevant experience prominent."]}');
  return reviewResult;
}

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "test-password");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("APP_ORIGIN", "http://localhost");
  vi.resetAllMocks();
  vi.mocked(extractText).mockResolvedValue("CV text");
  vi.mocked(reviewWithClaude).mockImplementation(review);
  vi.mocked(reviewWithGPT).mockImplementation(review);
  vi.mocked(consolidateWithClaude).mockImplementation(async () => ({
    headline_verdict: "Good match.",
    consensus: { scores: "incorrect", agreement_note: "Both agree." },
    lead_with: ["One", "Two", "Three", "Four"],
    fix_first: [],
    honest_caveat: null,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("/api/review gating", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await POST(makeReq(makeBody(), { headers: { cookie: "" } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects cross-origin requests before parsing uploads", async () => {
    const res = await POST(makeReq(makeBody(), { headers: { origin: "https://untrusted.test" } }));
    expect(res.status).toBe(403);
    expect(extractText).not.toHaveBeenCalled();
  });

  it.each(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"])("rejects a missing %s before streaming", async (key) => {
    vi.stubEnv(key, "");
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: `${key === "OPENAI_API_KEY" ? "GPT" : "Claude"} API key is not configured on the server.` });
    expect(reviewWithClaude).not.toHaveBeenCalled();
  });

  it("rejects missing inputs", async () => {
    expect((await POST(makeReq(new FormData()))).status).toBe(400);
    const body = makeBody();
    body.delete("cv");
    expect((await POST(makeReq(body))).status).toBe(400);
    expect((await POST(makeReq(makeBody("")))).status).toBe(400);
    expect(reviewWithClaude).not.toHaveBeenCalled();
  });

  it.each(["", "low", "high", "Quick", "banana"])("rejects invalid effort %j", async (effort) => {
    const body = makeBody();
    body.set("effort", effort);
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    expect(extractText).not.toHaveBeenCalled();
  });

  it("rejects a file used as effort", async () => {
    const body = makeBody();
    body.set("effort", new File(["quick"], "effort.txt"));
    expect((await POST(makeReq(body))).status).toBe(400);
  });

  it("rejects oversized content length", async () => {
    const res = await POST(makeReq(makeBody(), { headers: { "content-length": "100000000" } }));
    expect(res.status).toBe(413);
    expect(extractText).not.toHaveBeenCalled();
  });

  it("rejects malformed multipart bodies", async () => {
    const req = makeReq(makeBody(), { body: "invalid", headers: { "content-type": "multipart/form-data; boundary=missing" } });
    expect((await POST(req)).status).toBe(400);
  });

  it("rejects an oversized job description before parsing the CV", async () => {
    expect((await POST(makeReq(makeBody("x".repeat(MAX_JOB_DESCRIPTION_CHARS + 1))))).status).toBe(413);
    expect(extractText).not.toHaveBeenCalled();
  });

  it("rejects oversized extracted CV text before calling models", async () => {
    vi.mocked(extractText).mockResolvedValue("x".repeat(MAX_CV_TEXT_CHARS + 1));
    expect((await POST(makeReq())).status).toBe(413);
    expect(reviewWithClaude).not.toHaveBeenCalled();
  });

  it("checks the complete rubric prompt budget before streaming", async () => {
    vi.spyOn(rubric, "buildRubricPrompt").mockReturnValue({ system: "x".repeat(200_001), user: "" });
    expect((await POST(makeReq())).status).toBe(413);
    expect(reviewWithClaude).not.toHaveBeenCalled();
  });
});

describe("/api/review stream", () => {
  it("completes a real multipart NextRequest with both reviews and a capped, grounded consolidation", async () => {
    const req = makeReq();
    expect(req).toBeInstanceOf(NextRequest);
    expect(req.headers.get("content-type")).toContain("multipart/form-data; boundary=");
    const result = await events(await POST(req));
    expect(result).toEqual([
      { type: "stage", model: "claude", stage: "match_score" },
      { type: "stage", model: "claude", stage: "suggestions" },
      { type: "stage", model: "gpt", stage: "match_score" },
      { type: "stage", model: "gpt", stage: "suggestions" },
      { type: "review", model: "claude", data: reviewResult },
      { type: "review", model: "gpt", data: reviewResult },
      { type: "consolidation", data: {
        headline_verdict: "Good match.",
        consensus: { scores: "Claude 82 · GPT 82", agreement_note: "Both agree." },
        lead_with: ["One", "Two", "Three"], fix_first: [], honest_caveat: null,
      } },
      { type: "done" },
    ]);
    expect(extractText).toHaveBeenCalledOnce();
    for (const run of [reviewWithClaude, reviewWithGPT, consolidateWithClaude]) {
      expect(run).toHaveBeenCalledOnce();
      expect(vi.mocked(run).mock.calls[0][2]?.effort).toBe("thorough");
    }
  });

  it.each(["claude", "gpt"] as const)("keeps the other review when %s fails and skips consolidation", async (model) => {
    vi.mocked(model === "claude" ? reviewWithClaude : reviewWithGPT).mockRejectedValue(new Error("Provider failed."));
    const result = await events(await POST(makeReq()));
    expect(result.filter((event) => event.type === "review")).toEqual(expect.arrayContaining([
      { type: "review", model, error: "Provider failed." },
      { type: "review", model: model === "claude" ? "gpt" : "claude", data: reviewResult },
    ]));
    expect(result.some((event) => event.type === "consolidation")).toBe(false);
    expect(result.at(-1)).toEqual({ type: "done" });
    expect(consolidateWithClaude).not.toHaveBeenCalled();
  });

  it("sends a consolidation error without discarding the reviews", async () => {
    vi.mocked(consolidateWithClaude).mockRejectedValue(new Error("Consolidation failed."));
    const result = await events(await POST(makeReq()));
    expect(result.filter((event) => event.type === "review")).toHaveLength(2);
    expect(result.slice(-2)).toEqual([{ type: "consolidation", error: "Consolidation failed." }, { type: "done" }]);
  });

  it("threads quick effort through all three calls", async () => {
    const body = makeBody();
    body.set("effort", "quick");
    await events(await POST(makeReq(body)));
    for (const run of [reviewWithClaude, reviewWithGPT, consolidateWithClaude]) {
      expect(vi.mocked(run).mock.calls[0][2]?.effort).toBe("quick");
    }
  });

  it("accepts uploaded job descriptions and multiple CV documents, parsing each once", async () => {
    const body = makeBody("");
    body.append("jobFile", new File(["role"], "role.pdf"));
    body.append("cv", new File(["letter"], "letter.docx"));
    await events(await POST(makeReq(body)));
    expect(extractText).toHaveBeenCalledTimes(3);
  });

  it("cancels consolidation when the response reader is cancelled", async () => {
    let started!: () => void;
    const consolidationStarted = new Promise<void>((resolve) => { started = resolve; });
    vi.mocked(consolidateWithClaude).mockImplementation((_system, _user, options) => {
      started();
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
    });
    const res = await POST(makeReq());
    await consolidationStarted;
    const reader = res.body!.getReader();
    await reader.cancel();
    expect(vi.mocked(consolidateWithClaude).mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect((await reader.read()).done).toBe(true);
  });

  it("emits idle pings, starts both models in parallel, and stops on disconnect", async () => {
    vi.useFakeTimers();
    const pending = (_system: string, _user: string, options?: ReviewOptions) => new Promise<ReviewResult>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => {
        options.onText?.('"suggestions"');
        reject(new Error("Aborted"));
      }, { once: true });
    });
    vi.mocked(reviewWithClaude).mockImplementation(pending);
    vi.mocked(reviewWithGPT).mockImplementation(pending);
    const abort = new AbortController();
    const res = await POST(makeReq(makeBody(), { signal: abort.signal }));
    expect(reviewWithClaude).toHaveBeenCalledOnce();
    expect(reviewWithGPT).toHaveBeenCalledOnce();
    const reader = res.body!.getReader();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('{"type":"ping"}\n');
    abort.abort();
    expect((await reader.read()).done).toBe(true);
    expect(vi.mocked(reviewWithClaude).mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect(vi.mocked(reviewWithGPT).mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect(consolidateWithClaude).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
