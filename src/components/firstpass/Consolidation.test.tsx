import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Consolidation } from "./Consolidation";
import type { ConsolidationState } from "./types";
import type { ConsolidationPlan } from "@/lib/consolidator";

function plan(overrides: Partial<ConsolidationPlan> = {}): ConsolidationPlan {
  return {
    headline_verdict: "Strong fit — the gap is wording, not substance.",
    consensus: {
      scores: "Claude 82 · GPT 76",
      agreement_note: "Both agree it's a strong match.",
    },
    fix_first: [
      { action: "Name RAG explicitly if you used it.", type: "add_if_true", grounding: "gap — not stated in CV", source: "both" },
      { action: "Reframe the Assist chatbot bullet.", type: "reframe", grounding: "CV: global AI chatbot, Assist", source: "claude" },
      { action: "Use a single-column, ATS-friendly layout.", type: "format", grounding: "CV uses two columns", source: "both" },
    ],
    honest_caveat: null,
    ...overrides,
  };
}

const state = (over: Partial<ConsolidationState> = {}): ConsolidationState => ({
  data: null,
  error: null,
  loading: false,
  ...over,
});

describe("Consolidation", () => {
  it("renders the verdict, both scores, and a typed fix list", () => {
    render(<Consolidation state={state({ data: plan() })} />);
    expect(screen.getByText(/the gap is wording/i)).toBeInTheDocument();
    expect(screen.getByText(/Claude 82 · GPT 76/)).toBeInTheDocument();
    expect(screen.getByText(/Name RAG explicitly/)).toBeInTheDocument();
    expect(screen.getByText("Add if true")).toBeInTheDocument();
    expect(screen.getByText("Reframe")).toBeInTheDocument();
    expect(screen.getByText(/gap — not stated in CV/)).toBeInTheDocument();
  });

  it("shows an honest caveat when present", () => {
    render(
      <Consolidation
        state={state({ data: plan({ honest_caveat: "This role needs a PhD you don't list." }) })}
      />,
    );
    expect(screen.getByText(/needs a PhD/i)).toBeInTheDocument();
  });

  it("shows a loading state while consolidating", () => {
    render(<Consolidation state={state({ loading: true })} />);
    expect(screen.getByText(/reading both screeners/i)).toBeInTheDocument();
  });

  it("falls back quietly to a one-line note on error", () => {
    render(<Consolidation state={state({ error: "boom" })} />);
    expect(screen.getByText(/see both screeners in full below/i)).toBeInTheDocument();
  });

  it("renders nothing when idle and empty", () => {
    const { container } = render(<Consolidation state={state()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
