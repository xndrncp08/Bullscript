export type InstrumentKind = "equity" | "etf" | "index" | "crypto";

export interface Instrument {
  symbol: string;
  name: string;
  kind: InstrumentKind;
}

/** Mirrors the API's symbol pattern so the UI never sends something the
 * backend would reject with a 422. */
export const SYMBOL_PATTERN = /^[A-Za-z0-9.^=-]{1,12}$/;

export function isValidSymbol(value: string): boolean {
  return SYMBOL_PATTERN.test(value.trim());
}

export function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

export const DIRECTORY: Instrument[] = [
  { symbol: "AAPL", name: "Apple", kind: "equity" },
  { symbol: "MSFT", name: "Microsoft", kind: "equity" },
  { symbol: "NVDA", name: "NVIDIA", kind: "equity" },
  { symbol: "AMZN", name: "Amazon", kind: "equity" },
  { symbol: "GOOGL", name: "Alphabet Class A", kind: "equity" },
  { symbol: "META", name: "Meta Platforms", kind: "equity" },
  { symbol: "TSLA", name: "Tesla", kind: "equity" },
  { symbol: "AVGO", name: "Broadcom", kind: "equity" },
  { symbol: "AMD", name: "Advanced Micro Devices", kind: "equity" },
  { symbol: "NFLX", name: "Netflix", kind: "equity" },
  { symbol: "ORCL", name: "Oracle", kind: "equity" },
  { symbol: "CRM", name: "Salesforce", kind: "equity" },
  { symbol: "ADBE", name: "Adobe", kind: "equity" },
  { symbol: "INTC", name: "Intel", kind: "equity" },
  { symbol: "PLTR", name: "Palantir Technologies", kind: "equity" },
  { symbol: "COIN", name: "Coinbase Global", kind: "equity" },
  { symbol: "JPM", name: "JPMorgan Chase", kind: "equity" },
  { symbol: "GS", name: "Goldman Sachs", kind: "equity" },
  { symbol: "BAC", name: "Bank of America", kind: "equity" },
  { symbol: "V", name: "Visa", kind: "equity" },
  { symbol: "MA", name: "Mastercard", kind: "equity" },
  { symbol: "BRK-B", name: "Berkshire Hathaway Class B", kind: "equity" },
  { symbol: "XOM", name: "Exxon Mobil", kind: "equity" },
  { symbol: "LLY", name: "Eli Lilly", kind: "equity" },
  { symbol: "UNH", name: "UnitedHealth Group", kind: "equity" },
  { symbol: "WMT", name: "Walmart", kind: "equity" },
  { symbol: "COST", name: "Costco Wholesale", kind: "equity" },
  { symbol: "DIS", name: "Walt Disney", kind: "equity" },
  { symbol: "BA", name: "Boeing", kind: "equity" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", kind: "etf" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", kind: "etf" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial ETF", kind: "etf" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", kind: "etf" },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", kind: "etf" },
  { symbol: "GLD", name: "SPDR Gold Shares", kind: "etf" },
  { symbol: "USO", name: "United States Oil Fund", kind: "etf" },
  { symbol: "^VIX", name: "CBOE Volatility Index", kind: "index" },
  { symbol: "BTC-USD", name: "Bitcoin", kind: "crypto" },
  { symbol: "ETH-USD", name: "Ethereum", kind: "crypto" },
];

const BY_SYMBOL = new Map(DIRECTORY.map((i) => [i.symbol, i]));

export function lookupInstrument(symbol: string): Instrument | undefined {
  return BY_SYMBOL.get(normalizeSymbol(symbol));
}

export function searchInstruments(query: string, limit = 8): Instrument[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const scored: { instrument: Instrument; score: number }[] = [];
  for (const instrument of DIRECTORY) {
    const name = instrument.name.toUpperCase();
    let score = 0;
    if (instrument.symbol === q) score = 100;
    else if (instrument.symbol.startsWith(q)) score = 80 - instrument.symbol.length;
    else if (name.split(/\s+/).some((word) => word.startsWith(q))) score = 50;
    else if (name.includes(q)) score = 30;
    if (score > 0) scored.push({ instrument, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.instrument.symbol.localeCompare(b.instrument.symbol))
    .slice(0, limit)
    .map((s) => s.instrument);
}

export const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "SPY", "QQQ"];

export const TAPE_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM", "^VIX", "TLT", "GLD", "USO", "BTC-USD", "ETH-USD"];
