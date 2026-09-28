"""Technical indicator and model-feature extraction from OHLCV price history.

Two layers live here:

* Raw indicators (RSI, MACD, Bollinger Bands, EMAs, ATR, volatility) in price
  units, which the chart endpoint serves as overlays.
* Scale-free model features derived from them. The forecaster is trained on
  these, never on raw price levels: tree ensembles can't extrapolate beyond the
  range they were trained on, so a model fed absolute prices collapses toward
  historical levels whenever a stock trades at new highs.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Bump whenever FEATURE_COLUMNS, the target, or the contract of persisted
# models changes. Models saved under a different version are treated as
# incompatible and refit on first use rather than trusted.
#   2: log-return target on scale-free features
#   3: deployed as a refit on all history; range-based drift reference
FEATURE_VERSION = 3


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
    """Given raw OHLCV data, return raw indicators plus scale-free model features.

    Input df must have columns: open, high, low, close, volume, indexed by date.
    """
    out = df.copy()
    close = out["close"]

    out["rsi_14"] = compute_rsi(close, 14)
    out["macd"], out["macd_signal"], out["macd_hist"] = compute_macd(close)
    out["bb_upper"], out["bb_middle"], out["bb_lower"] = compute_bollinger_bands(close)
    # min_periods keeps the seed-biased first values of each EMA out of both the
    # chart overlay and the model features.
    out["ema_20"] = close.ewm(span=20, min_periods=20, adjust=False).mean()
    out["ema_50"] = close.ewm(span=50, min_periods=50, adjust=False).mean()
    out["ema_200"] = close.ewm(span=200, min_periods=200, adjust=False).mean()
    out["atr_14"] = compute_atr(out, 14)
    out["volatility_20"] = close.pct_change().rolling(window=20).std() * np.sqrt(252)

    out["return_1d"] = close.pct_change(1)
    out["return_5d"] = close.pct_change(5)
    out["return_10d"] = close.pct_change(10)
    out["return_20d"] = close.pct_change(20)

    out["macd_norm"] = out["macd"] / close
    out["macd_signal_norm"] = out["macd_signal"] / close
    out["macd_hist_norm"] = out["macd_hist"] / close

    band_width = out["bb_upper"] - out["bb_lower"]
    out["bb_pct_b"] = (close - out["bb_lower"]) / band_width.replace(0, np.nan)
    out["bb_width"] = band_width / out["bb_middle"]

    out["dist_ema_20"] = close / out["ema_20"] - 1
    out["dist_ema_50"] = close / out["ema_50"] - 1
    out["dist_ema_200"] = close / out["ema_200"] - 1
    out["atr_pct"] = out["atr_14"] / close

    avg_volume = out["volume"].rolling(window=20, min_periods=20).mean()
    out["volume_ratio"] = out["volume"] / avg_volume.replace(0, np.nan)

    return out


FEATURE_COLUMNS = [
    "rsi_14",
    "macd_norm",
    "macd_signal_norm",
    "macd_hist_norm",
    "bb_pct_b",
    "bb_width",
    "dist_ema_20",
    "dist_ema_50",
    "dist_ema_200",
    "atr_pct",
    "volatility_20",
    "return_1d",
    "return_5d",
    "return_10d",
    "return_20d",
    "volume_ratio",
]


def build_supervised_dataset(
    df: pd.DataFrame, horizon_days: int
) -> tuple[pd.DataFrame, pd.Series]:
    """Build (X, y) where y is the log return over the next `horizon_days` bars."""
    features = build_feature_frame(df)
    close = df["close"]
    target = np.log(close.shift(-horizon_days) / close)

    dataset = features[FEATURE_COLUMNS].copy()
    dataset["target"] = target
    dataset = dataset.replace([np.inf, -np.inf], np.nan).dropna()

    return dataset[FEATURE_COLUMNS], dataset["target"]


def latest_feature_rows(df: pd.DataFrame, count: int = 1) -> pd.DataFrame:
    """The most recent fully-populated feature rows, including bars whose
    forward target isn't known yet (i.e. the rows we actually forecast from)."""
    features = build_feature_frame(df)[FEATURE_COLUMNS]
    features = features.replace([np.inf, -np.inf], np.nan).dropna()
    return features.iloc[-count:]
