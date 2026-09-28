import math

import numpy as np
import pandas as pd
import pytest

from app.ml import forecaster, model_store


@pytest.fixture
def trending_to_highs_df():
    """A compounding uptrend that closes at an all-time high - the case where
    the old price-level model forecast a collapse back toward older prices."""
    rng = np.random.default_rng(3)
    n = 700
    dates = pd.date_range("2023-01-02", periods=n, freq="B")
    close = 100 * np.exp(np.cumsum(0.0015 + rng.normal(0, 0.012, n)))
    close[-1] = close.max() * 1.005

    open_ = close * (1 + rng.normal(0, 0.003, n))
    high = np.maximum(open_, close) * (1 + rng.uniform(0, 0.005, n))
    low = np.minimum(open_, close) * (1 - rng.uniform(0, 0.005, n))
    volume = rng.integers(1_000_000, 5_000_000, n)

    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=dates,
    )
    df.index.name = "date"
    return df


@pytest.fixture
def served(monkeypatch, trending_to_highs_df):
    monkeypatch.setattr(forecaster, "fetch_price_history", lambda symbol: trending_to_highs_df)
    return trending_to_highs_df


def test_path_dates_are_the_next_business_days():
    friday = pd.Timestamp("2026-09-25")
    points = forecaster.build_path(100.0, friday, 0.0, 0.05, horizon_days=5, interval=0.8)

    dates = [p["date"] for p in points]
    assert [d.isoformat() for d in dates] == [
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
    ]


def test_path_interval_widens_to_the_calibrated_width_at_the_horizon():
    sigma, horizon, r = 0.08, 4, 0.02
    points = forecaster.build_path(100.0, pd.Timestamp("2026-01-05"), r, sigma, horizon, 0.8)

    widths = [p["upper_bound"] - p["lower_bound"] for p in points]
    assert widths == sorted(widths)

    last = points[-1]
    z = 1.2816
    assert last["predicted_close"] == pytest.approx(100 * math.exp(r), abs=0.01)
    assert last["upper_bound"] == pytest.approx(100 * math.exp(r + z * sigma), abs=0.01)
    assert last["lower_bound"] == pytest.approx(100 * math.exp(r - z * sigma), abs=0.01)


def test_path_rejects_an_unsupported_interval():
    with pytest.raises(ValueError, match="interval"):
        forecaster.build_path(100.0, pd.Timestamp("2026-01-05"), 0.0, 0.05, 5, interval=0.73)


def test_forecast_at_all_time_highs_does_not_collapse(served):
    result = forecaster.generate_forecast("TREND", "30d", price_df=served)
    last_close = float(served["close"].iloc[-1])

    assert -0.15 < result["expected_return"] < 0.3
    assert result["target_price"] == pytest.approx(
        last_close * (1 + result["expected_return"]), rel=1e-4
    )
    horizon_point = result["points"][-1]
    assert horizon_point["lower_bound"] < horizon_point["predicted_close"] < horizon_point["upper_bound"]
    # an 80% band on a 30-day horizon should be a band, not the whole price axis
    assert horizon_point["upper_bound"] / horizon_point["lower_bound"] < 1.6


def test_forecast_reports_model_quality_alongside_the_path(served):
    result = forecaster.generate_forecast("TREND", "5d", price_df=served)

    assert result["horizon_days"] == 5
    assert len(result["points"]) == 5
    assert result["interval"] == 0.8
    assert 0 <= result["hit_rate"] <= 1
    assert result["skill"] is not None
    assert result["model_version"] == "v1"


def test_forecast_reuses_the_active_model(served):
    forecaster.generate_forecast("TREND", "14d", price_df=served)
    forecaster.generate_forecast("TREND", "14d", price_df=served)

    assert model_store.load_record("TREND", "14d").version == "v1"


def test_concurrent_first_forecasts_train_the_model_once(served):
    """Two tabs (or a retry) asking for a symbol nobody has forecast yet
    must not each train and version the same model."""
    import threading

    barrier = threading.Barrier(4)
    errors: list[Exception] = []

    def request_forecast():
        barrier.wait()
        try:
            forecaster.generate_forecast("RACE", "5d", price_df=served)
        except Exception as exc:  # surfaced by the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=request_forecast) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert model_store.load_record("RACE", "5d").version == "v1"
    assert len(model_store.read_retrain_log(symbol="RACE")) == 1


def test_forecast_path_logs_why_it_trained(served):
    forecaster.generate_forecast("WHY", "5d", price_df=served)
    assert model_store.read_retrain_log(symbol="WHY")[0]["trigger"] == "bootstrap"


def test_all_forecasts_cover_every_horizon_in_order(served):
    result = forecaster.generate_all_forecasts("trend")

    assert result["symbol"] == "TREND"
    assert result["as_of"] == served.index[-1].date()
    assert [h["horizon"] for h in result["horizons"]] == ["5d", "14d", "30d"]
