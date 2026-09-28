import { describe, expect, it } from "vitest";

import { isValidSymbol, lookupInstrument, searchInstruments } from "@/lib/symbols";

describe("searchInstruments", () => {
  it("ranks an exact symbol match first", () => {
    expect(searchInstruments("MA")[0].symbol).toBe("MA");
  });

  it("matches symbol prefixes, shortest first", () => {
    const symbols = searchInstruments("AM").map((i) => i.symbol);
    expect(symbols.slice(0, 2)).toEqual(["AMD", "AMZN"]);
  });

  it("matches words in the company name", () => {
    expect(searchInstruments("tesla").map((i) => i.symbol)).toContain("TSLA");
    expect(searchInstruments("gold").map((i) => i.symbol)).toContain("GLD");
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(searchInstruments("  ")).toEqual([]);
    expect(searchInstruments("a", 3)).toHaveLength(3);
  });
});

describe("symbol validation", () => {
  it("accepts the shapes Yahoo uses", () => {
    for (const s of ["AAPL", "BRK-B", "^VIX", "BTC-USD", "EURUSD=X", "RDS.A"]) {
      expect(isValidSymbol(s)).toBe(true);
    }
  });

  it("rejects anything the API would reject", () => {
    for (const s of ["", "AAPL;DROP", "../etc", "ABCDEFGHIJKLM", "A B"]) {
      expect(isValidSymbol(s)).toBe(false);
    }
  });

  it("looks up names case-insensitively", () => {
    expect(lookupInstrument("nvda")?.name).toBe("NVIDIA");
    expect(lookupInstrument("ZZZZ")).toBeUndefined();
  });
});
