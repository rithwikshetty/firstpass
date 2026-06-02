import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isAuthorized,
  sessionToken,
  verifyPassword,
} from "@/lib/auth";
import {
  clearLoginFailures,
  loginRetryAfterMs,
  recordFailedLogin,
} from "@/lib/auth-throttle";
import {
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "@/lib/request-security";

export const runtime = "nodejs";

const MAX_AUTH_BODY_BYTES = 2048;

function throttledResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many login attempts. Please wait and try again." },
    {
      status: 429,
      headers: {
        "Retry-After": Math.ceil(retryAfterMs / 1000).toString(),
      },
    },
  );
}

/** GET — report whether the current request carries a valid session. */
export async function GET(request: NextRequest) {
  const authed = isAuthorized(request.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ authed });
}

/** POST — exchange the password for a session cookie. */
export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const oversized = rejectOversizedContentLength(request, MAX_AUTH_BODY_BYTES);
  if (oversized) return oversized;

  const token = sessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "APP_PASSWORD is not configured on the server." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const password =
    body && typeof body === "object" && "password" in body
      ? (body as { password: unknown }).password
      : null;

  if (typeof password !== "string") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const retryAfterMs = loginRetryAfterMs(request);
  if (retryAfterMs > 0) {
    return throttledResponse(retryAfterMs);
  }

  if (!verifyPassword(password)) {
    const nextRetryAfterMs = recordFailedLogin(request);
    if (nextRetryAfterMs > 0) {
      return throttledResponse(nextRetryAfterMs);
    }
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  clearLoginFailures(request);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

/** DELETE — log out by clearing the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
