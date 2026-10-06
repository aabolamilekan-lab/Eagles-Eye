import { describe, expect, it } from "vitest";
import { formatPublishedDate } from "@/lib/format";

describe("formatPublishedDate", () => {
  it("formats an ISO string as a long date in UTC", () => {
    expect(formatPublishedDate("2026-01-12T09:00:00.000Z")).toBe(
      "12 January 2026",
    );
  });

  it("accepts a Date instance", () => {
    expect(formatPublishedDate(new Date("2026-03-01T00:00:00.000Z"))).toBe(
      "1 March 2026",
    );
  });

  it("uses the UTC calendar day near midnight, independent of time zone", () => {
    expect(formatPublishedDate("2026-01-12T23:30:00.000Z")).toBe(
      "12 January 2026",
    );
    expect(formatPublishedDate("2026-01-13T00:30:00.000Z")).toBe(
      "13 January 2026",
    );
  });

  it("returns null for absent input", () => {
    expect(formatPublishedDate(null)).toBeNull();
    expect(formatPublishedDate(undefined)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(formatPublishedDate("not-a-date")).toBeNull();
  });
});
