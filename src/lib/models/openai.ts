import OpenAI from "openai";
import { type ReviewResult, reviewJsonSchema } from "../schema";

export const GPT_MODEL = "gpt-5.6-sol";

let client: OpenAI | null = null;

function openAIClient() {
  client ??= new OpenAI();
  return client;
}

export async function reviewWithGPT(
  system: string,
  user: string
): Promise<ReviewResult> {
  const response = await openAIClient().responses.create({
    model: GPT_MODEL,
    instructions: system,
    input: user,
    text: {
      format: {
        type: "json_schema",
        name: "review",
        strict: true,
        schema: reviewJsonSchema,
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error(
      "GPT's response was cut off before it finished. Please try again.",
    );
  }

  const text = response.output_text;
  if (!text.trim()) {
    throw new Error("GPT returned an empty response.");
  }

  return JSON.parse(text) as ReviewResult;
}
