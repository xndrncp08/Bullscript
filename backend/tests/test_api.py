from datetime import datetime, timezone

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.api.v1 import model as model_route
from app.api.v1 import ticker as ticker_route
from app.ml import model_store
from app.ml.features import FEATURE_VERSION
from main import app

client = TestClient(app)


@pytest.fixture
def mocked_chart(monkeypatch, synthetic_price_df):
    monkeypatch.setattr(ticker_route, "fetch_price_history", lambda symbol: synthetic_price_df)
    return synthetic_price_df


@pytest.fixture
def mocked_prediction(monkeypatch):
    fake_result = {
        "symbol": "AAPL",
        "as_of": "2024-01-01",
        "last_close": 187.32,
        "horizons": [
            {
                "horizon": "5d",
                "horizon_days": 5,
                "model_version": "v1",
                "target_price": 188.1,
                "expected_return": 0.0042,
                "interval": 0.8,
                "hit_rate": 0.56,
                "skill": 0.03,
                "points": [
                    {
                        "date": "2024-01-02",
                        "predicted_close": 188.1,
                        "lower_bound": 182.0,
                        "upper_bound": 194.0,
                    }
                ],
            }
        ],
    }
    monkeypatch.setattr(ticker_route, "generate_all_forecasts", lambda symbol: fake_result)
    return fake_result


@pytest.fixture
def mocked_sentiment(monkeypatch):
    fake_result = {
        "generated_at": datetime.now(timezone.utc),
        "weighted_score": 0.21,
        "label": "bullish",
        "headlines": [
            {
                "headline": "Great quarter",
                "source": "Reuters",
                "published_at": None,
                "label": "positive",
                "positive": 0.9,
                "neutral": 0.08,
                "negative": 0.02,
            }
        ],
    }
    monkeypatch.setattr(ticker_route, "fetch_recent_news", lambda symbol, limit=15: [])
    monkeypatch.setattr(ticker_route, "analyze_symbol_sentiment", lambda headlines: fake_result)
    return fake_result


def test_root_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_get_chart_returns_200_and_valid_schema(mocked_chart):
    response = client.get("/api/v1/ticker/AAPL/chart")
    assert response.status_code == 200

    body = response.json()
    assert body["symbol"] == "AAPL"
    assert len(body["candles"]) == len(mocked_chart)
    assert "rsi_14" in body["indicators"][-1]


def test_get_chart_404_for_unknown_symbol(monkeypatch):
    from app.services.data_fetcher import TickerNotFoundError

    def raise_not_found(symbol):
        raise TickerNotFoundError(f"No price history found for symbol '{symbol}'")

    monkeypatch.setattr(ticker_route, "fetch_price_history", raise_not_found)

    response = client.get("/api/v1/ticker/ZZZZZZ/chart")
    assert response.status_code == 404


def test_get_prediction_returns_200_and_valid_schema(mocked_prediction):
    response = client.get("/api/v1/ticker/AAPL/prediction")
    assert response.status_code == 200

    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["as_of"] == "2024-01-01"
    assert len(body["horizons"]) == 1
    horizon = body["horizons"][0]
    assert horizon["horizon"] == "5d"
    assert horizon["model_version"] == "v1"
    assert horizon["interval"] == 0.8
    assert horizon["hit_rate"] == 0.56


def test_get_sentiment_returns_200_and_valid_schema(mocked_sentiment):
    response = client.get("/api/v1/ticker/AAPL/sentiment")
    assert response.status_code == 200

    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["label"] == "bullish"
    assert len(body["headlines"]) == 1


def test_get_diagnostics_returns_200_with_empty_models_when_untracked():
    response = client.get("/api/v1/model/diagnostics")
    assert response.status_code == 200
    assert response.json()["models"] == []


def _save_record(symbol: str, horizon: str, **overrides):
    fields = {
        "symbol": symbol,
        "horizon": horizon,
        "version": "v1",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "rmse": 1.2,
        "mape": 0.05,
        "r2": 0.9,
        "feature_importances": {"rsi_14": 0.4, "dist_ema_20": 0.2},
        "feature_version": FEATURE_VERSION,
        "target": "log_return",
        "skill": 0.04,
        "hit_rate": 0.57,
        "residual_std": 0.03,
    }
    fields.update(overrides)
    model_store.save_model(symbol, horizon, object(), model_store.ModelRecord(**fields))


def test_get_diagnostics_surfaces_tracked_model():
    _save_record("AAPL", "5d")

    response = client.get("/api/v1/model/diagnostics")
    assert response.status_code == 200

    body = response.json()
    assert body["drift_skill_floor"] < 0
    assert body["drift_ood_threshold"] > 0
    assert len(body["models"]) == 1
    model = body["models"][0]
    assert model["symbol"] == "AAPL"
    assert model["rmse"] == 1.2
    assert model["skill"] == 0.04
    assert model["hit_rate"] == 0.57
    assert model["compatible"] is True
    assert model["last_check"] is None


def test_get_diagnostics_filters_by_symbol_and_orders_by_horizon():
    _save_record("AAPL", "30d")
    _save_record("AAPL", "5d")
    _save_record("MSFT", "5d")

    body = client.get("/api/v1/model/diagnostics", params={"symbol": "aapl"}).json()

    assert [(m["symbol"], m["horizon"]) for m in body["models"]] == [
        ("AAPL", "5d"),
        ("AAPL", "30d"),
    ]


def test_get_diagnostics_flags_legacy_models_as_incompatible():
    _save_record("AAPL", "5d", feature_version=1, target="price")

    model = client.get("/api/v1/model/diagnostics").json()["models"][0]
    assert model["compatible"] is False


def test_get_diagnostics_includes_the_latest_drift_check():
    _save_record("AAPL", "5d")
    model_store.save_check(
        "AAPL",
        "5d",
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "drift_status": "stable",
            "action": "none",
            "ood": 0.02,
            "live_skill": 0.03,
            "live_hit_rate": 0.55,
            "live_samples": 24,
            "skill": 0.04,
            "hit_rate": 0.57,
            "rmse": 1.2,
        },
    )

    check = client.get("/api/v1/model/diagnostics").json()["models"][0]["last_check"]
    assert check["drift_status"] == "stable"
    assert check["ood"] == 0.02
    assert check["live_samples"] == 24


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/ticker/AAPL;DROP/chart",
        "/api/v1/ticker/ABCDEFGHIJKLM/prediction",
        "/api/v1/ticker/%3Cscript%3E/sentiment",
    ],
)
def test_malformed_symbols_are_rejected(path):
    assert client.get(path).status_code == 422


def test_malformed_symbol_in_retrain_body_is_rejected():
    response = client.post("/api/v1/model/retrain", json={"symbol": "../etc"})
    assert response.status_code == 422


def test_retrain_with_unknown_horizon_is_rejected(monkeypatch):
    from app.ml import pipeline

    monkeypatch.setattr(pipeline, "fetch_price_history", lambda symbol: None)
    response = client.post("/api/v1/model/retrain", json={"symbol": "AAPL", "horizons": ["7d"]})
    assert response.status_code == 422


def test_post_retrain_triggers_pipeline_and_returns_results(monkeypatch):
    fake_results = {"5d": {"promoted": True, "metrics": {"rmse": 1.0}, "version": "v1"}}
    monkeypatch.setattr(model_route, "run_full_retrain", lambda symbol, horizons: fake_results)

    response = client.post("/api/v1/model/retrain", json={"symbol": "aapl"})
    assert response.status_code == 200

    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["results"] == fake_results


def test_post_retrain_404_for_unknown_symbol(monkeypatch):
    from app.services.data_fetcher import TickerNotFoundError

    def raise_not_found(symbol, horizons):
        raise TickerNotFoundError(f"No price history found for symbol '{symbol}'")

    monkeypatch.setattr(model_route, "run_full_retrain", raise_not_found)

    response = client.post("/api/v1/model/retrain", json={"symbol": "ZZZZZZ"})
    assert response.status_code == 404


def test_cors_headers_present_for_allowed_origin(mocked_chart):
    response = client.get(
        "/api/v1/ticker/AAPL/chart",
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_preflight_allows_post_for_retrain():
    response = client.options(
        "/api/v1/model/retrain",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_retrain_endpoint_returns_429_after_exceeding_its_rate_limit(monkeypatch):
    monkeypatch.setattr(model_route, "run_full_retrain", lambda symbol, horizons: {})

    # /model/retrain is limited to 5/minute
    for _ in range(5):
        response = client.post("/api/v1/model/retrain", json={"symbol": "RATE"})
        assert response.status_code == 200

    response = client.post("/api/v1/model/retrain", json={"symbol": "RATE"})
    assert response.status_code == 429
