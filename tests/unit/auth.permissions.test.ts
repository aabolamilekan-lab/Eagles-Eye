import { describe, expect, it } from "vitest";
import { CAPABILITIES, canAccessAdmin, hasCapability } from "@/lib/auth/permissions";

describe("permissions", () => {
  it("grants every capability to ADMIN", () => {
    for (const capability of CAPABILITIES) {
      expect(hasCapability("ADMIN", capability)).toBe(true);
    }
  });

  it("allows ADMIN through the admin gate", () => {
    expect(canAccessAdmin("ADMIN")).toBe(true);
  });

  it("denies unknown roles, null, and undefined", () => {
    expect(hasCapability("EDITOR", "admin.access")).toBe(false);
    expect(hasCapability(null, "admin.access")).toBe(false);
    expect(hasCapability(undefined, "admin.access")).toBe(false);
    expect(canAccessAdmin("VIEWER")).toBe(false);
  });

  it("treats the role as an opaque server-resolved value", () => {
    expect(hasCapability("admin", "admin.access")).toBe(false);
    expect(hasCapability(" ADMIN", "admin.access")).toBe(false);
  });
});
