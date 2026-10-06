import { describe, expect, it } from "vitest";
import {
  TEMPORARY_ORDER_OFFSET,
  isContiguousOrder,
  moveChapter,
  planReorder,
  temporaryOrderValue,
} from "@/lib/chapters/order";

describe("isContiguousOrder", () => {
  it("accepts an unbroken 1..n sequence regardless of order", () => {
    expect(isContiguousOrder([1, 2, 3])).toBe(true);
    expect(isContiguousOrder([3, 1, 2])).toBe(true);
    expect(isContiguousOrder([])).toBe(true);
  });

  it("rejects a gap, a duplicate, and a zero-based sequence", () => {
    expect(isContiguousOrder([1, 3])).toBe(false);
    expect(isContiguousOrder([1, 1, 3])).toBe(false);
    expect(isContiguousOrder([0, 1, 2])).toBe(false);
  });
});

describe("planReorder", () => {
  it("accepts a permutation of the stored ids", () => {
    expect(planReorder(["a", "b", "c"], ["c", "a", "b"])).toEqual({ ok: true });
  });

  it("rejects a payload missing an id", () => {
    const result = planReorder(["a", "b", "c"], ["b", "a"]);
    expect(result.ok).toBe(false);
  });

  it("rejects a payload with an extra or foreign id", () => {
    expect(planReorder(["a", "b"], ["a", "b", "c"]).ok).toBe(false);
    expect(planReorder(["a", "b"], ["a", "z"]).ok).toBe(false);
  });

  it("rejects a payload with a duplicate id", () => {
    expect(planReorder(["a", "b", "c"], ["a", "a", "b"]).ok).toBe(false);
  });
});

describe("moveChapter", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves a chapter to a 1-based position", () => {
    expect(moveChapter(ids, "a", 3)).toEqual(["b", "c", "a", "d"]);
    expect(moveChapter(ids, "d", 1)).toEqual(["d", "a", "b", "c"]);
  });

  it("clamps a position past either end", () => {
    expect(moveChapter(ids, "b", 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveChapter(ids, "c", -5)).toEqual(["c", "a", "b", "d"]);
  });

  it("returns an unchanged order for an unknown id", () => {
    expect(moveChapter(ids, "z", 2)).toEqual(ids);
  });

  it("returns the same order when moving to the current position", () => {
    expect(moveChapter(ids, "b", 2)).toEqual(ids);
  });
});

describe("temporary reorder band", () => {
  it("places every shifted value above any real number", () => {
    const maxRealNumber = 1000;
    expect(temporaryOrderValue(maxRealNumber)).toBe(
      maxRealNumber + TEMPORARY_ORDER_OFFSET,
    );
    expect(temporaryOrderValue(maxRealNumber)).toBeGreaterThan(maxRealNumber);
    expect(temporaryOrderValue(1)).toBeGreaterThan(maxRealNumber);
  });

  it("keeps shifted values distinct", () => {
    expect(temporaryOrderValue(1)).not.toBe(temporaryOrderValue(2));
  });
});
