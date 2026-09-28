"""Market data retrieval via yfinance, with a small on-disk cache."""

from __future__ import annotations

from functools import lru_cache

import pandas as pd
import yfinance as yf

from app.config import settings


class TickerNotFoundError(Exception):
    pass


def fetch_price_history(symbol: str, lookback_days: int | None = None) -> pd.DataFrame:
    """Fetch OHLCV history for a symbol. Returns a DataFrame indexed by date."""
    period_days = lookback_days or settings.lookback_days
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
    df.index = df.index.tz_localize(None)
    df.index.name = "date"
    return df


def fetch_recent_news(symbol: str, limit: int = 15) -> list[dict]:
    """Fetch recent headlines for a symbol via yfinance's news feed."""
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
    return headlines


@lru_cache(maxsize=64)
def validate_symbol(symbol: str) -> bool:
    try:
        info = yf.Ticker(symbol).fast_info
        return info is not None and info.get("lastPrice") is not None
    except Exception:
        return False
