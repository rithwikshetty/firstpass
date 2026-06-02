import type { ReviewResult } from "@/lib/schema";
import type { ConsolidationPlan } from "@/lib/consolidator";

export type ModelKey = "claude" | "gpt";
export type Screen = "input" | "analyzing" | "results";

export interface ModelResult {
  data: ReviewResult | null;
  error: string | null;
  loading: boolean;
}

export const MODELS: ModelKey[] = ["claude", "gpt"];

export const MODEL_LABEL: Record<ModelKey, string> = {
  claude: "Claude",
  gpt: "GPT",
};

export const MODEL_SUBLABEL: Record<ModelKey, string> = {
  claude: "opus 4.8",
  gpt: "gpt 5.5",
};

export const emptyResult: ModelResult = {
  data: null,
  error: null,
  loading: false,
};

/** The consolidation lead — one honest plan built from both reviews. */
export interface ConsolidationState {
  data: ConsolidationPlan | null;
  error: string | null;
  loading: boolean;
}

export const emptyConsolidation: ConsolidationState = {
  data: null,
  error: null,
  loading: false,
};
