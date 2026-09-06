import OpenAI from "openai";
import { type ReviewResult, reviewJsonSchema, isReviewResult } from "../schema";
import type { ReviewOptions } from "../review-stream";
import { logger } from "../logger";

export const GPT_MODEL = "gpt-5.6-sol";

let client: OpenAI | null = null;

function openAIClient() {
  client ??= new OpenAI();
  return client;
}

export async function reviewWithGPT(
  system: string,
  user: string,
  { onText, signal }: ReviewOptions = {},
): Promise<ReviewResult> {
  const stream = openAIClient().responses.stream({
    model: GPT_MODEL,
    instructions: system,
    input: user,
    reasoning: { effort: "high" },
    // The UI promises the CV is not kept after the review; don't let OpenAI
    // retain the request as stored response state either.
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "review",
        strict: true,
        schema: reviewJsonSchema,
      },
    },
  }, { signal });
  if (onText) stream.on("response.output_text.delta", (event) => onText(event.delta));
  const response = await stream.finalResponse();

  if (response.status === "incomplete") {
    throw new Error(
      "GPT's response was cut off before it finished. Please try again.",
    );
  }

  const text = response.output_text;
  if (!text.trim()) {
    throw new Error("GPT returned an empty response.");
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    logger.warn("gpt.invalid_json", { model: GPT_MODEL });
    throw new Error("GPT returned invalid JSON.");
  }
  if (!isReviewResult(data)) {
    logger.warn("gpt.unexpected_response_shape", { model: GPT_MODEL });
    throw new Error("GPT returned an unexpected response shape.");
  }
  return data;
}
