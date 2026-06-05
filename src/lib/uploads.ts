import { extractText } from "./parser";
import {
  BudgetError,
  MAX_CV_FILES,
  MAX_CV_FILE_BYTES,
  MAX_CV_TEXT_CHARS,
  MAX_JD_FILES,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_JOB_FILE_BYTES,
  assertTextBudget,
} from "./budgets";
import {
  elapsedMs,
  logger,
  serializeError,
  type LogFields,
} from "./logger";

/** An upload problem we can show the user verbatim, carrying an HTTP status. */
export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).name === "string" &&
    typeof (value as File).size === "number"
  );
}

function fileExtension(filename: string) {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "none" : lower.slice(dot);
}

function fileStats(files: File[]) {
  return {
    fileCount: files.length,
    totalFileBytes: files.reduce((total, file) => total + file.size, 0),
    fileExtensions: [...new Set(files.map((file) => fileExtension(file.name)))],
  };
}

interface UploadConfig {
  /** FormData field holding the uploaded file(s). */
  fileField: string;
  /** Optional FormData field holding pasted text, merged ahead of the files. */
  textField?: string;
  /** Human label used in messages and the parser's "too large" error. */
  label: string;
  /** Message shown when nothing is provided (no text and no files). */
  emptyMessage: string;
  /** Maximum number of files. */
  maxFiles: number;
  /** Maximum bytes per file. */
  maxFileBytes: number;
  /** Maximum combined extracted characters. */
  maxChars: number;
}

/**
 * The single primitive both upload sections share: pull the file(s) for a field
 * (and any pasted text), parse each PDF/DOCX server-side, and combine everything
 * into one string. Deep module — all the validation lives here so the resolvers
 * and routes stay thin.
 */
async function resolveUploadedText(
  formData: FormData,
  config: UploadConfig,
  logContext: LogFields = {},
): Promise<string> {
  const startedAt = Date.now();
  const pasted = config.textField ? formData.get(config.textField) : null;
  const pastedText = typeof pasted === "string" ? pasted.trim() : "";

  const files = formData
    .getAll(config.fileField)
    .filter((value): value is File => isUploadedFile(value) && value.size > 0);
  const stats = fileStats(files);

  logger.info("upload.resolve.start", {
    ...logContext,
    uploadLabel: config.label,
    fileField: config.fileField,
    pastedTextChars: pastedText.length,
    ...stats,
  });

  if (!pastedText && files.length === 0) {
    logger.warn("upload.resolve.rejected", {
      ...logContext,
      uploadLabel: config.label,
      reason: "missing_input",
      status: 400,
      durationMs: elapsedMs(startedAt),
    });
    throw new UploadError(config.emptyMessage, 400);
  }
  if (files.length > config.maxFiles) {
    logger.warn("upload.resolve.rejected", {
      ...logContext,
      uploadLabel: config.label,
      reason: "too_many_files",
      status: 400,
      fileCount: files.length,
      maxFiles: config.maxFiles,
      durationMs: elapsedMs(startedAt),
    });
    throw new UploadError(
      `Please attach at most ${config.maxFiles} files.`,
      400,
    );
  }

  const parts: string[] = [];
  if (pastedText) parts.push(pastedText);

  for (const [fileIndex, file] of files.entries()) {
    const extension = fileExtension(file.name);
    if (file.size > config.maxFileBytes) {
      logger.warn("upload.file.rejected", {
        ...logContext,
        uploadLabel: config.label,
        reason: "file_too_large",
        status: 413,
        fileIndex,
        fileBytes: file.size,
        maxFileBytes: config.maxFileBytes,
        extension,
      });
      throw new UploadError(
        `“${file.name}” is too large — please keep each file under ${Math.floor(
          config.maxFileBytes / 1024 / 1024,
        )} MB.`,
        413,
      );
    }

    let text: string;
    const parseStartedAt = Date.now();
    logger.info("upload.file.parse.start", {
      ...logContext,
      uploadLabel: config.label,
      fileIndex,
      fileBytes: file.size,
      extension,
    });
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractText(buffer, file.name, {
        label: config.label,
        maxChars: config.maxChars,
      });
      logger.info("upload.file.parse.finish", {
        ...logContext,
        uploadLabel: config.label,
        fileIndex,
        fileBytes: file.size,
        extension,
        extractedChars: text.length,
        durationMs: elapsedMs(parseStartedAt),
      });
    } catch (err) {
      logger.warn("upload.file.parse_failed", {
        ...logContext,
        uploadLabel: config.label,
        fileIndex,
        fileBytes: file.size,
        extension,
        durationMs: elapsedMs(parseStartedAt),
        error: serializeError(err),
      });
      if (err instanceof BudgetError) {
        throw new UploadError(err.message, err.status);
      }
      const msg = err instanceof Error ? err.message : "Unknown parse error";
      throw new UploadError(`Could not read “${file.name}”: ${msg}`, 400);
    }

    if (text.trim()) parts.push(text.trim());
  }

  const combined = parts.join("\n\n").trim();
  if (!combined) {
    logger.warn("upload.resolve.rejected", {
      ...logContext,
      uploadLabel: config.label,
      reason: "empty_extracted_text",
      status: 400,
      durationMs: elapsedMs(startedAt),
    });
    throw new UploadError(
      `No text found in the ${config.label.toLowerCase()} — the file may be image-based or empty.`,
      400,
    );
  }

  try {
    assertTextBudget(config.label, combined, config.maxChars);
  } catch (err) {
    if (err instanceof BudgetError) {
      logger.warn("upload.resolve.rejected", {
        ...logContext,
        uploadLabel: config.label,
        reason: "text_budget_exceeded",
        status: err.status,
        combinedChars: combined.length,
        maxChars: config.maxChars,
        durationMs: elapsedMs(startedAt),
      });
      throw new UploadError(err.message, err.status);
    }
    throw err;
  }

  logger.info("upload.resolve.finish", {
    ...logContext,
    uploadLabel: config.label,
    combinedChars: combined.length,
    partCount: parts.length,
    durationMs: elapsedMs(startedAt),
  });

  return combined;
}

/** Resolve the CV section: one or more uploaded CV / supporting documents. */
export function resolveCv(
  formData: FormData,
  logContext?: LogFields,
): Promise<string> {
  return resolveUploadedText(formData, {
    fileField: "cv",
    label: "CV",
    emptyMessage: "A CV file is required.",
    maxFiles: MAX_CV_FILES,
    maxFileBytes: MAX_CV_FILE_BYTES,
    maxChars: MAX_CV_TEXT_CHARS,
  }, logContext);
}

/** Resolve the job-description section: pasted text and/or uploaded files. */
export function resolveJobDescription(
  formData: FormData,
  logContext?: LogFields,
): Promise<string> {
  return resolveUploadedText(formData, {
    fileField: "jobFile",
    textField: "jobDescription",
    label: "Job description",
    emptyMessage: "Paste the job description or attach at least one file.",
    maxFiles: MAX_JD_FILES,
    maxFileBytes: MAX_JOB_FILE_BYTES,
    maxChars: MAX_JOB_DESCRIPTION_CHARS,
  }, logContext);
}
