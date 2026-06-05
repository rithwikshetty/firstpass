import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MAX_CV_FILES,
  MAX_CV_TEXT_CHARS,
  MAX_JD_FILES,
  MAX_JOB_DESCRIPTION_CHARS,
} from "@/lib/budgets";

vi.mock("@/lib/parser", () => ({ extractText: vi.fn() }));

import { extractText } from "@/lib/parser";
import { resolveCv, resolveJobDescription, UploadError } from "./uploads";

function file(name: string, size = 16): File {
  return {
    name,
    size,
    arrayBuffer: async () => new ArrayBuffer(size),
  } as File;
}

function form(fields: {
  cv?: File[];
  jobFile?: File[];
  jobDescription?: string;
}): FormData {
  const { cv = [], jobFile = [], jobDescription } = fields;
  return {
    get: (name: string) =>
      name === "jobDescription" && jobDescription !== undefined
        ? jobDescription
        : null,
    getAll: (name: string) =>
      name === "cv"
        ? cv
        : name === "jobFile"
          ? jobFile
          : ([] as FormDataEntryValue[]),
  } as unknown as FormData;
}

describe("resolveCv", () => {
  beforeEach(() => {
    vi.mocked(extractText).mockReset();
  });

  it("combines text from multiple CV files in order", async () => {
    vi.mocked(extractText)
      .mockResolvedValueOnce("First CV")
      .mockResolvedValueOnce("Second CV");

    const cv = await resolveCv(form({ cv: [file("a.pdf"), file("b.docx")] }));

    expect(cv).toBe("First CV\n\nSecond CV");
  });

  it("requires at least one CV file", async () => {
    await expect(resolveCv(form({ cv: [] }))).rejects.toMatchObject({
      status: 400,
    });
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects more than the allowed number of files before parsing", async () => {
    const many = Array.from({ length: MAX_CV_FILES + 1 }, (_, i) =>
      file(`cv${i}.pdf`),
    );

    await expect(
      resolveCv(form({ cv: many })),
    ).rejects.toBeInstanceOf(UploadError);
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects a file over the per-file size limit before parsing", async () => {
    const huge = file("big.pdf", 9 * 1024 * 1024);

    await expect(resolveCv(form({ cv: [huge] }))).rejects.toMatchObject({
      status: 413,
    });
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects when the files yield no extractable text", async () => {
    vi.mocked(extractText).mockResolvedValue("   ");

    await expect(
      resolveCv(form({ cv: [file("scan.pdf")] })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects when the combined text exceeds the budget", async () => {
    vi.mocked(extractText).mockResolvedValue(
      "x".repeat(MAX_CV_TEXT_CHARS + 1),
    );

    await expect(
      resolveCv(form({ cv: [file("long.pdf")] })),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe("resolveJobDescription", () => {
  beforeEach(() => {
    vi.mocked(extractText).mockReset();
  });

  it("returns trimmed pasted text and never parses when no files attach", async () => {
    const jd = await resolveJobDescription(
      form({ jobDescription: "  Senior role  " }),
    );

    expect(jd).toBe("Senior role");
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("combines pasted text with extracted file text", async () => {
    vi.mocked(extractText).mockResolvedValue("From the PDF");

    const jd = await resolveJobDescription(
      form({ jobDescription: "Pasted", jobFile: [file("role.pdf")] }),
    );

    expect(jd).toBe("Pasted\n\nFrom the PDF");
    expect(vi.mocked(extractText)).toHaveBeenCalledOnce();
  });

  it("combines multiple files in order", async () => {
    vi.mocked(extractText)
      .mockResolvedValueOnce("First file")
      .mockResolvedValueOnce("Second file");

    const jd = await resolveJobDescription(
      form({ jobFile: [file("a.pdf"), file("b.docx")] }),
    );

    expect(jd).toBe("First file\n\nSecond file");
  });

  it("rejects when neither text nor files are provided", async () => {
    await expect(resolveJobDescription(form({}))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects more than the allowed number of files before parsing", async () => {
    const many = Array.from({ length: MAX_JD_FILES + 1 }, (_, i) =>
      file(`f${i}.pdf`),
    );

    await expect(
      resolveJobDescription(form({ jobFile: many })),
    ).rejects.toBeInstanceOf(UploadError);
    expect(vi.mocked(extractText)).not.toHaveBeenCalled();
  });

  it("rejects when the combined text exceeds the budget", async () => {
    vi.mocked(extractText).mockResolvedValue(
      "x".repeat(MAX_JOB_DESCRIPTION_CHARS + 1),
    );

    await expect(
      resolveJobDescription(form({ jobFile: [file("big.pdf")] })),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("wraps a parse failure with the file name", async () => {
    vi.mocked(extractText).mockRejectedValue(new Error("Invalid PDF file."));

    await expect(
      resolveJobDescription(form({ jobFile: [file("broken.pdf")] })),
    ).rejects.toThrow(/broken\.pdf/);
  });
});
