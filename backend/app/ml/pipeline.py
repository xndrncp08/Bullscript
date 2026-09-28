"""Self-training pipeline: train, evaluate, drift-check, and promote models.

The loop works per (symbol, horizon) pair:
  1. Pull fresh price history and build a sliding-window supervised dataset.
  2. Evaluate the currently active model against the most recent holdout slice.
  3. If no active model exists, or performance has drifted past threshold,
     train a challenger model and promote it if it beats the incumbent
     (or none exists yet).
  4. Log the evaluation/retrain outcome regardless of whether promotion happened.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

from app.config import settings
from app.ml import model_store
from app.ml.features import FEATURE_COLUMNS, build_supervised_dataset
from app.ml.model_store import ModelRecord
from app.services.data_fetcher import fetch_price_history

HOLDOUT_FRACTION = 0.15


def _train_model(X: pd.DataFrame, y: pd.Series) -> XGBRegressor:
    model = XGBRegressor(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="reg:squarederror",
        random_state=42,
    )
    model.fit(X, y)
    return model


def _evaluate(model, X: pd.DataFrame, y: pd.Series) -> dict:
    preds = model.predict(X)
    rmse = float(np.sqrt(mean_squared_error(y, preds)))
    mape = float(mean_absolute_percentage_error(y, preds))
    r2 = float(r2_score(y, preds))
    return {"rmse": rmse, "mape": mape, "r2": r2}


def _has_drifted(metrics: dict) -> bool:
    return (
        metrics["mape"] > settings.drift_mape_threshold
        or metrics["rmse"] / max(metrics.get("scale", 1.0), 1e-6)
        > settings.drift_rmse_threshold
    )


def run_training_cycle(symbol: str, horizon_key: str, force: bool = False) -> dict:
    """Run one evaluate -> (maybe) retrain -> promote cycle for a symbol/horizon."""
    horizon_days = settings.forecast_horizons[horizon_key]
    price_df = fetch_price_history(symbol)
    X, y = build_supervised_dataset(price_df, horizon_days)

    if len(X) < 60:
        raise ValueError(
            f"Not enough data to train {symbol} {horizon_key}: only {len(X)} samples"
        )

    X_train, X_holdout, y_train, y_holdout = train_test_split(
        X, y, test_size=HOLDOUT_FRACTION, shuffle=False
    )

    active_model, active_record = model_store.load_active_model(symbol, horizon_key)
    scale = float(y_holdout.mean()) or 1.0

    trigger = "scheduled"
    should_retrain = force or active_model is None

    incumbent_metrics = None
    if active_model is not None:
        incumbent_metrics = _evaluate(active_model, X_holdout, y_holdout)
        incumbent_metrics["scale"] = scale
        if _has_drifted(incumbent_metrics):
            should_retrain = True
            trigger = "drift"

    if not should_retrain:
        model_store.append_retrain_log(
            symbol=symbol,
            horizon=horizon_key,
            trigger="scheduled_check_no_action",
            rmse=incumbent_metrics["rmse"],
            mape=incumbent_metrics["mape"],
            r2=incumbent_metrics["r2"],
            promoted=False,
            model_version=active_record.version,
        )
        return {"promoted": False, "metrics": incumbent_metrics, "version": active_record.version}

    challenger = _train_model(X_train, y_train)
    challenger_metrics = _evaluate(challenger, X_holdout, y_holdout)
    challenger_metrics["scale"] = scale

    promote = active_model is None or challenger_metrics["rmse"] <= (
        incumbent_metrics["rmse"] if incumbent_metrics else float("inf")
    )

    version = model_store.next_version(symbol, horizon_key)

    if promote:
        importances = dict(
            zip(FEATURE_COLUMNS, [float(v) for v in challenger.feature_importances_])
        )
        record = ModelRecord(
            symbol=symbol.upper(),
            horizon=horizon_key,
            version=version,
            trained_at=datetime.now(timezone.utc).isoformat(),
            rmse=challenger_metrics["rmse"],
            mape=challenger_metrics["mape"],
            r2=challenger_metrics["r2"],
            feature_importances=importances,
        )
        model_store.save_model(symbol, horizon_key, challenger, record)
        final_metrics = challenger_metrics
        final_version = version
    else:
        final_metrics = incumbent_metrics
        final_version = active_record.version

    model_store.append_retrain_log(
        symbol=symbol,
        horizon=horizon_key,
        trigger=trigger,
        rmse=final_metrics["rmse"],
        mape=final_metrics["mape"],
        r2=final_metrics["r2"],
        promoted=promote,
        model_version=final_version,
    )

    return {"promoted": promote, "metrics": final_metrics, "version": final_version}


def run_full_retrain(symbol: str, horizons: list[str] | None = None) -> dict[str, dict]:
    horizons = horizons or list(settings.forecast_horizons.keys())
    results = {}
    for horizon_key in horizons:
        results[horizon_key] = run_training_cycle(symbol, horizon_key, force=True)
    return results


def check_all_tracked_models() -> dict[str, dict]:
    """Scheduled entry point: re-check drift for every tracked (symbol, horizon)."""
    results = {}
    for symbol, horizon_key in model_store.list_tracked_pairs():
        try:
            results[f"{symbol}_{horizon_key}"] = run_training_cycle(symbol, horizon_key)
        except Exception as exc:  # keep the loop alive if one symbol fails
            results[f"{symbol}_{horizon_key}"] = {"error": str(exc)}
    return results
