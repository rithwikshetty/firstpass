import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { resetLoginThrottleForTests } from "@/lib/auth-throttle";
import { POST } from "./route";

function makeReq(password: string, userAgent = "vitest"): NextRequest {
  return new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "user-agent": userAgent,
    },
    body: JSON.stringify({ password }),
  });
}

describe("/api/auth throttling", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "test-password";
    resetLoginThrottleForTests();
  });

  it("backs off repeated wrong passwords with 429 and Retry-After", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await POST(makeReq("wrong"));
      expect(res.status).toBe(401);
    }

    const res = await POST(makeReq("wrong"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("keeps throttling when the client rotates its User-Agent", async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await POST(makeReq("wrong", `agent-${attempt}`));
    }

    const res = await POST(makeReq("wrong", "fresh-agent"));
    expect(res.status).toBe(429);
  });

  it("rejects an oversized login body with 413", async () => {
    const res = await POST(makeReq("x".repeat(4000)));
    expect(res.status).toBe(413);
  });

  it("still sets a session cookie for a valid login", async () => {
    const res = await POST(makeReq("test-password"));

    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });
});
