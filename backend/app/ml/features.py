"""Technical indicator feature extraction from OHLCV price history."""

from __future__ import annotations

import numpy as np
import pandas as pd


def compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def compute_macd(
    close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    macd_signal = macd.ewm(span=signal, adjust=False).mean()
    macd_hist = macd - macd_signal
    return macd, macd_signal, macd_hist


def compute_bollinger_bands(
    close: pd.Series, period: int = 20, num_std: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    middle = close.rolling(window=period, min_periods=period).mean()
    std = close.rolling(window=period, min_periods=period).std()
    upper = middle + num_std * std
    lower = middle - num_std * std
    return upper, middle, lower


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Given raw OHLCV data, return a DataFrame of engineered technical features.

    Input df must have columns: open, high, low, close, volume, indexed by date.
    """
    out = df.copy()
    close = out["close"]

    out["rsi_14"] = compute_rsi(close, 14)
    out["macd"], out["macd_signal"], out["macd_hist"] = compute_macd(close)
    out["bb_upper"], out["bb_middle"], out["bb_lower"] = compute_bollinger_bands(close)
    out["ema_20"] = close.ewm(span=20, adjust=False).mean()
    out["ema_50"] = close.ewm(span=50, adjust=False).mean()
    out["ema_200"] = close.ewm(span=200, adjust=False).mean()
    out["atr_14"] = compute_atr(out, 14)
    out["volatility_20"] = close.pct_change().rolling(window=20).std() * np.sqrt(252)

    out["return_1d"] = close.pct_change(1)
    out["return_5d"] = close.pct_change(5)
    out["return_10d"] = close.pct_change(10)
    out["volume_change"] = out["volume"].pct_change().replace([np.inf, -np.inf], 0)

    return out


FEATURE_COLUMNS = [
    "rsi_14",
    "macd",
    "macd_signal",
    "macd_hist",
    "bb_upper",
    "bb_middle",
    "bb_lower",
    "ema_20",
    "ema_50",
    "ema_200",
    "atr_14",
    "volatility_20",
    "return_1d",
    "return_5d",
    "return_10d",
    "volume_change",
]


def build_supervised_dataset(
    df: pd.DataFrame, horizon_days: int
) -> tuple[pd.DataFrame, pd.Series]:
    """Build (X, y) where y is the closing price `horizon_days` in the future."""
    features = build_feature_frame(df)
    target = df["close"].shift(-horizon_days)

    dataset = features.copy()
    dataset["target"] = target
    dataset = dataset.dropna(subset=FEATURE_COLUMNS + ["target"])

    X = dataset[FEATURE_COLUMNS]
    y = dataset["target"]
    return X, y
