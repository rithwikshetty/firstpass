import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Analyzing } from "./Analyzing";

describe("Analyzing", () => {
  it("shows the screening state with the file being reviewed", () => {
    render(<Analyzing fileName="resume.pdf" stages={{}} />);
    expect(screen.getByText(/Screening/)).toBeInTheDocument();
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Reading your CV")).toHaveLength(2);
  });
  it("shows each model's current stage", () => {
    const { rerender } = render(<Analyzing fileName="cv.pdf" stages={{ claude: "keywords", gpt: "experience_alignment" }} />);
    expect(screen.getByLabelText("claude review stage")).toHaveTextContent("Matching keywords");
    expect(screen.getByLabelText("gpt review stage")).toHaveTextContent("Checking experience");
    rerender(<Analyzing fileName="cv.pdf" stages={{ claude: "suggestions", gpt: "formatting" }} />);
    expect(screen.getByLabelText("claude review stage")).toHaveTextContent("Writing suggestions");
    expect(screen.getByLabelText("gpt review stage")).toHaveTextContent("Checking formatting");
  });
});
