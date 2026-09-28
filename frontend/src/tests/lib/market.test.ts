import { describe, expect, it } from "vitest";

import { getMarketSession } from "@/lib/market";

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
});
