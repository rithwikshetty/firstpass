// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewWithClaude, consolidateWithClaude, CLAUDE_MODEL } from "./anthropic";
import { reviewWithGPT, GPT_MODEL } from "./openai";
import { isConsolidationPlan } from "../consolidator";
import type { ReviewResult } from "../schema";
import type { ReviewEffort } from "../review-stream";
import { logger } from "../logger";

const sdk = vi.hoisted(() => ({
  anthropic: vi.fn(),
  openai: vi.fn(),
  finalMessage: vi.fn(),
  finalResponse: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { beta = { messages: { stream: sdk.anthropic } }; },
}));
vi.mock("openai", () => ({
  default: class { responses = { stream: sdk.openai }; },
}));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

const review: ReviewResult = {
  match_score: 80, match_summary: "A match.",
  keywords: { present: [], missing: [], semantic: [] },
  experience_alignment: { score: 80, explanation: "Aligned." },
  skills_gap: { score: 80, present: [], missing: [] },
  formatting: { score: 80, issues: [] },
  section_completeness: { score: 80, present: [], missing: [] },
  suggestions: [],
};
const plan = {
  headline_verdict: "A match.", consensus: { scores: "Claude 80 · GPT 80", agreement_note: "Agree." },
  lead_with: ["Experience"],
  fix_first: [{ action: "Reframe experience", type: "reframe", grounding: "CV", source: "both" }],
  honest_caveat: null,
};

function claudeResponse(data: unknown) {
  return { model: CLAUDE_MODEL, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(data) }] };
}

beforeEach(() => {
  vi.resetAllMocks();
  sdk.finalMessage.mockResolvedValue(claudeResponse(review));
  sdk.finalResponse.mockResolvedValue({ status: "completed", output_text: JSON.stringify(review) });
  sdk.anthropic.mockReturnValue({
    on: (name: string, callback: (delta: string) => void) => {
      expect(name).toBe("text");
      callback('{"match_score":80,');
    },
    finalMessage: sdk.finalMessage,
  });
  sdk.openai.mockReturnValue({
    on: (name: string, callback: (event: { delta: string }) => void) => {
      expect(name).toBe("response.output_text.delta");
      callback({ delta: '{"match_score":80,' });
    },
    finalResponse: sdk.finalResponse,
  });
});

describe("streaming model adapters", () => {
  it.each(["quick", "thorough"] as ReviewEffort[])("maps %s effort, forwards text and signal, and preserves provider settings", async (effort) => {
    const signal = new AbortController().signal;
    const onText = vi.fn();
    const options = { effort, signal, onText };
    expect(await reviewWithClaude("system", "user", options)).toEqual(review);
    expect(await reviewWithGPT("system", "user", options)).toEqual(review);
    expect(onText.mock.calls).toEqual([[ '{"match_score":80,' ], [ '{"match_score":80,' ]]);
    sdk.finalMessage.mockResolvedValue(claudeResponse(plan));
    expect(await consolidateWithClaude("system", "user", { effort, signal })).toEqual(plan);
    expect(sdk.anthropic).toHaveBeenCalledTimes(2);
    for (const [body, requestOptions] of sdk.anthropic.mock.calls) {
      expect(body).toMatchObject({
        model: CLAUDE_MODEL,
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: effort === "quick" ? "low" : "high", format: { type: "json_schema" } },
      });
      expect(requestOptions.signal).toBe(signal);
    }
    expect(sdk.openai).toHaveBeenCalledWith(expect.objectContaining({
      model: GPT_MODEL, store: false, reasoning: { effort: effort === "quick" ? "low" : "high" },
    }), { signal });
  });

  it("rejects malformed review shapes without logging their bodies", async () => {
    const invalid = { ...review, keywords: { present: "PRIVATE CV TEXT" } };
    sdk.finalMessage.mockResolvedValue(claudeResponse(invalid));
    sdk.finalResponse.mockResolvedValue({ status: "completed", output_text: JSON.stringify(invalid) });
    await expect(reviewWithClaude("system", "user")).rejects.toThrow("Claude returned an unexpected response shape.");
    await expect(reviewWithGPT("system", "user")).rejects.toThrow("GPT returned an unexpected response shape.");
    expect(logger.warn).toHaveBeenCalledWith("claude.unexpected_response_shape", { model: CLAUDE_MODEL });
    expect(logger.warn).toHaveBeenCalledWith("gpt.unexpected_response_shape", { model: GPT_MODEL });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("PRIVATE CV TEXT");
  });

  it("does not expose response text through JSON parsing errors", async () => {
    sdk.finalMessage.mockResolvedValue({ model: CLAUDE_MODEL, content: [{ type: "text", text: "PRIVATE CV TEXT" }] });
    sdk.finalResponse.mockResolvedValue({ status: "completed", output_text: "PRIVATE CV TEXT" });
    await expect(reviewWithClaude("system", "user")).rejects.toThrow("Claude returned invalid JSON.");
    await expect(reviewWithGPT("system", "user")).rejects.toThrow("GPT returned invalid JSON.");
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("PRIVATE CV TEXT");
  });

  it("rejects a malformed consolidation shape", async () => {
    sdk.finalMessage.mockResolvedValue(claudeResponse({ ...plan, honest_caveat: 4 }));
    await expect(consolidateWithClaude("system", "user")).rejects.toThrow("Claude returned an unexpected response shape.");
  });

  it.each([
    null,
    { ...plan, headline_verdict: 5 },
    { ...plan, consensus: { scores: 80, agreement_note: "Agree" } },
    { ...plan, consensus: { scores: "80" } },
    { ...plan, lead_with: [3] },
    { ...plan, fix_first: [{ ...plan.fix_first[0], action: null }] },
    { ...plan, fix_first: [{ ...plan.fix_first[0], type: "invent" }] },
    { ...plan, fix_first: [{ ...plan.fix_first[0], grounding: 5 }] },
    { ...plan, fix_first: [{ ...plan.fix_first[0], source: "other" }] },
    { ...plan, honest_caveat: undefined },
  ])("rejects an invalid consolidation plan %#", (invalid) => {
    expect(isConsolidationPlan(invalid)).toBe(false);
  });
});
