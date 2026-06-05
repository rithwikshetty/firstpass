import { NextRequest, NextResponse } from "next/server";
import { logger, type LogFields } from "./logger";

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
