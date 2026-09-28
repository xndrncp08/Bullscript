import { describe, expect, it } from "vitest";

import {
  directionOf,
  formatCompact,
  formatDuration,
  formatMarketDate,
  formatMonthYear,
  formatPercent,
  formatPrice,
  formatRelativeTime,
  formatSigned,
} from "@/lib/format";

const MINUS = "−";

describe("format", () => {
  it("prints prices with two decimals and thousands separators", () => {
    expect(formatPrice(341.07)).toBe("341.07");
    expect(formatPrice(64_210.5)).toBe("64,210.50");
  });

  it("gives sub-dollar prices four decimals", () => {
    expect(formatPrice(0.12345)).toBe("0.1235");
  });

  it("renders missing values as an em dash", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatSigned(Number.NaN)).toBe("—");
  });

  it("signs values with + and a true minus sign", () => {
    expect(formatSigned(5.15)).toBe("+5.15");
    expect(formatSigned(-5.15)).toBe(`${MINUS}5.15`);
    expect(formatSigned(0)).toBe("0.00");
  });

  it("treats percent input as a fraction", () => {
    expect(formatPercent(0.0153)).toBe("+1.53%");
    expect(formatPercent(-0.2)).toBe(`${MINUS}20.00%`);
    expect(formatPercent(0.61, { digits: 0, signed: false })).toBe("61%");
  });

  it("compacts large volumes", () => {
    expect(formatCompact(29_950_000)).toBe("29.95M");
    expect(formatCompact(1_200)).toBe("1.2K");
  });

  it("formats durations at the right granularity", () => {
    expect(formatDuration(42.4)).toBe("42ms");
    expect(formatDuration(1_340)).toBe("1.3s");
    expect(formatDuration(95_000)).toBe("1m 35s");
  });

  it("formats market dates without timezone drift", () => {
    // new Date("2026-09-25") is UTC midnight, i.e. Sep 24 in the Americas
    expect(formatMarketDate("2026-09-25")).toBe("Sep 25");
    expect(formatMarketDate("2026-09-25", { withYear: true })).toBe("Sep 25, 2026");
    expect(formatMonthYear("2026-03-02")).toBe("Mar '26");
  });

  it("describes elapsed time relative to now", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(formatRelativeTime("2026-09-28T11:59:40Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-09-28T11:15:00Z", now)).toBe("45m ago");
    expect(formatRelativeTime("2026-09-28T03:00:00Z", now)).toBe("9h ago");
    expect(formatRelativeTime("2026-09-25T12:00:00Z", now)).toBe("3d ago");
  });

  it("classifies direction", () => {
    expect(directionOf(0.01)).toBe("up");
    expect(directionOf(-3)).toBe("down");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(null)).toBe("flat");
  });
});
