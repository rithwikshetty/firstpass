import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Analyzing } from "./Analyzing";

describe("Analyzing", () => {
  it("shows the screening state with the file being reviewed", () => {
    render(<Analyzing fileName="resume.pdf" />);
    expect(screen.getByText(/Screening/)).toBeInTheDocument();
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
  });
});
