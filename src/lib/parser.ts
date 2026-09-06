import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { MAX_CV_TEXT_CHARS, assertTextBudget } from "./budgets";

export const MAX_PDF_PAGES = 20;
export const PARSER_TIMEOUT_MS = 10_000;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 256;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Document parsing timed out.")),
        timeoutMs,
      );
    }),
  ]);
}

function assertExtractedTextBudget(
  text: string,
  label: string,
  maxChars: number,
) {
  assertTextBudget(label, text, maxChars);
}

function assertPdfSignature(buffer: Buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Invalid PDF file.");
  }
}

function assertDocxSignature(buffer: Buffer) {
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("Invalid DOCX file.");
  }
}

function findZipEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function assertDocxZipBudget(buffer: Buffer) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error("Invalid DOCX file.");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (entryCount === 0xffff) {
    throw new Error("DOCX files using ZIP64 are not supported.");
  }
  if (entryCount > MAX_DOCX_ENTRIES) {
    throw new Error(
      `DOCX file contains too many internal entries. Please keep it under ${MAX_DOCX_ENTRIES}.`,
    );
  }
  // The central directory must sit immediately before the end-of-central-
  // directory record. Zip readers walk the directory by its byte range, so the
  // declared entry count cannot be trusted on its own.
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd !== eocdOffset) {
    throw new Error("Invalid DOCX file.");
  }

  let offset = centralDirectoryOffset;
  let walkedEntries = 0;
  let uncompressedBytes = 0;

  while (offset < centralDirectoryEnd) {
    if (
      offset + 46 > centralDirectoryEnd ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new Error("Invalid DOCX file.");
    }

    walkedEntries += 1;
    if (walkedEntries > MAX_DOCX_ENTRIES) {
      throw new Error(
        `DOCX file contains too many internal entries. Please keep it under ${MAX_DOCX_ENTRIES}.`,
      );
    }

    uncompressedBytes += buffer.readUInt32LE(offset + 24);
    if (uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `DOCX file expands to too much data. Please keep it under ${Math.floor(
          MAX_DOCX_UNCOMPRESSED_BYTES / 1024 / 1024,
        )} MB uncompressed.`,
      );
    }

    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + filenameLength + extraLength + commentLength;
  }

  if (offset !== centralDirectoryEnd || walkedEntries !== entryCount) {
    throw new Error("Invalid DOCX file.");
  }
}

export interface ExtractTextOptions {
  /** Label used in the "too large" message — defaults to CV wording. */
  label?: string;
  /** Max extracted characters before rejecting — defaults to the CV budget. */
  maxChars?: number;
}

export async function extractText(
  buffer: Buffer,
  filename: string,
  {
    label = "Extracted CV text",
    maxChars = MAX_CV_TEXT_CHARS,
  }: ExtractTextOptions = {},
): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    assertPdfSignature(buffer);
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const info = await withTimeout(
        pdf.getInfo({ parsePageInfo: false }),
        PARSER_TIMEOUT_MS,
      );
      if (info.total > MAX_PDF_PAGES) {
        throw new Error(
          `PDF has too many pages. Please keep it under ${MAX_PDF_PAGES} pages.`,
        );
      }

      const result = await withTimeout(
        // pageJoiner "" stops pdf-parse inserting "-- 1 of 1 --" separators, so
        // a blank PDF yields empty text instead of a fake page marker.
        pdf.getText({
          first: MAX_PDF_PAGES,
          parseHyperlinks: false,
          pageJoiner: "",
        }),
        PARSER_TIMEOUT_MS,
      );
      assertExtractedTextBudget(result.text, label, maxChars);
      return result.text.trim();
    } finally {
      await pdf.destroy().catch(() => undefined);
    }
  }

  if (lower.endsWith(".docx")) {
    assertDocxSignature(buffer);
    assertDocxZipBudget(buffer);
    const result = await withTimeout(
      mammoth.extractRawText({ buffer }),
      PARSER_TIMEOUT_MS,
    );
    assertExtractedTextBudget(result.value, label, maxChars);
    return result.value.trim();
  }

  throw new Error("Unsupported file type. Please upload a PDF or DOCX file.");
}
