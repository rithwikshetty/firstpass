import type { NextRequest } from "next/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

type AttemptRecord = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
};

const attempts = new Map<string, AttemptRecord>();

function clientKey(request: NextRequest): string {
  // Keyed on the client address only. Anything the client controls (such as
  // User-Agent) must stay out of the key, or rotating it resets the throttle.
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown-ip";
}

function freshRecord(now: number): AttemptRecord {
  return { failures: 0, firstFailureAt: now, blockedUntil: 0 };
}

export function loginRetryAfterMs(request: NextRequest, now = Date.now()): number {
  const key = clientKey(request);
  const record = attempts.get(key);
  if (!record) return 0;

  if (now - record.firstFailureAt > WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }

  return Math.max(0, record.blockedUntil - now);
}

export function recordFailedLogin(request: NextRequest, now = Date.now()): number {
  const key = clientKey(request);
  const existing = attempts.get(key);
  const record =
    existing && now - existing.firstFailureAt <= WINDOW_MS
      ? existing
      : freshRecord(now);

  record.failures += 1;

  if (record.failures > MAX_FAILURES) {
    const backoffStep = record.failures - MAX_FAILURES - 1;
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * 2 ** backoffStep,
      MAX_BACKOFF_MS,
    );
    record.blockedUntil = now + backoffMs;
  }

  attempts.set(key, record);
  return Math.max(0, record.blockedUntil - now);
}

export function clearLoginFailures(request: NextRequest) {
  attempts.delete(clientKey(request));
}

export function resetLoginThrottleForTests() {
  attempts.clear();
}
