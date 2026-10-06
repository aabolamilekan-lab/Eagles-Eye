import { describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import {
  toBreakdown,
  yearWindow,
} from "@/lib/queries/admin/stats";

/**
 * Dashboard aggregate helpers.
 *
 * Pure functions only: the SQL-level reads are covered by the integration
 * suite. These prove the fold and the UTC year window are deterministic.
 */

describe("toBreakdown", () => {
  it("zero-fills every status when there are no rows", () => {
    expect(toBreakdown([])).toEqual({
      draft: 0,
      published: 0,
      archived: 0,
      total: 0,
    });
  });

  it("maps each status group and totals the counts", () => {
    const breakdown = toBreakdown([
      { status: ContentStatus.PUBLISHED, _count: { _all: 3 } },
      { status: ContentStatus.DRAFT, _count: { _all: 4 } },
      { status: ContentStatus.ARCHIVED, _count: { _all: 1 } },
    ]);

    expect(breakdown).toEqual({
      published: 3,
      draft: 4,
      archived: 1,
      total: 8,
    });
  });

  it("leaves a missing status at zero but still totals the rest", () => {
    const breakdown = toBreakdown([
      { status: ContentStatus.DRAFT, _count: { _all: 2 } },
    ]);

    expect(breakdown.published).toBe(0);
    expect(breakdown.archived).toBe(0);
    expect(breakdown.total).toBe(2);
  });
});

describe("yearWindow", () => {
  it("returns UTC boundaries for the year containing the date", () => {
    const { start, end } = yearWindow(new Date("2026-10-03T12:34:56.000Z"));

    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("uses UTC, so a local-time new year does not shift the window", () => {
    // 00:30 on 1 January in UTC+1 is still 31 December in UTC.
    const { start } = yearWindow(new Date("2027-01-01T00:30:00.000+01:00"));

    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
