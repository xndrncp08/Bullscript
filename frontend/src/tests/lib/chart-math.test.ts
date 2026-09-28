import { describe, expect, it } from "vitest";

import {
  bandPath,
  extent,
  linearScale,
  linePath,
  niceTicks,
  padDomain,
  pickIndexTicks,
  rangeStartIndex,
  slotAt,
} from "@/lib/chart-math";

describe("niceTicks", () => {
  it("lands on round steps", () => {
    expect(niceTicks(301.4, 348.9, 5)).toEqual([310, 320, 330, 340]);
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
  });

  it("handles small decimal ranges without float noise", () => {
    expect(niceTicks(0.1, 0.5, 4)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("returns a single tick for a flat range and nothing for invalid input", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(Number.NaN, 5)).toEqual([]);
  });

  it("accepts a reversed range", () => {
    expect(niceTicks(100, 0, 4)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("linearScale", () => {
  it("maps and inverts, including an inverted pixel range", () => {
    const y = linearScale([100, 200], [400, 0]);
    expect(y(100)).toBe(400);
    expect(y(150)).toBe(200);
    expect(y.invert(100)).toBe(175);
  });
});

describe("extent and padDomain", () => {
  it("ignores missing and non-finite values", () => {
    expect(extent([3, null, 1, undefined, Number.NaN, 7])).toEqual([1, 7]);
    expect(extent([null, undefined])).toBeNull();
  });

  it("pads both ends by a fraction of the span", () => {
    expect(padDomain([100, 200], 0.1)).toEqual([90, 210]);
  });

  it("gives a flat series some room", () => {
    const [lo, hi] = padDomain([50, 50]);
    expect(lo).toBeLessThan(50);
    expect(hi).toBeGreaterThan(50);
  });
});

describe("rangeStartIndex", () => {
  // 300 consecutive days from 2025-06-01 cross into 2026
  const dates = Array.from({ length: 300 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 5, 1 + i));
    return d.toISOString().slice(0, 10);
  });

  it("counts trading bars back from the end", () => {
    expect(rangeStartIndex(dates, "1M")).toBe(300 - 21);
    expect(rangeStartIndex(dates, "1Y")).toBe(300 - 252);
  });

  it("shows everything for 3Y and when history is short", () => {
    expect(rangeStartIndex(dates, "3Y")).toBe(0);
    expect(rangeStartIndex(dates.slice(0, 10), "3M")).toBe(0);
  });

  it("starts YTD at the first bar of the latest year", () => {
    const start = rangeStartIndex(dates, "YTD");
    expect(dates[start].startsWith("2025-")).toBe(false);
    expect(dates[start - 1].startsWith("2025-")).toBe(true);
  });
});

describe("paths", () => {
  it("breaks a line at missing values instead of bridging the gap", () => {
    const d = linePath([
      { x: 0, y: 10 },
      { x: 1, y: 20 },
      { x: 2, y: null },
      { x: 3, y: 30 },
      { x: 4, y: 40 },
    ]);
    expect(d).toBe("M0,10L1,20M3,30L4,40");
  });

  it("closes a band from the upper edge back along the lower", () => {
    expect(bandPath([0, 10], [1, 2], [5, 6])).toBe("M0,1L10,2L10,6L0,5Z");
  });
});

describe("slot lookup", () => {
  it("clamps to the plotted slots", () => {
    expect(slotAt(45, 10, 10, 5)).toBe(3);
    expect(slotAt(-50, 10, 10, 5)).toBe(0);
    expect(slotAt(999, 10, 10, 5)).toBe(4);
    expect(slotAt(5, 0, 10, 0)).toBe(-1);
  });

  it("thins tick indices to the budget", () => {
    expect(pickIndexTicks(4, 6)).toEqual([0, 1, 2, 3]);
    expect(pickIndexTicks(100, 5)).toEqual([0, 20, 40, 60, 80]);
  });
});
