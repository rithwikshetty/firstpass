import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lightweight single-password session.
 *
 * Auth here is intentionally minimal — this app is shared with a couple of
 * trusted users behind one password (`APP_PASSWORD`). Rather than send that
 * password on every request, we exchange it once for an httpOnly cookie whose
 * value is an HMAC of the password. The raw password never reaches the cookie,
 * and the token is verified with a constant-time comparison.
 */

export const SESSION_COOKIE = "cv_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, in seconds

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Derive the session token from the configured password, or null if unset. */
export function sessionToken(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password)
    .update("firstpass:session:v1")
    .digest("hex");
}

/** Constant-time check that a cookie value matches the expected token. */
export function isAuthorized(token: string | undefined | null): boolean {
  const expected = sessionToken();
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time password check that avoids leaking raw length differences. */
export function verifyPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}
