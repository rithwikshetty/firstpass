import type { ReviewResult } from "./schema";
import type { ConsolidationPlan } from "./consolidator";

export type ReviewEffort = "quick" | "thorough";
export type ReviewModel = "claude" | "gpt";
export type ReviewStage = keyof ReviewResult;

export interface ReviewOptions {
  effort?: ReviewEffort;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export type ReviewEvent =
  | { type: "stage"; model: ReviewModel; stage: ReviewStage }
  | { type: "review"; model: ReviewModel; data: ReviewResult }
  | { type: "review"; model: ReviewModel; error: string }
  | { type: "consolidation"; data: ConsolidationPlan }
  | { type: "consolidation"; error: string }
  | { type: "ping" }
  | { type: "done" };
