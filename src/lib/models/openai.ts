import OpenAI from "openai";
import { type ReviewResult, reviewJsonSchema } from "../schema";
import { MODEL_OUTPUT_TOKEN_LIMIT } from "../budgets";

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
    model: "gpt-5.5",
    instructions: system,
    input: user,
    max_output_tokens: MODEL_OUTPUT_TOKEN_LIMIT,
    text: {
      format: {
        type: "json_schema",
        name: "review",
        strict: true,
        schema: reviewJsonSchema,
      },
    },
  });

  return JSON.parse(response.output_text) as ReviewResult;
}
