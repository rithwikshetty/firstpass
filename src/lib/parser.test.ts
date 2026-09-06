import { describe, it, expect, beforeEach, vi } from "vitest";

const parserMocks = vi.hoisted(() => ({
  pdfTotal: 1,
  pdfText: "Parsed PDF text",
  pdfGetText: vi.fn(),
  pdfDestroy: vi.fn(),
  mammothExtractRawText: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getInfo() {
      return Promise.resolve({ total: parserMocks.pdfTotal });
    }

    getText(params: unknown) {
      parserMocks.pdfGetText(params);
      return Promise.resolve({ text: parserMocks.pdfText });
    }

    destroy() {
      parserMocks.pdfDestroy();
      return Promise.resolve();
    }
  },
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: parserMocks.mammothExtractRawText,
  },
}));

import {
  MAX_DOCX_UNCOMPRESSED_BYTES,
  MAX_PDF_PAGES,
  extractText,
} from "./parser";
import { BudgetError, MAX_CV_TEXT_CHARS } from "./budgets";

function pdfBuffer() {
  return Buffer.from("%PDF-1.7\nbody");
}

function docxBuffer(uncompressedBytes: number, entries = 1) {
  const centralDirectoryOffset = 30;
  const centralDirectorySize = entries * 46;
  const eocdOffset = centralDirectoryOffset + centralDirectorySize;
  const buffer = Buffer.alloc(eocdOffset + 22);

  buffer.writeUInt32LE(0x04034b50, 0);

  for (let entry = 0; entry < entries; entry += 1) {
    const offset = centralDirectoryOffset + entry * 46;
    buffer.writeUInt32LE(0x02014b50, offset);
    buffer.writeUInt32LE(uncompressedBytes, offset + 24);
  }

  buffer.writeUInt32LE(0x06054b50, eocdOffset);
  buffer.writeUInt16LE(entries, eocdOffset + 8);
  buffer.writeUInt16LE(entries, eocdOffset + 10);
  buffer.writeUInt32LE(centralDirectorySize, eocdOffset + 12);
  buffer.writeUInt32LE(centralDirectoryOffset, eocdOffset + 16);

  return buffer;
}

describe("extractText parser budgets", () => {
  beforeEach(() => {
    parserMocks.pdfTotal = 1;
    parserMocks.pdfText = "Parsed PDF text";
    parserMocks.pdfGetText.mockClear();
    parserMocks.pdfDestroy.mockClear();
    parserMocks.mammothExtractRawText.mockReset();
    parserMocks.mammothExtractRawText.mockResolvedValue({ value: "Parsed DOCX text" });
  });

  it("rejects PDFs over the page budget before extracting text", async () => {
    parserMocks.pdfTotal = MAX_PDF_PAGES + 1;

    await expect(extractText(pdfBuffer(), "cv.pdf")).rejects.toThrow(
      "too many pages",
    );
    expect(parserMocks.pdfGetText).not.toHaveBeenCalled();
    expect(parserMocks.pdfDestroy).toHaveBeenCalledOnce();
  });

  it("rejects extracted text over the character budget", async () => {
    parserMocks.pdfText = "x".repeat(MAX_CV_TEXT_CHARS + 1);

    await expect(extractText(pdfBuffer(), "cv.pdf")).rejects.toBeInstanceOf(
      BudgetError,
    );
    expect(parserMocks.pdfDestroy).toHaveBeenCalledOnce();
  });

  it("disables pdf-parse page separators so a blank PDF yields no text", async () => {
    parserMocks.pdfText = "\n\n";

    await expect(extractText(pdfBuffer(), "blank.pdf")).resolves.toBe("");
    expect(parserMocks.pdfGetText).toHaveBeenCalledWith(
      expect.objectContaining({ pageJoiner: "" }),
    );
  });

  it("rejects a DOCX whose declared entry count disagrees with its central directory", async () => {
    const buffer = docxBuffer(1024, 2);
    const eocdOffset = buffer.length - 22;
    buffer.writeUInt16LE(0, eocdOffset + 8);
    buffer.writeUInt16LE(0, eocdOffset + 10);

    await expect(extractText(buffer, "cv.docx")).rejects.toThrow("Invalid DOCX file.");
    expect(parserMocks.mammothExtractRawText).not.toHaveBeenCalled();
  });

  it("rejects a DOCX whose central directory does not end at the EOCD record", async () => {
    const buffer = docxBuffer(1024, 2);
    const eocdOffset = buffer.length - 22;
    buffer.writeUInt32LE(46, eocdOffset + 12);

    await expect(extractText(buffer, "cv.docx")).rejects.toThrow("Invalid DOCX file.");
    expect(parserMocks.mammothExtractRawText).not.toHaveBeenCalled();
  });

  it("rejects DOCX files that expand beyond the zip budget", async () => {
    await expect(
      extractText(
        docxBuffer(MAX_DOCX_UNCOMPRESSED_BYTES + 1),
        "cv.docx",
      ),
    ).rejects.toThrow("expands to too much data");
    expect(parserMocks.mammothExtractRawText).not.toHaveBeenCalled();
  });

  it("returns trimmed text for a DOCX within budget", async () => {
    parserMocks.mammothExtractRawText.mockResolvedValue({
      value: "  Parsed DOCX text  ",
    });

    await expect(extractText(docxBuffer(1024), "cv.docx")).resolves.toBe(
      "Parsed DOCX text",
    );
  });
});
