export const MAX_JOB_DESCRIPTION_CHARS = 20_000;
export const MAX_CV_TEXT_CHARS = 120_000;
export const MAX_REVIEW_JSON_CHARS = 60_000;
export const MAX_PROMPT_TOKENS = 50_000;
export const MODEL_OUTPUT_TOKEN_LIMIT = 4096;

export class BudgetError extends Error {
  status = 413;
}

export function assertTextBudget(
  label: string,
  value: string,
  maxChars: number,
) {
  if (value.length > maxChars) {
    throw new BudgetError(
      `${label} is too large. Please keep it under ${maxChars.toLocaleString()} characters.`,
    );
  }
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function assertPromptBudget(system: string, user: string) {
  const estimatedTokens = estimateTokenCount(system) + estimateTokenCount(user);
  if (estimatedTokens > MAX_PROMPT_TOKENS) {
    throw new BudgetError(
      `The combined prompt is too large. Please shorten the CV or job description.`,
    );
  }
}
