import { describe, expect, it } from "vitest";
import {
  ACCOUNT_NAME_MAX,
  PASSWORD_MIN,
  changePasswordSchema,
  updateProfileSchema,
} from "@/lib/validation/user";

/**
 * Account settings input rules.
 *
 * The forms rely on these schemas for the server boundary (AGENTS.md section 9),
 * so the trimming, the length ceilings, the confirmation match and the
 * "different from current" rule are asserted directly.
 */
describe("updateProfileSchema", () => {
  it("trims and accepts a display name", () => {
    const result = updateProfileSchema.parse({ name: "  Ada Lovelace  " });
    expect(result.name).toBe("Ada Lovelace");
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over the limit", () => {
    const tooLong = "x".repeat(ACCOUNT_NAME_MAX + 1);
    expect(updateProfileSchema.safeParse({ name: tooLong }).success).toBe(false);
  });

  it("rejects unknown keys rather than accepting a role or id", () => {
    const result = updateProfileSchema.safeParse({
      name: "Ada",
      role: "ADMIN",
    });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const valid = {
    currentPassword: "current-passphrase-1",
    newPassword: "brand-new-passphrase-2",
    confirmPassword: "brand-new-passphrase-2",
  };

  it("accepts a well-formed change", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a new password below the minimum length", () => {
    const short = "x".repeat(PASSWORD_MIN - 1);
    const result = changePasswordSchema.safeParse({
      ...valid,
      newPassword: short,
      confirmPassword: short,
    });
    expect(result.success).toBe(false);
  });

  it("reports a mismatched confirmation on the confirm field", () => {
    const result = changePasswordSchema.safeParse({
      ...valid,
      confirmPassword: "a-different-passphrase",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.flatten().fieldErrors.confirmPassword?.length,
      ).toBeGreaterThan(0);
    }
  });

  it("refuses reusing the current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: valid.currentPassword,
      newPassword: valid.currentPassword,
      confirmPassword: valid.currentPassword,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.flatten().fieldErrors.newPassword?.length,
      ).toBeGreaterThan(0);
    }
  });
});