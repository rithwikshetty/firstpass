import Anthropic from "@anthropic-ai/sdk";
import { type ReviewResult, reviewJsonSchema } from "../schema";
import { type ConsolidationPlan, consolidationJsonSchema } from "../consolidator";
import { MODEL_OUTPUT_TOKEN_LIMIT } from "../budgets";

let client: Anthropic | null = null;

function anthropicClient() {
  client ??= new Anthropic();
  return client;
}

/** Call Claude with a forced JSON-schema response and parse the text back out. */
async function runJsonSchema<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const response = await anthropicClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: MODEL_OUTPUT_TOKEN_LIMIT,
    system,
    messages: [{ role: "user", content: user }],
    output_config: {
      format: {
        type: "json_schema",
        schema,
      },
    },
  });

  const text = response.content
    .filter(
      (block): block is Extract<typeof block, { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("");

  if (!text.trim()) {
    throw new Error("Claude returned an empty response.");
  }

  return JSON.parse(text) as T;
}

export function reviewWithClaude(
  system: string,
  user: string,
): Promise<ReviewResult> {
  return runJsonSchema<ReviewResult>(system, user, reviewJsonSchema);
}

export function consolidateWithClaude(
  system: string,
  user: string,
): Promise<ConsolidationPlan> {
  return runJsonSchema<ConsolidationPlan>(system, user, consolidationJsonSchema);
}
