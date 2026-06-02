import { describe, it, expect, beforeEach } from "vitest";
import { sessionToken, isAuthorized } from "@/lib/auth";

describe("auth session", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "test-password-123";
  });

  it("authorizes a cookie holding the derived session token", () => {
    const token = sessionToken();
    expect(token).toBeTruthy();
    expect(isAuthorized(token)).toBe(true);
  });

  it("rejects a wrong, empty, null, or missing token", () => {
    expect(isAuthorized("not-the-token")).toBe(false);
    expect(isAuthorized("")).toBe(false);
    expect(isAuthorized(null)).toBe(false);
    expect(isAuthorized(undefined)).toBe(false);
  });

  it("rejects everything when no password is configured", () => {
    delete process.env.APP_PASSWORD;
    expect(sessionToken()).toBeNull();
    // even a previously-valid-looking value can't pass without a server secret
    expect(isAuthorized("anything")).toBe(false);
  });

  it("binds the token to the password — changing it invalidates old cookies", () => {
    const tokenA = sessionToken();
    process.env.APP_PASSWORD = "a-different-password";
    const tokenB = sessionToken();
    expect(tokenB).not.toEqual(tokenA);
    expect(isAuthorized(tokenA)).toBe(false); // old cookie no longer valid
    expect(isAuthorized(tokenB)).toBe(true);
  });
});
