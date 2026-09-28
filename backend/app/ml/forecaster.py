"""Generate forward-looking price forecasts from an active trained model."""

from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from app.config import settings
from app.ml import model_store
from app.ml.features import FEATURE_COLUMNS, build_feature_frame
from app.ml.pipeline import run_training_cycle
from app.services.data_fetcher import fetch_price_history


def _confidence_band(predicted: float, rmse: float, horizon_days: int) -> tuple[float, float]:
    # Widen the band with the square root of the horizon to reflect compounding
    # uncertainty further out, scaled by the model's holdout RMSE.
    spread = rmse * np.sqrt(horizon_days)
    return predicted - spread, predicted + spread


def generate_forecast(symbol: str, horizon_key: str) -> dict:
    horizon_days = settings.forecast_horizons[horizon_key]
    model, record = model_store.load_active_model(symbol, horizon_key)

    if model is None:
        run_training_cycle(symbol, horizon_key, force=True)
        model, record = model_store.load_active_model(symbol, horizon_key)

    price_df = fetch_price_history(symbol)
    features = build_feature_frame(price_df).dropna(subset=FEATURE_COLUMNS)
    latest_features = features[FEATURE_COLUMNS].iloc[[-1]]

    predicted_close = float(model.predict(latest_features)[0])
    last_close = float(price_df["close"].iloc[-1])
    last_date = price_df.index[-1]

    lower, upper = _confidence_band(predicted_close, record.rmse, horizon_days)

    # Interpolate a smooth path from last known close to the horizon target so the
    # frontend can render a continuous line from history into the forecast zone.
    points = []
    for step in range(1, horizon_days + 1):
        t = step / horizon_days
        interpolated = last_close + (predicted_close - last_close) * t
        step_lower, step_upper = _confidence_band(interpolated, record.rmse, step)
        points.append(
            {
                "date": (last_date + timedelta(days=step)).date(),
                "predicted_close": round(interpolated, 2),
                "lower_bound": round(step_lower, 2),
                "upper_bound": round(step_upper, 2),
            }
        )

    confidence = float(max(0.0, min(1.0, 1 - record.mape)))

    return {
        "horizon": horizon_key,
        "points": points,
        "confidence": round(confidence, 4),
        "model_version": record.version,
        "last_close": last_close,
    }


def generate_all_forecasts(symbol: str) -> dict:
    horizons = []
    model_version = None
    last_close = None
    for horizon_key in settings.forecast_horizons:
        result = generate_forecast(symbol, horizon_key)
        model_version = result["model_version"]
        last_close = result["last_close"]
        horizons.append(
            {
                "horizon": result["horizon"],
                "points": result["points"],
                "confidence": result["confidence"],
            }
        )
    return {
        "symbol": symbol.upper(),
        "model_version": model_version,
        "last_close": last_close,
        "horizons": horizons,
    }
