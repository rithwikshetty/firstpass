import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  rejectCrossOrigin,
  rejectOversizedContentLength,
} from "./request-security";

describe("request security helpers", () => {
  afterEach(() => {
    delete process.env.APP_ORIGIN;
  });

  it("allows requests with no Origin header", () => {
    const request = new NextRequest("https://example.com/api/review");
    expect(rejectCrossOrigin(request)).toBeNull();
  });

  it("rejects cross-origin writes", async () => {
    const request = new NextRequest("https://example.com/api/review", {
      headers: { origin: "https://evil.example" },
    });

    const response = rejectCrossOrigin(request);

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Cross-origin requests are not allowed.",
    });
  });

  it("allows a configured deployment origin", () => {
    process.env.APP_ORIGIN = "https://app.example.com";
    const request = new NextRequest("http://internal-host/api/review", {
      headers: { origin: "https://app.example.com" },
    });

    expect(rejectCrossOrigin(request)).toBeNull();
  });

  it("rejects oversized content-length before body parsing", () => {
    const request = new NextRequest("https://example.com/api/review", {
      headers: { "content-length": "2000" },
    });

    expect(rejectOversizedContentLength(request, 1024)?.status).toBe(413);
  });
});
