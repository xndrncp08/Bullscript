"""Turn an active log-return model into a forward price path with an interval.

The model predicts the log return r over h trading days. The path to the
horizon target is geometric (price_k = P0 * exp(r * k/h)), and the interval
around it comes from the model's own out-of-sample residual spread sigma_h,
scaled by sqrt(k/h) so uncertainty grows from zero at the last close to the
full holdout-calibrated width at the horizon.
"""

from __future__ import annotations

import math

import pandas as pd

from app.config import settings
from app.ml import model_store
from app.ml.features import latest_feature_rows
from app.ml.pipeline import run_training_cycle
from app.services.data_fetcher import fetch_price_history

# Two-sided z-scores for the supported central intervals.
_Z_SCORES = {0.5: 0.6745, 0.8: 1.2816, 0.9: 1.6449, 0.95: 1.96}


def _z_for(interval: float) -> float:
    if interval not in _Z_SCORES:
        raise ValueError(f"Unsupported forecast interval {interval}")
    return _Z_SCORES[interval]


def build_path(
    last_close: float,
    last_date: pd.Timestamp,
    predicted_log_return: float,
    residual_std: float,
    horizon_days: int,
    interval: float,
) -> list[dict]:
    z = _z_for(interval)
    dates = pd.bdate_range(last_date + pd.offsets.BDay(1), periods=horizon_days)

    points = []
    for step, date in enumerate(dates, start=1):
        fraction = step / horizon_days
        mean = predicted_log_return * fraction
        spread = z * residual_std * math.sqrt(fraction)
        points.append(
            {
                "date": date.date(),
                "predicted_close": round(last_close * math.exp(mean), 2),
                "lower_bound": round(last_close * math.exp(mean - spread), 2),
                "upper_bound": round(last_close * math.exp(mean + spread), 2),
            }
        )
    return points


def generate_forecast(
    symbol: str, horizon_key: str, price_df: pd.DataFrame | None = None
) -> dict:
    horizon_days = settings.forecast_horizons[horizon_key]
    if price_df is None:
        price_df = fetch_price_history(symbol)

    model, record = model_store.load_active_model(symbol, horizon_key)
    if model is None or not model_store.is_compatible(record):
        run_training_cycle(symbol, horizon_key, force=True, price_df=price_df)
        model, record = model_store.load_active_model(symbol, horizon_key)

    predicted_log_return = float(model.predict(latest_feature_rows(price_df))[0])
    last_close = float(price_df["close"].iloc[-1])
    interval = settings.forecast_interval

    points = build_path(
        last_close=last_close,
        last_date=price_df.index[-1],
        predicted_log_return=predicted_log_return,
        residual_std=record.residual_std or 0.0,
        horizon_days=horizon_days,
        interval=interval,
    )

    target_price = last_close * math.exp(predicted_log_return)
    return {
        "horizon": horizon_key,
        "horizon_days": horizon_days,
        "model_version": record.version,
        "points": points,
        "target_price": round(target_price, 2),
        "expected_return": round(math.exp(predicted_log_return) - 1, 6),
        "interval": interval,
        "hit_rate": record.hit_rate,
        "skill": record.skill,
        "shrinkage": record.shrinkage,
    }


def generate_all_forecasts(symbol: str) -> dict:
    price_df = fetch_price_history(symbol)
    return {
        "symbol": symbol.upper(),
        "as_of": price_df.index[-1].date(),
        "last_close": round(float(price_df["close"].iloc[-1]), 2),
        "horizons": [
            generate_forecast(symbol, horizon_key, price_df=price_df)
            for horizon_key in settings.forecast_horizons
        ],
    }
