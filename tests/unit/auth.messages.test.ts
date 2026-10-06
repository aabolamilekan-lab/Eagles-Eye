import { describe, expect, it } from "vitest";
import {
  INVALID_CREDENTIALS_CODE,
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_CODE,
  RATE_LIMITED_MESSAGE,
} from "@/lib/auth/login-messages";

describe("login messages", () => {
  it("uses one generic message and code for every credential failure", () => {
    expect(INVALID_CREDENTIALS_CODE).toBe("invalid_credentials");
    expect(INVALID_CREDENTIALS_MESSAGE).toBe("Invalid email or password.");
    expect(INVALID_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("unknown");
    expect(INVALID_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("locked");
    expect(INVALID_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("inactive");
    expect(INVALID_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("exist");
  });

  it("reports rate limiting with its own code and no account detail", () => {
    expect(RATE_LIMITED_CODE).toBe("rate_limited");
    expect(RATE_LIMITED_MESSAGE).toBe("Too many attempts. Try again later.");
    expect(RATE_LIMITED_MESSAGE.toLowerCase()).not.toContain("account");
  });
});
