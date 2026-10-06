import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrast,
  evaluateContrast,
  parseColorTokens,
  pairings,
  relativeLuminance,
} from "../../scripts/verify-contrast.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  join(here, "..", "..", "src", "app", "globals.css"),
  "utf8",
);
const tokens = parseColorTokens(css);

describe("contrast maths", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns 1:1 for a colour against itself", () => {
    expect(contrast("#7c2d26", "#7c2d26")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrast("#1a1817", "#faf8f5")).toBeCloseTo(
      contrast("#faf8f5", "#1a1817"),
      10,
    );
  });

  it("orders luminance white over a mid tone over black", () => {
    expect(relativeLuminance("#ffffff")).toBeGreaterThan(
      relativeLuminance("#7c2d26"),
    );
    expect(relativeLuminance("#7c2d26")).toBeGreaterThan(
      relativeLuminance("#000000"),
    );
  });
});

describe("design tokens", () => {
  it("parses every colour token referenced by a pairing", () => {
    for (const { fg, bg } of pairings) {
      expect(tokens[fg], `missing --color-${fg}`).toBeDefined();
      expect(tokens[bg], `missing --color-${bg}`).toBeDefined();
    }
  });

  it("meets WCAG AA for every pairing", () => {
    const results = evaluateContrast(tokens);
    const failures = results.filter((result) => !result.pass);
    expect(
      failures.map((failure) => failure.label),
      "pairings below threshold",
    ).toEqual([]);
  });

  it("flags a pairing that does not meet the threshold", () => {
    const results = evaluateContrast(
      { fg: "#cccccc", bg: "#ffffff" },
      [{ fg: "fg", bg: "bg", min: 4.5, label: "Low contrast" }],
    );
    expect(results[0]?.pass).toBe(false);
  });

  it("throws when a referenced token is absent", () => {
    expect(() =>
      evaluateContrast(
        {},
        [{ fg: "missing", bg: "surface", min: 4.5, label: "Missing" }],
      ),
    ).toThrow(/Missing token/);
  });
});
