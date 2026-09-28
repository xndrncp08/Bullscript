"""Market data retrieval via yfinance, fronted by short-lived in-process caches.

A single dashboard view asks for the same symbol's history several times (the
chart, the forecast, a retrain), and Yahoo rate-limits aggressively. Caching
history and news for a few minutes and quotes for one keeps the UI fast
without serving meaningfully stale end-of-day data.
"""

from __future__ import annotations

import math

import pandas as pd
import yfinance as yf

from app.config import settings
from app.services.cache import TTLCache

HISTORY_TTL_SECONDS = 300
NEWS_TTL_SECONDS = 300
QUOTE_TTL_SECONDS = 60
SPARKLINE_POINTS = 22

_history_cache = TTLCache(HISTORY_TTL_SECONDS, max_entries=64)
_news_cache = TTLCache(NEWS_TTL_SECONDS, max_entries=64)
_quote_cache = TTLCache(QUOTE_TTL_SECONDS, max_entries=256)
_NOT_CACHED = object()


class TickerNotFoundError(Exception):
    pass


def clear_caches() -> None:
    _history_cache.clear()
    _news_cache.clear()
    _quote_cache.clear()


def fetch_price_history(symbol: str, lookback_days: int | None = None) -> pd.DataFrame:
    """Fetch OHLCV history for a symbol. Returns a DataFrame indexed by date."""
    period_days = lookback_days or settings.lookback_days
    key = (symbol.upper(), period_days)

    cached = _history_cache.get(key)
    if cached is not None:
        # hand out copies so no caller can mutate what the next one reads
        return cached.copy()

    ticker = yf.Ticker(symbol)
    df = ticker.history(period=f"{period_days}d", interval="1d", auto_adjust=False)

    if df.empty:
        raise TickerNotFoundError(f"No price history found for symbol '{symbol}'")

    df = df.rename(
        columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        }
    )[["open", "high", "low", "close", "volume"]]
    # Halted or partially reported sessions come back with NaN prices; they'd
    # poison every rolling indicator downstream and aren't valid JSON either.
    df = df.dropna(subset=["open", "high", "low", "close"])
    if df.empty:
        raise TickerNotFoundError(f"No price history found for symbol '{symbol}'")
    df.index = df.index.tz_localize(None)
    df.index.name = "date"

    _history_cache.set(key, df)
    return df.copy()


def fetch_recent_news(symbol: str, limit: int = 15) -> list[dict]:
    """Fetch recent headlines for a symbol via yfinance's news feed."""
    key = (symbol.upper(), limit)
    cached = _news_cache.get(key)
    if cached is not None:
        return [dict(item) for item in cached]

    ticker = yf.Ticker(symbol)
    try:
        raw_news = ticker.news or []
    except Exception:
        raw_news = []

    headlines = []
    for item in raw_news[:limit]:
        content = item.get("content", item)
        title = content.get("title") or item.get("title")
        if not title:
            continue
        provider = (content.get("provider") or {}).get("displayName") if isinstance(
            content.get("provider"), dict
        ) else content.get("publisher")
        pub_date = content.get("pubDate") or item.get("providerPublishTime")
        headlines.append(
            {
                "headline": title,
                "source": provider,
                "published_at": pub_date,
            }
        )

    _news_cache.set(key, headlines)
    return [dict(item) for item in headlines]


def _field(frame: pd.DataFrame, symbol: str, name: str) -> pd.Series | None:
    """Pull one field for one symbol out of a yf.download frame, whichever
    level order the MultiIndex comes back in."""
    if not isinstance(frame.columns, pd.MultiIndex):
        return frame[name] if name in frame.columns else None
    for column in ((symbol, name), (name, symbol)):
        if column in frame.columns:
            return frame[column]
    return None


def build_quotes(frame: pd.DataFrame, symbols: list[str]) -> dict[str, dict]:
    """Summarise a batch-download frame into per-symbol quotes.

    Symbols Yahoo doesn't know come back as all-NaN columns and are skipped.
    """
    quotes: dict[str, dict] = {}
    for symbol in symbols:
        close = _field(frame, symbol, "Close")
        if close is None:
            continue
        close = close.dropna()
        if len(close) < 2:
            continue

        price = float(close.iloc[-1])
        previous = float(close.iloc[-2])
        if not (math.isfinite(price) and math.isfinite(previous)) or previous == 0:
            continue

        volume = _field(frame, symbol, "Volume")
        last_volume = None
        if volume is not None:
            volume = volume.reindex(close.index).dropna()
            if len(volume):
                last_volume = int(volume.iloc[-1])

        quotes[symbol] = {
            "symbol": symbol,
            "price": round(price, 2),
            "previous_close": round(previous, 2),
            "change": round(price - previous, 2),
            "change_pct": round((price - previous) / previous, 6),
            "volume": last_volume,
            "as_of": close.index[-1].date(),
            "sparkline": [round(float(v), 2) for v in close.iloc[-SPARKLINE_POINTS:]],
        }
    return quotes


def fetch_quotes(symbols: list[str]) -> list[dict]:
    """Latest quote + ~1 month sparkline for each symbol, in request order.

    Only symbols missing from the quote cache hit Yahoo, in one batch request.
    """
    symbols = [s.upper() for s in symbols]
    found: dict[str, dict] = {}
    missing: list[str] = []
    for symbol in symbols:
        cached = _quote_cache.get(symbol, default=_NOT_CACHED)
        if cached is _NOT_CACHED:
            missing.append(symbol)
        elif cached is not None:
            found[symbol] = cached
        # cached None: Yahoo recently said it doesn't know this symbol

    if missing:
        frame = yf.download(
            tickers=missing,
            period="1mo",
            interval="1d",
            group_by="ticker",
            auto_adjust=False,
            progress=False,
            threads=True,
        )
        quotes = build_quotes(frame, missing)
        for symbol in missing:
            quote = quotes.get(symbol)
            # cache misses too, so one bad symbol in a watchlist doesn't force
            # a Yahoo round trip on every refresh
            _quote_cache.set(symbol, quote)
            if quote is not None:
                found[symbol] = quote

    return [dict(found[s]) for s in symbols if s in found]
