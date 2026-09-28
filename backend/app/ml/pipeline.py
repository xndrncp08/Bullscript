"""Self-training pipeline: evaluate, detect drift, retrain, promote.

Per (symbol, horizon):
  1. Build a supervised dataset of scale-free features -> forward log return.
  2. Split it chronologically with a purge gap (see evaluation.purged_split).
  3. Score the active model on the holdout and measure how far the most recent
     feature window has drifted from the distribution it was trained on.
  4. Retrain when forced, when no compatible model exists, when skill against
     a random walk falls below the floor, or when the features have drifted.
  5. Promote the challenger only if it matches or beats the incumbent on the
     same holdout, so a retrain can never make the live model worse.
  6. Log every cycle - promotions, kept incumbents, and no-ops alike.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd
from xgboost import XGBRegressor

from app.config import settings
from app.ml import model_store
from app.ml.drift import PSI_WINDOW, build_reference, score_drift
from app.ml.estimators import ShrunkRegressor, fit_shrinkage
from app.ml.evaluation import Split, evaluate_model, purged_split
from app.ml.features import (
    FEATURE_COLUMNS,
    FEATURE_VERSION,
    build_supervised_dataset,
    latest_feature_rows,
)
from app.ml.model_store import ModelRecord
from app.services.data_fetcher import fetch_price_history

MIN_SAMPLES = 60

TRIGGER_MANUAL = "manual"
TRIGGER_BOOTSTRAP = "bootstrap"
TRIGGER_SCHEMA = "schema_upgrade"
TRIGGER_PERFORMANCE = "performance_drift"
TRIGGER_DATA = "data_drift"
TRIGGER_NOOP = "scheduled_check_no_action"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _train_model(split: Split) -> ShrunkRegressor:
    # Returns are mostly noise; shallow, heavily regularised trees keep the
    # model from memorising it, and early stopping on the calibration window
    # picks how many trees the signal actually supports.
    base = XGBRegressor(
        n_estimators=400,
        max_depth=3,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_lambda=2.0,
        objective="reg:squarederror",
        early_stopping_rounds=40,
        random_state=42,
    )
    base.fit(
        split.X_train,
        split.y_train,
        eval_set=[(split.X_calibration, split.y_calibration)],
        verbose=False,
    )
    weight = fit_shrinkage(base.predict(split.X_calibration), split.y_calibration.to_numpy())
    return ShrunkRegressor(base, weight)


def _drift_reasons(metrics: dict, psi: float | None) -> list[str]:
    reasons = []
    if metrics["skill"] < settings.drift_skill_floor:
        reasons.append(TRIGGER_PERFORMANCE)
    if psi is not None and psi > settings.drift_psi_threshold:
        reasons.append(TRIGGER_DATA)
    return reasons


def _recent_psi(reference: dict, price_df: pd.DataFrame) -> float | None:
    if not reference:
        return None
    return score_drift(reference, latest_feature_rows(price_df, PSI_WINDOW))["psi"]


def run_training_cycle(
    symbol: str,
    horizon_key: str,
    force: bool = False,
    price_df: pd.DataFrame | None = None,
) -> dict:
    """Run one evaluate -> (maybe) retrain -> promote cycle for a symbol/horizon."""
    horizon_days = settings.forecast_horizons[horizon_key]
    if price_df is None:
        price_df = fetch_price_history(symbol)

    X, y = build_supervised_dataset(price_df, horizon_days)
    if len(X) < MIN_SAMPLES:
        raise ValueError(
            f"Not enough data to train {symbol} {horizon_key}: only {len(X)} samples"
        )

    split = purged_split(X, y, horizon_days)
    close = price_df["close"]

    active_model, active_record = model_store.load_active_model(symbol, horizon_key)
    compatible = active_model is not None and model_store.is_compatible(active_record)

    incumbent_metrics = None
    psi = None
    reasons: list[str] = []
    if compatible:
        incumbent_metrics = evaluate_model(active_model, split.X_holdout, split.y_holdout, close)
        psi = _recent_psi(active_record.feature_reference, price_df)
        reasons = _drift_reasons(incumbent_metrics, psi)

    if force:
        trigger = TRIGGER_MANUAL
    elif active_model is None:
        trigger = TRIGGER_BOOTSTRAP
    elif not compatible:
        trigger = TRIGGER_SCHEMA
    elif reasons:
        trigger = reasons[0]
    else:
        trigger = None

    drift_status = "drift" if reasons else ("stable" if compatible else "unknown")

    if trigger is None:
        model_store.save_check(
            symbol,
            horizon_key,
            {
                "timestamp": _now(),
                "drift_status": drift_status,
                "action": "none",
                "psi": psi,
                "skill": incumbent_metrics["skill"],
                "hit_rate": incumbent_metrics["hit_rate"],
                "rmse": incumbent_metrics["rmse"],
            },
        )
        model_store.append_retrain_log(
            symbol, horizon_key, TRIGGER_NOOP, incumbent_metrics, False, active_record.version, psi
        )
        return {
            "promoted": False,
            "trigger": TRIGGER_NOOP,
            "metrics": incumbent_metrics,
            "psi": psi,
            "version": active_record.version,
        }

    challenger = _train_model(split)
    challenger_metrics = evaluate_model(challenger, split.X_holdout, split.y_holdout, close)

    promote = not compatible or challenger_metrics["rmse"] <= incumbent_metrics["rmse"]

    if promote:
        version = model_store.next_version(symbol, horizon_key)
        reference = build_reference(split.X_train)
        record = ModelRecord(
            symbol=symbol.upper(),
            horizon=horizon_key,
            version=version,
            trained_at=_now(),
            rmse=challenger_metrics["rmse"],
            mape=challenger_metrics["mape"],
            r2=challenger_metrics["r2"],
            feature_importances={
                name: float(value)
                for name, value in zip(FEATURE_COLUMNS, challenger.feature_importances_)
            },
            feature_version=FEATURE_VERSION,
            target="log_return",
            skill=challenger_metrics["skill"],
            hit_rate=challenger_metrics["hit_rate"],
            naive_rmse=challenger_metrics["naive_rmse"],
            residual_std=challenger_metrics["residual_std"],
            shrinkage=challenger.weight,
            train_samples=len(split.X_train),
            calibration_samples=len(split.X_calibration),
            holdout_samples=len(split.X_holdout),
            train_end=split.X_train.index[-1].date().isoformat(),
            feature_reference=reference,
        )
        model_store.save_model(symbol, horizon_key, challenger, record)
        final_metrics, final_version = challenger_metrics, version
        check_psi = _recent_psi(reference, price_df)
    else:
        final_metrics, final_version = incumbent_metrics, active_record.version
        check_psi = psi

    model_store.save_check(
        symbol,
        horizon_key,
        {
            "timestamp": _now(),
            "drift_status": drift_status,
            "action": "promoted" if promote else "kept_incumbent",
            "psi": check_psi,
            "skill": final_metrics["skill"],
            "hit_rate": final_metrics["hit_rate"],
            "rmse": final_metrics["rmse"],
        },
    )
    model_store.append_retrain_log(
        symbol, horizon_key, trigger, final_metrics, promote, final_version, psi
    )

    return {
        "promoted": promote,
        "trigger": trigger,
        "metrics": final_metrics,
        "psi": psi,
        "version": final_version,
    }


def run_full_retrain(symbol: str, horizons: list[str] | None = None) -> dict[str, dict]:
    horizons = horizons or list(settings.forecast_horizons)
    unknown = [h for h in horizons if h not in settings.forecast_horizons]
    if unknown:
        raise ValueError(f"Unknown forecast horizon(s): {', '.join(unknown)}")

    price_df = fetch_price_history(symbol)
    return {
        horizon_key: run_training_cycle(symbol, horizon_key, force=True, price_df=price_df)
        for horizon_key in horizons
    }


def check_all_tracked_models() -> dict[str, dict]:
    """Scheduled entry point: re-check drift for every tracked (symbol, horizon)."""
    by_symbol: dict[str, list[str]] = defaultdict(list)
    for symbol, horizon_key in model_store.list_tracked_pairs():
        if horizon_key in settings.forecast_horizons:
            by_symbol[symbol].append(horizon_key)

    results: dict[str, dict] = {}
    for symbol, horizons in by_symbol.items():
        try:
            price_df = fetch_price_history(symbol)
        except Exception as exc:  # keep the loop alive if one symbol fails
            for horizon_key in horizons:
                results[f"{symbol}_{horizon_key}"] = {"error": str(exc)}
            continue

        for horizon_key in horizons:
            try:
                results[f"{symbol}_{horizon_key}"] = run_training_cycle(
                    symbol, horizon_key, price_df=price_df
                )
            except Exception as exc:
                results[f"{symbol}_{horizon_key}"] = {"error": str(exc)}
    return results
