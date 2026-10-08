import { describe, expect, it } from "vitest";
import { countWords, formatPublishedDate, toPlainText } from "@/lib/format";

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

describe("toPlainText", () => {
  it("drops tags and collapses whitespace without truncating", () => {
    expect(
      toPlainText("<p>The wind  came off\nthe plateau.</p>"),
    ).toBe("The wind came off the plateau.");
  });

  it("returns an empty string for absent input", () => {
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText("")).toBe("");
  });

  it("keeps the full body even past any excerpt length", () => {
    const long = `<p>${"word ".repeat(200).trim()}</p>`;
    expect(toPlainText(long).split(/\s+/)).toHaveLength(200);
  });
});

describe("countWords", () => {
  it("counts whole words in plain text", () => {
    expect(countWords("One two three")).toBe(3);
    expect(countWords("  spaced   out  ")).toBe(2);
  });

  it("counts nothing for empty input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});
