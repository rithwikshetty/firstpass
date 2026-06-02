import { describe, it, expect } from "vitest";
import {
  BudgetError,
  MAX_PROMPT_TOKENS,
  assertPromptBudget,
  assertTextBudget,
} from "./budgets";

describe("prompt and input budgets", () => {
  it("rejects text over a named character budget", () => {
    expect(() => assertTextBudget("Job description", "abcdef", 5)).toThrow(
      BudgetError,
    );
  });

  it("rejects prompts over the estimated token budget", () => {
    expect(() =>
      assertPromptBudget("", "x".repeat(MAX_PROMPT_TOKENS * 4 + 1)),
    ).toThrow(BudgetError);
  });

  it("allows prompts inside the estimated token budget", () => {
    expect(() => assertPromptBudget("system", "short user prompt")).not.toThrow();
  });
});
