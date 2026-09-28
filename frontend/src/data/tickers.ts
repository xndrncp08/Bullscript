export interface TickerSuggestion {
  symbol: string;
  name: string;
}

export const POPULAR_TICKERS: TickerSuggestion[] = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "AMZN", name: "Amazon.com Inc." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "META", name: "Meta Platforms Inc." },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "NFLX", name: "Netflix Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices" },
  { symbol: "INTC", name: "Intel Corp." },
  { symbol: "SPY", name: "SPDR S&P 500 ETF" },
  { symbol: "QQQ", name: "Invesco QQQ Trust" },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "BAC", name: "Bank of America Corp." },
  { symbol: "DIS", name: "Walt Disney Co." },
  { symbol: "BA", name: "Boeing Co." },
  { symbol: "COIN", name: "Coinbase Global Inc." },
  { symbol: "PLTR", name: "Palantir Technologies" },
];

export function searchTickers(query: string, limit = 6): TickerSuggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  return POPULAR_TICKERS.filter(
    (t) => t.symbol.startsWith(q) || t.name.toUpperCase().includes(q)
  ).slice(0, limit);
}
