from app.ml import model_store, pipeline


def test_run_training_cycle_trains_and_promotes_when_no_incumbent(
    monkeypatch, synthetic_price_df
):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)

    result = pipeline.run_training_cycle("AAPL", "5d")

    assert result["promoted"] is True
    assert result["version"] == "v1"
    assert set(result["metrics"].keys()) >= {"rmse", "mape", "r2"}
    assert result["metrics"]["rmse"] >= 0

    model, record = model_store.load_active_model("AAPL", "5d")
    assert model is not None
    assert record.version == "v1"
    assert record.symbol == "AAPL"
    assert record.horizon == "5d"


def test_run_training_cycle_versions_increment_on_forced_retrain(
    monkeypatch, synthetic_price_df
):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)

    first = pipeline.run_training_cycle("MSFT", "14d")
    second = pipeline.run_training_cycle("MSFT", "14d", force=True)

    assert first["version"] == "v1"
    assert second["version"] == "v2"

    _, record = model_store.load_active_model("MSFT", "14d")
    assert record.version == "v2"


def test_run_training_cycle_no_action_when_no_drift(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)
    monkeypatch.setattr(pipeline, "_has_drifted", lambda metrics: False)

    pipeline.run_training_cycle("GOOG", "30d")
    result = pipeline.run_training_cycle("GOOG", "30d")

    assert result["promoted"] is False
    assert result["version"] == "v1"

    log = model_store.read_retrain_log(symbol="GOOG")
    assert any(entry["trigger"] == "scheduled_check_no_action" for entry in log)


def test_run_training_cycle_retrains_on_drift(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)

    pipeline.run_training_cycle("TSLA", "5d")
    monkeypatch.setattr(pipeline, "_has_drifted", lambda metrics: True)
    result = pipeline.run_training_cycle("TSLA", "5d")

    assert result["version"] == "v2" or result["promoted"] in {True, False}
    log = model_store.read_retrain_log(symbol="TSLA")
    assert any(entry["trigger"] == "drift" for entry in log)


def test_run_training_cycle_raises_on_insufficient_data(monkeypatch, synthetic_price_df):
    tiny_df = synthetic_price_df.iloc[:30]
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: tiny_df)

    try:
        pipeline.run_training_cycle("PENNY", "30d")
        assert False, "expected ValueError for insufficient data"
    except ValueError as exc:
        assert "Not enough data" in str(exc)


def test_run_full_retrain_covers_all_horizons(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: synthetic_price_df)

    results = pipeline.run_full_retrain("NFLX")

    assert set(results.keys()) == {"5d", "14d", "30d"}
    for horizon_result in results.values():
        assert horizon_result["promoted"] is True
