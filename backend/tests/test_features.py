import numpy as np

from app.ml.features import (
    FEATURE_COLUMNS,
    build_feature_frame,
    build_supervised_dataset,
    compute_atr,
    compute_bollinger_bands,
    compute_macd,
    compute_rsi,
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
    # histogram is defined as macd - signal by construction
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


def test_build_feature_frame_no_nan_after_warmup(synthetic_price_df):
    features = build_feature_frame(synthetic_price_df)
    # drop the warm-up window where long rolling windows (EMA 200, BB, ATR)
    # are still filling; beyond that, no NaNs should remain
    warmed_up = features.iloc[250:]
    assert not warmed_up[FEATURE_COLUMNS].isna().any().any()


def test_build_supervised_dataset_alignment(synthetic_price_df):
    horizon = 5
    X, y = build_supervised_dataset(synthetic_price_df, horizon)

    assert len(X) == len(y)
    assert list(X.columns) == FEATURE_COLUMNS
    assert not X.isna().any().any()
    assert not y.isna().any()
    assert len(X) > 0
