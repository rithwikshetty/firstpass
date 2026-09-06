import Anthropic from "@anthropic-ai/sdk";
import { type ReviewResult, reviewJsonSchema } from "../schema";
import { type ConsolidationPlan, consolidationJsonSchema } from "../consolidator";
import { logger } from "../logger";

export const CLAUDE_MODEL = "claude-opus-5";

let client: Anthropic | null = null;

function anthropicClient() {
  client ??= new Anthropic();
  return client;
}

/**
 * Generous output ceiling. The reviews are a few thousand tokens at most, but
 * a tight cap silently truncates the JSON mid-object on keyword-heavy CVs.
 * On Claude Opus 5 thinking is on by default and counts against this cap too.
 * Outputs this large require streaming, so the call below streams and then
 * collects the final message.
 */
const MAX_OUTPUT_TOKENS = 64_000;

/** Call Claude with a forced JSON-schema response and parse the text back out. */
async function runJsonSchema<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
): Promise<T> {
  // Claude Opus 5 can decline a request on safety grounds (stop_reason
  // "refusal"). `fallbacks: "default"` re-runs a declined request server-side
  // on Anthropic's recommended substitute model instead of failing the review.
  const stream = anthropicClient().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
    output_config: {
      format: {
        type: "json_schema",
        schema,
      },
    },
  });

  const response = await stream.finalMessage();

  if (response.model !== CLAUDE_MODEL) {
    logger.info("claude.fallback_served", {
      requestedModel: CLAUDE_MODEL,
      servedModel: response.model,
    });
  }

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category;
    logger.warn("claude.refusal", {
      model: response.model,
      category: category ?? "unknown",
      explanation: response.stop_details?.explanation ?? null,
    });
    throw new Error("Claude declined to review this content.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Claude's response was cut off before it finished. Please try again.",
    );
  }

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
