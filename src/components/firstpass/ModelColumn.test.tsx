import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelColumn } from "./ModelColumn";
import type { ReviewResult } from "@/lib/schema";
import type { ModelResult } from "./types";

function review(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    match_score: 81,
    match_summary: "Strong alignment with the role.",
    keywords: {
      present: ["RAG", "vector databases"],
      missing: ["Kubernetes"],
      semantic: [{ term: "agentic systems", match: "built autonomous agents" }],
    },
    experience_alignment: { score: 78, explanation: "Six years of backend work." },
    skills_gap: { score: 74, present: ["PyTorch"], missing: ["Terraform"] },
    formatting: { score: 88, issues: ["Two-column layout may confuse parsers"] },
    section_completeness: { score: 80, present: ["Experience"], missing: ["Certifications"] },
    suggestions: ["Add a contact information block at the top."],
    ...overrides,
  };
}

const ok = (data: ReviewResult): ModelResult => ({ data, error: null, loading: false });
const failed = (error: string): ModelResult => ({ data: null, error, loading: false });

describe("ModelColumn", () => {
  it("renders the model's own score, keywords, and suggestions", () => {
    render(<ModelColumn model="claude" result={ok(review())} />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByText("RAG")).toBeInTheDocument(); // present keyword
    expect(screen.getByText("Kubernetes")).toBeInTheDocument(); // missing keyword
    expect(
      screen.getByText("Add a contact information block at the top."),
    ).toBeInTheDocument();
  });

  it("shows an error inside the pane when the model failed, with no score", () => {
    render(<ModelColumn model="gpt" result={failed("The model timed out.")} />);
    expect(screen.getByText(/GPT could/)).toBeInTheDocument();
    expect(screen.getByText("The model timed out.")).toBeInTheDocument();
    expect(screen.queryByText("81")).not.toBeInTheDocument();
  });
});
