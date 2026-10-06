import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins truthy string values with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values but keeps the number zero", () => {
    expect(cn("a", false, null, undefined, "", 0)).toBe("a 0");
  });

  it("flattens nested arrays", () => {
    expect(cn("a", ["b", ["c", ["d"]]])).toBe("a b c d");
  });

  it("includes only the enabled keys of a conditional map", () => {
    expect(cn({ a: true, b: false, c: true, d: null })).toBe("a c");
  });

  it("combines every supported input form", () => {
    expect(cn("base", ["x"], { y: true, z: false }, "tail")).toBe("base x y tail");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cn(false, null, undefined, "")).toBe("");
  });
});
