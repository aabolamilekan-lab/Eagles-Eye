import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("trims and lowercases the email so buckets and accounts are one", () => {
    const result = loginSchema.safeParse({
      email: "  Admin@Example.COM ",
      password: "pw",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("admin@example.com");
    }
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "pw" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });

  it("rejects oversized input", () => {
    const longEmail = `${"a".repeat(250)}@b.com`;
    expect(loginSchema.safeParse({ email: longEmail, password: "pw" }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x".repeat(1025) }).success,
    ).toBe(false);
  });

  it("strips unknown keys from the parsed object", () => {
    const result = loginSchema.safeParse({
      email: "a@b.com",
      password: "pw",
      role: "ADMIN",
      isAdmin: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(["email", "password"]);
    }
  });
});
