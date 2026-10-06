import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookie,
  evaluateSessionLifetime,
  hashSessionToken,
  mintSessionToken,
  safeEqual,
  sessionCookie,
} from "@/lib/auth/session-token";

describe("session token", () => {
  it("mints 256 bits of base64url entropy", () => {
    const token = mintSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("mints a distinct token every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it("hashes deterministically per secret and differs across secrets", () => {
    const token = "fixed-token";
    expect(hashSessionToken(token, "secret-a")).toBe(hashSessionToken(token, "secret-a"));
    expect(hashSessionToken(token, "secret-a")).not.toBe(hashSessionToken(token, "secret-b"));
    expect(hashSessionToken(token, "secret-a")).not.toBe(token);
  });

  it("compares in constant time and rejects different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("session cookie", () => {
  it("is HttpOnly, SameSite=Lax, and path-scoped", () => {
    const cookie = sessionCookie("tok", 3600, true, 1_000_000);
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(3600);
    expect(cookie.expires.getTime()).toBe(1_000_000 + 3600 * 1000);
  });

  it("sets Secure only when told to", () => {
    expect(sessionCookie("tok", 60, true).secure).toBe(true);
    expect(sessionCookie("tok", 60, false).secure).toBe(false);
  });

  it("clears with an immediate expiry", () => {
    const cookie = clearedSessionCookie(true);
    expect(cookie.value).toBe("");
    expect(cookie.maxAge).toBe(0);
    expect(cookie.expires.getTime()).toBe(0);
  });
});

describe("session lifetime", () => {
  const windowSeconds = 100;
  const windowMs = windowSeconds * 1000;

  it("is valid with no renewal needed early in the window", () => {
    const now = 10 * windowMs;
    const result = evaluateSessionLifetime({
      now,
      createdAt: now,
      expiresAt: now + windowMs,
      windowSeconds,
    });
    expect(result.status).toBe("valid");
    expect(result.renew).toBe(false);
    expect(result.nextExpiresAt).toBe(now + windowMs);
  });

  it("renews once the remaining life falls under half the window", () => {
    const now = 10 * windowMs;
    const result = evaluateSessionLifetime({
      now,
      createdAt: now - windowMs,
      expiresAt: now + windowMs / 4,
      windowSeconds,
    });
    expect(result.status).toBe("valid");
    expect(result.renew).toBe(true);
    expect(result.nextExpiresAt).toBe(now + windowMs);
  });

  it("caps renewal at createdAt + 2 windows", () => {
    const createdAt = 0;
    const now = 2 * windowMs - 1000;
    const result = evaluateSessionLifetime({
      now,
      createdAt,
      expiresAt: now + 1,
      windowSeconds,
    });
    expect(result.status).toBe("valid");
    expect(result.nextExpiresAt).toBe(2 * windowMs);
  });

  it("expires at the absolute ceiling and cannot be renewed", () => {
    const createdAt = 0;
    const now = 2 * windowMs + 1;
    const result = evaluateSessionLifetime({
      now,
      createdAt,
      expiresAt: 2 * windowMs,
      windowSeconds,
    });
    expect(result.status).toBe("expired");
    expect(result.renew).toBe(false);
  });

  it("expires when now reaches expiresAt", () => {
    const now = 5 * windowMs;
    const result = evaluateSessionLifetime({
      now,
      createdAt: now - windowMs,
      expiresAt: now,
      windowSeconds,
    });
    expect(result.status).toBe("expired");
  });
});
