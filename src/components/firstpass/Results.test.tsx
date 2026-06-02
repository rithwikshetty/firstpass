import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Results } from "./Results";
import type { ReviewResult } from "@/lib/schema";
import type { ModelResult } from "./types";

function review(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    match_score: 81,
    match_summary: "Strong alignment with the role.",
    keywords: { present: ["RAG"], missing: ["Kubernetes"], semantic: [] },
    experience_alignment: { score: 78, explanation: "Six years of backend work." },
    skills_gap: { score: 74, present: ["PyTorch"], missing: ["Terraform"] },
    formatting: { score: 88, issues: ["Two-column layout"] },
    section_completeness: { score: 80, present: ["Experience"], missing: ["Certifications"] },
    suggestions: ["Add a contact information block."],
    ...overrides,
  };
}

const ok = (data: ReviewResult): ModelResult => ({ data, error: null, loading: false });
const failed = (error: string): ModelResult => ({ data: null, error, loading: false });
const noop = () => {};

describe("Results", () => {
  it("renders both models side by side and merges nothing", () => {
    render(
      <Results
        fileName="resume.pdf"
        onReset={noop}
        results={{
          claude: ok(review({ match_score: 81, match_summary: "Claude's read of the CV." })),
          gpt: ok(review({ match_score: 64, match_summary: "GPT's read of the CV." })),
        }}
      />,
    );

    // both models present, each with its own score and words
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("GPT")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText(/Claude's read of the CV/)).toBeInTheDocument();
    expect(screen.getByText(/GPT's read of the CV/)).toBeInTheDocument();
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();

    // none of the removed synthesis/merge UI should appear
    expect(screen.queryByText(/fix these first/i)).toBeNull();
    expect(screen.queryByText(/judgment calls/i)).toBeNull();
    expect(screen.queryByText(/they agree on/i)).toBeNull();
    expect(screen.queryByText(/overall standing/i)).toBeNull();
    expect(screen.queryByText(/found by both/i)).toBeNull();
  });

  it("when one model fails, shows the other's review and the failure in its own pane", () => {
    render(
      <Results
        fileName="resume.pdf"
        onReset={noop}
        results={{
          claude: ok(review({ match_score: 81, match_summary: "Claude's read." })),
          gpt: failed("The model timed out."),
        }}
      />,
    );

    expect(screen.getByText("81")).toBeInTheDocument(); // Claude rendered fully
    expect(screen.getByText(/Claude's read/)).toBeInTheDocument();
    expect(screen.getByText(/GPT could/)).toBeInTheDocument(); // GPT error, in its pane
    expect(screen.getByText("The model timed out.")).toBeInTheDocument();
    expect(screen.queryByText(/both screeners failed/i)).toBeNull();
  });

  it("when both models fail, shows the both-failed message with both errors", () => {
    render(
      <Results
        fileName="resume.pdf"
        onReset={noop}
        results={{
          claude: failed("Claude 500 error."),
          gpt: failed("GPT 500 error."),
        }}
      />,
    );

    expect(screen.getByText(/both screeners failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Claude 500 error/)).toBeInTheDocument();
    expect(screen.getByText(/GPT 500 error/)).toBeInTheDocument();
  });
});
