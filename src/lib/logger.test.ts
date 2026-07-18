import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

describe("logger formatting", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogFormat = process.env.LOG_FORMAT;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    delete process.env.LOG_FORMAT;
    process.env.LOG_LEVEL = "info";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalLogFormat === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = originalLogFormat;
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it("emits pretty logs as one non-JSON line with fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("review.model.finish", {
      model: "claude",
      status: 200,
      error: { name: "Error", message: "bad input" },
    });

    expect(info).toHaveBeenCalledOnce();
    const line = String(info.mock.calls[0][0]);
    expect(() => JSON.parse(line)).toThrow();
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("review.model.finish");
    expect(line).toContain("model=claude");
    expect(line).toContain("status=200");
    expect(line).toContain('error={"name":"Error","message":"bad input"}');
  });

  it("omits noisy request context from pretty logs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("api.request.finish", {
      method: "POST",
      path: "/api/review",
      route: "api.review",
      userAgent: "test-agent",
      clientIp: "127.0.0.1",
      vercelId: "iad1::abc",
      origin: "http://localhost",
      contentLength: 42,
    });

    const line = String(info.mock.calls[0][0]);
    expect(line).toContain("method=POST");
    expect(line).toContain("path=/api/review");
    expect(line).not.toMatch(/userAgent|clientIp|vercelId|origin|contentLength|route=/);
  });

  it("truncates request IDs to eight characters in pretty logs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("api.request.finish", { requestId: "12345678-abcdef" });

    const line = String(info.mock.calls[0][0]);
    expect(line).toContain("requestId=12345678");
    expect(line).not.toContain("abcdef");
  });

  it("redacts sensitive fields in pretty logs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("auth.checked", {
      apiKey: "super-secret",
      nested: { password: "also-secret" },
    });

    const line = String(info.mock.calls[0][0]);
    expect(line).toContain("apiKey=[redacted]");
    expect(line).toContain('nested={"password":"[redacted]"}');
    expect(line).not.toContain("super-secret");
    expect(line).not.toContain("also-secret");
  });

  it("uses JSON when LOG_FORMAT=json in development", () => {
    process.env.LOG_FORMAT = "json";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("review.model.finish", { model: "gpt" });

    expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
      level: "info",
      event: "review.model.finish",
      model: "gpt",
    });
  });
});
