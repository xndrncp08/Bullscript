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
    assert record.trees >= 1


def test_deployed_model_is_refit_on_all_labelled_history(price_feed, synthetic_price_df):
    pipeline.run_training_cycle("AAPL", "5d")

    record = model_store.load_record("AAPL", "5d")
    X, _ = pipeline.build_supervised_dataset(synthetic_price_df, 5)
    # evaluated on segments, deployed on everything - including recent bars
    assert record.fit_samples == len(X)
    assert record.fit_samples > record.train_samples + record.calibration_samples
    assert record.train_end == X.index[-1].date().isoformat()


def test_promoted_model_starts_with_no_feature_drift(price_feed):
    """Regression: the deployed model used to be fit only on the oldest ~60%
    of history, so the recent window always looked drifted against it and
    the scheduler retrained every hour, forever."""
    pipeline.run_training_cycle("AAPL", "5d")

    check = model_store.load_metadata("AAPL", "5d")["last_check"]
    assert check["action"] == "promoted"
    assert check["drift_status"] == "unknown"
    assert check["ood"] < pipeline.settings.drift_ood_threshold


def test_repeat_checks_on_unchanged_data_do_not_retrain(price_feed):
    pipeline.run_training_cycle("AAPL", "14d")

    for _ in range(3):
        result = pipeline.run_training_cycle("AAPL", "14d")
        assert result["trigger"] == pipeline.TRIGGER_NOOP

    assert model_store.load_record("AAPL", "14d").version == "v1"


def test_live_skill_is_measured_only_on_bars_after_training(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df.iloc[:-60])
    pipeline.run_training_cycle("AAPL", "5d")
    trained_through = model_store.load_record("AAPL", "5d").train_end

    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)
    pipeline.run_training_cycle("AAPL", "5d")

    check = model_store.load_metadata("AAPL", "5d")["last_check"]
    X, _ = pipeline.build_supervised_dataset(synthetic_price_df, 5)
    unseen = int((X.index > trained_through).sum())
    # the first horizon's worth of new bars share target prices with training
    assert check["live_samples"] == unseen - 5
    assert check["live_skill"] is not None


def test_no_live_verdict_until_enough_new_bars(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df.iloc[:-10])
    pipeline.run_training_cycle("AAPL", "5d")

    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)
    pipeline.run_training_cycle("AAPL", "5d")

    check = model_store.load_metadata("AAPL", "5d")["last_check"]
    assert check["live_samples"] == 0
    assert check["live_skill"] is None


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
    monkeypatch.setattr(pipeline, "_drift_reasons", lambda metrics, ood: [])

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
    monkeypatch.setattr(pipeline, "_drift_reasons", lambda metrics, ood: [reason])

    result = pipeline.run_training_cycle("TSLA", "5d")

    assert result["trigger"] == reason
    assert model_store.load_metadata("TSLA", "5d")["last_check"]["drift_status"] == "drift"
    assert model_store.read_retrain_log(symbol="TSLA")[0]["trigger"] == reason


def test_drift_reasons_thresholds(monkeypatch):
    monkeypatch.setattr(pipeline.settings, "drift_skill_floor", -0.1)
    monkeypatch.setattr(pipeline.settings, "drift_ood_threshold", 0.1)

    assert pipeline._drift_reasons({"skill": 0.05}, 0.05) == []
    assert pipeline._drift_reasons({"skill": -0.3}, 0.05) == [pipeline.TRIGGER_PERFORMANCE]
    assert pipeline._drift_reasons({"skill": 0.05}, 0.3) == [pipeline.TRIGGER_DATA]
    assert pipeline._drift_reasons({"skill": 0.05}, None) == []
    # no live bars yet: no performance verdict either way
    assert pipeline._drift_reasons(None, 0.05) == []


def test_clearly_worse_challenger_does_not_replace_incumbent(monkeypatch, price_feed):
    pipeline.run_training_cycle("NVDA", "5d")
    monkeypatch.setattr(pipeline, "_drift_reasons", lambda metrics, ood: [pipeline.TRIGGER_DATA])

    real_evaluate = pipeline.evaluate_model

    def evaluate_with_worse_challenger(model, X, y, close):
        metrics = real_evaluate(model, X, y, close)
        metrics["skill"] -= 0.5
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
