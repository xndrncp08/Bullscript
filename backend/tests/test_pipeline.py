from datetime import datetime, timezone

import pytest

from app.ml import model_store, pipeline
from app.ml.features import FEATURE_COLUMNS, FEATURE_VERSION


@pytest.fixture
def price_feed(monkeypatch, synthetic_price_df):
    """Serve the synthetic history and count how often it's fetched."""
    calls = {"count": 0}

    def fake_fetch(symbol):
        calls["count"] += 1
        return synthetic_price_df

    monkeypatch.setattr(pipeline, "fetch_price_history", fake_fetch)
    return calls


def test_first_cycle_bootstraps_and_promotes_v1(price_feed):
    result = pipeline.run_training_cycle("AAPL", "5d")

    assert result["promoted"] is True
    assert result["trigger"] == pipeline.TRIGGER_BOOTSTRAP
    assert result["version"] == "v1"
    assert {"rmse", "mape", "r2", "skill", "hit_rate", "residual_std"} <= set(result["metrics"])

    model, record = model_store.load_active_model("AAPL", "5d")
    assert model is not None
    assert record.version == "v1"
    assert record.feature_version == FEATURE_VERSION
    assert record.target == "log_return"
    assert record.residual_std > 0
    assert 0 <= record.hit_rate <= 1
    assert set(record.feature_reference) == set(FEATURE_COLUMNS)
    assert record.train_samples > record.holdout_samples > 0


def test_promoted_model_records_a_drift_check(price_feed):
    pipeline.run_training_cycle("AAPL", "5d")

    check = model_store.load_metadata("AAPL", "5d")["last_check"]
    assert check["action"] == "promoted"
    assert check["drift_status"] == "unknown"
    assert check["psi"] is not None


def test_forced_retrain_increments_the_version(price_feed):
    first = pipeline.run_training_cycle("MSFT", "14d")
    second = pipeline.run_training_cycle("MSFT", "14d", force=True)

    assert first["version"] == "v1"
    assert second["trigger"] == pipeline.TRIGGER_MANUAL
    # same data + fixed seed -> identical challenger, which ties and is promoted
    assert second["version"] == "v2"
    assert model_store.load_active_model("MSFT", "14d")[1].version == "v2"


def test_stable_model_is_left_alone(monkeypatch, price_feed):
    pipeline.run_training_cycle("GOOG", "30d")
    monkeypatch.setattr(pipeline, "_drift_reasons", lambda metrics, psi: [])

    result = pipeline.run_training_cycle("GOOG", "30d")

    assert result["promoted"] is False
    assert result["trigger"] == pipeline.TRIGGER_NOOP
    assert result["version"] == "v1"
    assert model_store.load_metadata("GOOG", "30d")["last_check"]["drift_status"] == "stable"

    log = model_store.read_retrain_log(symbol="GOOG")
    assert log[0]["trigger"] == pipeline.TRIGGER_NOOP


@pytest.mark.parametrize("reason", [pipeline.TRIGGER_PERFORMANCE, pipeline.TRIGGER_DATA])
def test_drift_triggers_a_retrain(monkeypatch, price_feed, reason):
    pipeline.run_training_cycle("TSLA", "5d")
    monkeypatch.setattr(pipeline, "_drift_reasons", lambda metrics, psi: [reason])

    result = pipeline.run_training_cycle("TSLA", "5d")

    assert result["trigger"] == reason
    assert model_store.load_metadata("TSLA", "5d")["last_check"]["drift_status"] == "drift"
    assert model_store.read_retrain_log(symbol="TSLA")[0]["trigger"] == reason


def test_drift_reasons_thresholds(monkeypatch):
    monkeypatch.setattr(pipeline.settings, "drift_skill_floor", -0.1)
    monkeypatch.setattr(pipeline.settings, "drift_psi_threshold", 0.2)

    assert pipeline._drift_reasons({"skill": 0.05}, 0.05) == []
    assert pipeline._drift_reasons({"skill": -0.3}, 0.05) == [pipeline.TRIGGER_PERFORMANCE]
    assert pipeline._drift_reasons({"skill": 0.05}, 0.4) == [pipeline.TRIGGER_DATA]
    assert pipeline._drift_reasons({"skill": 0.05}, None) == []


def test_worse_challenger_does_not_replace_incumbent(monkeypatch, price_feed):
    pipeline.run_training_cycle("NVDA", "5d")
    monkeypatch.setattr(pipeline, "_drift_reasons", lambda metrics, psi: [pipeline.TRIGGER_DATA])

    real_evaluate = pipeline.evaluate_model
    calls = {"n": 0}

    def evaluate_with_worse_challenger(model, X, y, close):
        calls["n"] += 1
        metrics = real_evaluate(model, X, y, close)
        if calls["n"] == 2:  # 1st call scores the incumbent, 2nd the challenger
            metrics["rmse"] *= 10
        return metrics

    monkeypatch.setattr(pipeline, "evaluate_model", evaluate_with_worse_challenger)

    result = pipeline.run_training_cycle("NVDA", "5d")

    assert result["promoted"] is False
    assert result["version"] == "v1"
    assert model_store.load_metadata("NVDA", "5d")["last_check"]["action"] == "kept_incumbent"


def test_legacy_price_level_model_is_upgraded(price_feed):
    legacy = model_store.ModelRecord(
        symbol="AMD",
        horizon="5d",
        version="v3",
        trained_at=datetime.now(timezone.utc).isoformat(),
        rmse=5.0,
        mape=0.1,
        r2=0.5,
    )
    model_store.save_model("AMD", "5d", object(), legacy)

    result = pipeline.run_training_cycle("AMD", "5d")

    assert result["trigger"] == pipeline.TRIGGER_SCHEMA
    assert result["promoted"] is True
    assert result["version"] == "v4"
    assert model_store.load_active_model("AMD", "5d")[1].feature_version == FEATURE_VERSION


def test_insufficient_history_raises(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df.iloc[:30])

    with pytest.raises(ValueError, match="Not enough data"):
        pipeline.run_training_cycle("PENNY", "30d")


def test_full_retrain_covers_every_horizon_with_one_fetch(price_feed):
    results = pipeline.run_full_retrain("NFLX")

    assert set(results) == {"5d", "14d", "30d"}
    assert all(r["promoted"] for r in results.values())
    assert price_feed["count"] == 1


def test_full_retrain_rejects_unknown_horizons(price_feed):
    with pytest.raises(ValueError, match="Unknown forecast horizon"):
        pipeline.run_full_retrain("NFLX", ["7d"])


def test_scheduled_check_fetches_each_symbol_once(price_feed):
    pipeline.run_full_retrain("AAPL")
    price_feed["count"] = 0

    results = pipeline.check_all_tracked_models()

    assert set(results) == {"AAPL_5d", "AAPL_14d", "AAPL_30d"}
    assert price_feed["count"] == 1


def test_scheduled_check_survives_a_failing_symbol(monkeypatch, price_feed):
    pipeline.run_full_retrain("AAPL")

    def broken_fetch(symbol):
        raise RuntimeError("upstream timeout")

    monkeypatch.setattr(pipeline, "fetch_price_history", broken_fetch)
    results = pipeline.check_all_tracked_models()

    assert all("upstream timeout" in r["error"] for r in results.values())
