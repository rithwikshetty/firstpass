import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileUpload } from "./FileUpload";

function makeFile(name: string): File {
  return new File(["data"], name);
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("expected a file input");
  return input as HTMLInputElement;
}

describe("FileUpload", () => {
  it("shows the empty-state prompt when no files are attached", () => {
    render(
      <FileUpload files={[]} onFilesChange={() => {}} max={5} prompt="Drop your CV" />,
    );

    expect(screen.getByText("Drop your CV")).toBeInTheDocument();
  });

  it("adds accepted PDF/DOCX files when selected", () => {
    const onFilesChange = vi.fn();
    const { container } = render(
      <FileUpload files={[]} onFilesChange={onFilesChange} max={5} prompt="Drop" />,
    );

    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("cv.pdf")] },
    });

    expect(onFilesChange).toHaveBeenCalledTimes(1);
    expect(onFilesChange.mock.calls[0][0].map((f: File) => f.name)).toEqual([
      "cv.pdf",
    ]);
  });

  it("ignores files with unsupported extensions", () => {
    const onFilesChange = vi.fn();
    const { container } = render(
      <FileUpload files={[]} onFilesChange={onFilesChange} max={5} prompt="Drop" />,
    );

    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("photo.png")] },
    });

    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it("lists attached files and removes one when its control is clicked", () => {
    const onFilesChange = vi.fn();
    render(
      <FileUpload
        files={[makeFile("a.pdf"), makeFile("b.docx")]}
        onFilesChange={onFilesChange}
        max={5}
        prompt="Drop"
      />,
    );

    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.docx")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove a\.pdf/i }));

    expect(onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "b.docx" }),
    ]);
  });

  it("hides the add affordance once max files are attached", () => {
    const { container } = render(
      <FileUpload
        files={[makeFile("a.pdf")]}
        onFilesChange={() => {}}
        max={1}
        prompt="Drop me"
      />,
    );

    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText("Drop me")).not.toBeInTheDocument();
  });
});
