import numpy as np
import pandas as pd

from app.ml.features import (
    FEATURE_COLUMNS,
    build_feature_frame,
    build_supervised_dataset,
    compute_atr,
    compute_bollinger_bands,
    compute_macd,
    compute_rsi,
    latest_feature_rows,
)


def test_build_feature_frame_shape_and_columns(synthetic_price_df):
    features = build_feature_frame(synthetic_price_df)

    assert len(features) == len(synthetic_price_df)
    for col in FEATURE_COLUMNS:
        assert col in features.columns


def test_rsi_bounded_between_0_and_100(synthetic_price_df):
    rsi = compute_rsi(synthetic_price_df["close"])
    assert rsi.min() >= 0
    assert rsi.max() <= 100
    assert not rsi.isna().any()


def test_macd_signal_and_histogram_relationship(synthetic_price_df):
    macd, signal, hist = compute_macd(synthetic_price_df["close"])
    np.testing.assert_allclose(hist.to_numpy(), (macd - signal).to_numpy(), atol=1e-9)


def test_bollinger_bands_ordering(synthetic_price_df):
    upper, middle, lower = compute_bollinger_bands(synthetic_price_df["close"])
    valid = middle.notna()
    assert (upper[valid] >= middle[valid]).all()
    assert (middle[valid] >= lower[valid]).all()


def test_atr_is_non_negative(synthetic_price_df):
    atr = compute_atr(synthetic_price_df)
    valid = atr.notna()
    assert (atr[valid] >= 0).all()


def test_ema_ordering_reflects_recent_uptrend(synthetic_price_df):
    features = build_feature_frame(synthetic_price_df)
    last = features.iloc[-1]
    # the synthetic fixture has a strong upward drift, so shorter EMAs
    # should sit at or above longer ones at the end of the series
    assert last["ema_20"] >= last["ema_50"] * 0.95
    assert last["ema_50"] >= last["ema_200"] * 0.85


def test_long_emas_are_undefined_until_their_window_fills(synthetic_price_df):
    features = build_feature_frame(synthetic_price_df)
    assert features["ema_200"].iloc[:199].isna().all()
    assert features["ema_200"].iloc[199:].notna().all()


def test_build_feature_frame_no_nan_after_warmup(synthetic_price_df):
    features = build_feature_frame(synthetic_price_df)
    # the 200-bar EMA is the longest window; past it every model feature exists
    warmed_up = features.iloc[250:]
    assert not warmed_up[FEATURE_COLUMNS].isna().any().any()


def test_model_features_are_scale_invariant(synthetic_price_df):
    """Guards the extrapolation fix: a model trained on these features must see
    the same inputs whether the stock trades at $10 or $1,000."""
    scaled = synthetic_price_df.copy()
    scaled[["open", "high", "low", "close"]] *= 10

    base = build_feature_frame(synthetic_price_df)[FEATURE_COLUMNS]
    rescaled = build_feature_frame(scaled)[FEATURE_COLUMNS]

    np.testing.assert_allclose(base.to_numpy(), rescaled.to_numpy(), rtol=1e-9, equal_nan=True)


def test_supervised_target_is_forward_log_return(synthetic_price_df):
    horizon = 5
    X, y = build_supervised_dataset(synthetic_price_df, horizon)

    close = synthetic_price_df["close"]
    expected = np.log(close.shift(-horizon) / close).reindex(y.index)
    np.testing.assert_allclose(y.to_numpy(), expected.to_numpy())


def test_build_supervised_dataset_alignment(synthetic_price_df):
    horizon = 5
    X, y = build_supervised_dataset(synthetic_price_df, horizon)

    assert len(X) == len(y)
    assert list(X.columns) == FEATURE_COLUMNS
    assert not X.isna().any().any()
    assert not y.isna().any()
    assert len(X) > 0
    # the last `horizon` bars have no forward return yet
    assert X.index[-1] == synthetic_price_df.index[-1 - horizon]


def test_latest_feature_rows_reach_the_most_recent_bar(synthetic_price_df):
    latest = latest_feature_rows(synthetic_price_df, count=3)
    assert len(latest) == 3
    assert latest.index[-1] == synthetic_price_df.index[-1]
    assert not latest.isna().any().any()


def test_zero_width_bollinger_band_does_not_produce_infinities():
    dates = pd.date_range("2024-01-01", periods=260, freq="B")
    flat = pd.DataFrame(
        {"open": 50.0, "high": 50.0, "low": 50.0, "close": 50.0, "volume": 1_000},
        index=dates,
    )
    features = build_feature_frame(flat)[FEATURE_COLUMNS]
    assert not np.isinf(features.to_numpy(dtype=float)).any()
