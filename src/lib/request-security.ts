import { NextRequest, NextResponse } from "next/server";
import { logger, serializeError, type LogFields } from "./logger";

function allowedOrigins(request: NextRequest): string[] {
  const configuredOrigins = process.env.APP_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : [request.nextUrl.origin];
}

export function rejectCrossOrigin(
  request: NextRequest,
  logContext: LogFields = {},
): NextResponse | null {
  const origin = request.headers?.get("origin");
  if (!origin) return null;

  try {
    const requestOrigin = new URL(origin).origin;
    const allowed = allowedOrigins(request).map((allowedOrigin) =>
      new URL(allowedOrigin).origin
    );

    if (!allowed.includes(requestOrigin)) {
      logger.warn("request.security.cross_origin_rejected", {
        ...logContext,
        origin: requestOrigin,
        allowedOriginCount: allowed.length,
      });
      return NextResponse.json(
        { error: "Cross-origin requests are not allowed." },
        { status: 403 },
      );
    }
  } catch {
    logger.warn("request.security.invalid_origin", {
      ...logContext,
      origin,
    });
    return NextResponse.json(
      { error: "Invalid Origin header." },
      { status: 400 },
    );
  }

  return null;
}

export function rejectOversizedContentLength(
  request: NextRequest,
  maxBytes: number,
  logContext: LogFields = {},
): NextResponse | null {
  const rawContentLength = request.headers?.get("content-length");
  if (!rawContentLength) return null;

  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    logger.warn("request.security.invalid_content_length", {
      ...logContext,
      rawContentLength,
      maxBytes,
    });
    return NextResponse.json(
      { error: "Invalid Content-Length header." },
      { status: 400 },
    );
  }

  if (contentLength > maxBytes) {
    logger.warn("request.security.oversized_request", {
      ...logContext,
      contentLength,
      maxBytes,
    });
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  return null;
}

/** A body we could not accept, carrying the HTTP status to return. */
export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

/**
 * Buffer the request body while counting bytes. Content-Length is optional
 * (chunked uploads omit it), so the cap has to be enforced on the stream
 * itself. Returns null when the request carries no body stream.
 */
async function readBodyWithLimit(
  request: NextRequest,
  maxBytes: number,
  logContext: LogFields,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const body = request.body;
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        logger.warn("request.security.oversized_body", {
          ...logContext,
          receivedBytes: total,
          maxBytes,
        });
        throw new RequestBodyError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    merged.set(chunk, position);
    position += chunk.byteLength;
  }
  return merged;
}

/** Read a multipart/form-data body with a hard byte cap and a 400 on malformed input. */
export async function readRequestFormData(
  request: NextRequest,
  maxBytes: number,
  logContext: LogFields = {},
): Promise<FormData> {
  const bytes = await readBodyWithLimit(request, maxBytes, logContext);
  try {
    if (bytes === null) return await request.formData();
    return await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (err) {
    logger.warn("request.security.malformed_body", {
      ...logContext,
      bodyType: "form-data",
      error: serializeError(err),
    });
    throw new RequestBodyError("Could not read the request body.", 400);
  }
}

/** Read a JSON body with a hard byte cap and a 400 on malformed input. */
export async function readRequestJson(
  request: NextRequest,
  maxBytes: number,
  logContext: LogFields = {},
): Promise<unknown> {
  const bytes = await readBodyWithLimit(request, maxBytes, logContext);
  try {
    if (bytes === null) return await request.json();
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (err) {
    logger.warn("request.security.malformed_body", {
      ...logContext,
      bodyType: "json",
      error: serializeError(err),
    });
    throw new RequestBodyError("Invalid request body.", 400);
  }
}
