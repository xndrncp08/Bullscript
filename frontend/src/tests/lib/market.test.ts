import { describe, expect, it } from "vitest";

import { getMarketSession, nyseHolidays } from "@/lib/market";

// 2026-09-28 is a Monday; New York is on EDT (UTC-4).
const at = (utc: string) => new Date(utc);

describe("getMarketSession", () => {
  it("is open during the regular session", () => {
    const s = getMarketSession(at("2026-09-28T13:30:00Z")); // 09:30 ET
    expect(s.session).toBe("open");
    expect(s.time).toBe("09:30:00");
  });

  it("is pre-market before the open", () => {
    expect(getMarketSession(at("2026-09-28T12:15:00Z")).session).toBe("pre"); // 08:15 ET
  });

  it("is after hours between the close and 8pm", () => {
    expect(getMarketSession(at("2026-09-28T20:00:00Z")).session).toBe("after"); // 16:00 ET
    expect(getMarketSession(at("2026-09-28T23:59:00Z")).session).toBe("after"); // 19:59 ET
  });

  it("is closed overnight and on weekends", () => {
    expect(getMarketSession(at("2026-09-29T02:00:00Z")).session).toBe("closed"); // 22:00 ET
    expect(getMarketSession(at("2026-09-27T15:00:00Z")).session).toBe("closed"); // Sunday
  });

  it("uses New York time regardless of the viewer's zone", () => {
    expect(getMarketSession(at("2026-09-28T19:59:59Z")).session).toBe("open"); // 15:59:59 ET
  });

  it("is closed all day on an exchange holiday", () => {
    const thanksgiving = getMarketSession(at("2026-11-26T15:00:00Z")); // 10:00 ET
    expect(thanksgiving.session).toBe("closed");
    expect(thanksgiving.label).toBe("Market holiday");
    expect(getMarketSession(at("2026-11-27T15:00:00Z")).session).toBe("open"); // day after
  });
});

describe("nyseHolidays", () => {
  // Published NYSE schedules - the same fixtures as the backend's calendar tests.
  it.each([
    [2026, ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]],
    [2027, ["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]],
  ])("matches the %i schedule", (year, expected) => {
    expect([...nyseHolidays(year)].sort()).toEqual(expected);
  });

  it("doesn't observe a Saturday New Year's Day on the Friday before", () => {
    expect(nyseHolidays(2021).has("2021-12-31")).toBe(false);
    expect(nyseHolidays(2022).has("2021-12-31")).toBe(false);
  });
});
