import type { NextRequest } from "next/server";
import { elapsedMs, logger, serializeError, type LogFields } from "./logger";

export type RequestLogContext = LogFields & {
  requestId: string;
  route: string;
  method: string;
  path: string;
};

function header(request: NextRequest | undefined, name: string) {
  const headers = request?.headers;
  return typeof headers?.get === "function" ? headers.get(name) : null;
}

function requestUrl(request: NextRequest | undefined) {
  if (!request) return null;
  if ("nextUrl" in request && request.nextUrl) return request.nextUrl;

  try {
    return new URL(request.url);
  } catch {
    return null;
  }
}

function normalizedOrigin(rawOrigin: string | null) {
  if (!rawOrigin) return undefined;

  try {
    return new URL(rawOrigin).origin;
  } catch {
    return "invalid-origin";
  }
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

function requestId(request: NextRequest | undefined) {
  return (
    header(request, "x-request-id") ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function buildRequestLogContext(
  request: NextRequest | undefined,
  route: string,
): RequestLogContext {
  const url = requestUrl(request);
  const rawContentLength = header(request, "content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : undefined;

  return {
    requestId: requestId(request),
    route,
    method: request?.method ?? "unknown",
    path: url?.pathname ?? route,
    contentLength:
      contentLength !== undefined && Number.isSafeInteger(contentLength)
        ? contentLength
        : rawContentLength ?? undefined,
    origin: normalizedOrigin(header(request, "origin")),
    clientIp:
      firstForwardedIp(header(request, "x-forwarded-for")) ||
      header(request, "x-real-ip") ||
      undefined,
    userAgent: header(request, "user-agent") ?? undefined,
    vercelId: header(request, "x-vercel-id") ?? undefined,
  };
}

export async function withRequestLogging(
  request: NextRequest | undefined,
  route: string,
  handler: (context: RequestLogContext) => Response | Promise<Response>,
) {
  const context = buildRequestLogContext(request, route);
  const startedAt = Date.now();

  logger.debug("api.request.start", context);

  try {
    const response = await handler(context);
    try {
      response.headers.set("x-request-id", context.requestId);
    } catch {
      logger.warn("api.request_id_header_failed", context);
    }
    logger.info("api.request.finish", {
      ...context,
      status: response.status,
      durationMs: elapsedMs(startedAt),
    });
    return response;
  } catch (error) {
    logger.error("api.request.failed", {
      ...context,
      durationMs: elapsedMs(startedAt),
      error: serializeError(error),
    });
    throw error;
  }
}
