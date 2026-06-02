import { NextRequest, NextResponse } from "next/server";

function allowedOrigins(request: NextRequest): string[] {
  const configuredOrigins = process.env.APP_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : [request.nextUrl.origin];
}

export function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers?.get("origin");
  if (!origin) return null;

  try {
    const requestOrigin = new URL(origin).origin;
    const allowed = allowedOrigins(request).map((allowedOrigin) =>
      new URL(allowedOrigin).origin
    );

    if (!allowed.includes(requestOrigin)) {
      return NextResponse.json(
        { error: "Cross-origin requests are not allowed." },
        { status: 403 },
      );
    }
  } catch {
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
): NextResponse | null {
  const rawContentLength = request.headers?.get("content-length");
  if (!rawContentLength) return null;

  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    return NextResponse.json(
      { error: "Invalid Content-Length header." },
      { status: 400 },
    );
  }

  if (contentLength > maxBytes) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  return null;
}
