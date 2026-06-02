import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalEnv = { ...process.env };

describe("/api/health", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 200 when required server env is configured", async () => {
    process.env.APP_PASSWORD = "test-password";
    process.env.ANTHROPIC_API_KEY = "sk-test-anthropic";
    process.env.OPENAI_API_KEY = "sk-test-openai";

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 without exposing missing secret names", async () => {
    delete process.env.OPENAI_API_KEY;

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload).toEqual({ ok: false });
  });
});
