import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  RequestBodyError,
  readRequestFormData,
  readRequestJson,
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

  it("caps a body that arrives without Content-Length", async () => {
    const request = new NextRequest("https://example.com/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(3000) }),
    });

    await expect(readRequestJson(request, 2048)).rejects.toMatchObject({
      name: "RequestBodyError",
      status: 413,
    });
  });

  it("returns a 400-class error for a malformed multipart body", async () => {
    const request = new NextRequest("https://example.com/api/review", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "not multipart",
    });

    const error = await readRequestFormData(request, 1024).catch((e) => e);
    expect(error).toBeInstanceOf(RequestBodyError);
    expect(error.status).toBe(400);
  });

  it("parses a well-formed multipart body within the cap", async () => {
    const body = new FormData();
    body.append("jobDescription", "We need TypeScript.");
    const request = new NextRequest("https://example.com/api/review", {
      method: "POST",
      body,
    });

    const parsed = await readRequestFormData(request, 64 * 1024);
    expect(parsed.get("jobDescription")).toBe("We need TypeScript.");
  });
});
