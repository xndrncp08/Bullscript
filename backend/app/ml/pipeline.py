"""Self-training pipeline: evaluate, detect drift, retrain, promote.

Per (symbol, horizon):
  1. Build a supervised dataset of scale-free features -> forward log return.
  2. Evaluate the *procedure*: fit on the train segment, early-stop and
     calibrate a shrinkage weight on the calibration segment, score once on
     the untouched holdout (see evaluation.purged_split). Those are the
     metrics reported for the model.
  3. Deploy a *refit*: the same procedure fit on all labelled history, with
     the early-stopped tree count and the calibrated weight. The deployed
     model has seen the current regime; its drift reference is what it was
     actually fit on.
  4. On each scheduled check, monitor the deployed model:
       - live performance: skill on bars that arrived after its training
         window (purged by one horizon), once there are enough of them;
       - data drift: the share of recent feature values outside the range it
         was fit on (see drift.py for why this and not PSI).
  5. Retrain when forced, when no compatible model exists, or on either kind
     of drift. Promote the challenger unless it's clearly worse than the
     incumbent's best evidence.
  6. Log every cycle - promotions, kept incumbents, and no-ops alike.
"""

from __future__ import annotations

import threading
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd
from xgboost import XGBRegressor

from app.config import settings
from app.ml import model_store
from app.ml.drift import DRIFT_WINDOW, build_reference, score_drift
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
# Live skill needs enough post-training bars to mean anything.
MIN_LIVE_SAMPLES = 20
# A challenger is promoted unless its holdout skill trails the incumbent's
# evidence by more than this. Windows differ, so small gaps are noise.
PROMOTION_TOLERANCE = 0.05

TRIGGER_MANUAL = "manual"
TRIGGER_BOOTSTRAP = "bootstrap"
TRIGGER_SCHEMA = "schema_upgrade"
TRIGGER_PERFORMANCE = "performance_drift"
TRIGGER_DATA = "data_drift"
TRIGGER_NOOP = "scheduled_check_no_action"

# Returns are mostly noise; shallow, heavily regularised trees keep the model
# from memorising it.
_XGB_PARAMS = dict(
    max_depth=3,
    learning_rate=0.03,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    reg_lambda=2.0,
    objective="reg:squarederror",
    random_state=42,
)
_MAX_TREES = 400


_locks_guard = threading.Lock()
_training_locks: dict[str, threading.RLock] = {}


def training_lock(symbol: str, horizon_key: str) -> threading.RLock:
    """One lock per (symbol, horizon). The API serves requests on a thread
    pool, so two requests for a symbol nobody has forecast yet would
    otherwise each train (and version) the same model."""
    key = f"{symbol.upper()}_{horizon_key}"
    with _locks_guard:
        lock = _training_locks.get(key)
        if lock is None:
            lock = _training_locks[key] = threading.RLock()
        return lock


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fit_procedure(split: Split) -> tuple[ShrunkRegressor, int]:
    """Fit on the train segment, early-stopping on calibration, and calibrate
    the shrinkage weight there. Returns the model and the tree count the
    signal supported."""
    base = XGBRegressor(n_estimators=_MAX_TREES, early_stopping_rounds=40, **_XGB_PARAMS)
    base.fit(
        split.X_train,
        split.y_train,
        eval_set=[(split.X_calibration, split.y_calibration)],
        verbose=False,
    )
    weight = fit_shrinkage(base.predict(split.X_calibration), split.y_calibration.to_numpy())
    best = getattr(base, "best_iteration", None)
    trees = best + 1 if best is not None else _MAX_TREES
    return ShrunkRegressor(base, weight), trees


def _refit(X: pd.DataFrame, y: pd.Series, trees: int, weight: float) -> ShrunkRegressor:
    base = XGBRegressor(n_estimators=trees, **_XGB_PARAMS)
    base.fit(X, y)
    return ShrunkRegressor(base, weight)


def _drift_reasons(live_metrics: dict | None, ood: float | None) -> list[str]:
    reasons = []
    if live_metrics is not None and live_metrics["skill"] < settings.drift_skill_floor:
        reasons.append(TRIGGER_PERFORMANCE)
    if ood is not None and ood > settings.drift_ood_threshold:
        reasons.append(TRIGGER_DATA)
    return reasons


def _recent_ood(reference: dict, price_df: pd.DataFrame) -> float | None:
    if not reference:
        return None
    result = score_drift(reference, latest_feature_rows(price_df, DRIFT_WINDOW))
    return result["ood"] if result else None


def _live_rows(
    X: pd.DataFrame, y: pd.Series, train_end: str | None, horizon_days: int
) -> tuple[pd.DataFrame, pd.Series] | None:
    """Labelled rows the model has never been trained on, purged by one
    horizon so none of their target prices overlap its training targets."""
    if not train_end:
        return None
    trained_through = int((X.index <= pd.Timestamp(train_end)).sum())
    start = trained_through + horizon_days
    if len(X) - start < MIN_LIVE_SAMPLES:
        return None
    return X.iloc[start:], y.iloc[start:]


def _record_metrics(record: ModelRecord) -> dict:
    return {
        "rmse": record.rmse,
        "mape": record.mape,
        "r2": record.r2,
        "skill": record.skill,
        "hit_rate": record.hit_rate,
    }


def run_training_cycle(
    symbol: str,
    horizon_key: str,
    force: bool = False,
    price_df: pd.DataFrame | None = None,
) -> dict:
    """Run one monitor -> (maybe) retrain -> promote cycle for a symbol/horizon."""
    with training_lock(symbol, horizon_key):
        return _run_training_cycle(symbol, horizon_key, force, price_df)


def _run_training_cycle(
    symbol: str,
    horizon_key: str,
    force: bool,
    price_df: pd.DataFrame | None,
) -> dict:
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

    live = None
    live_samples = 0
    ood = None
    reasons: list[str] = []
    if compatible:
        rows = _live_rows(X, y, active_record.train_end, horizon_days)
        if rows is not None:
            live = evaluate_model(active_model, rows[0], rows[1], close)
            live_samples = len(rows[0])
        ood = _recent_ood(active_record.feature_reference, price_df)
        reasons = _drift_reasons(live, ood)

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

    def check(action: str, ood_value: float | None, metrics: dict) -> dict:
        return {
            "timestamp": _now(),
            "drift_status": drift_status,
            "action": action,
            "ood": ood_value,
            "skill": metrics.get("skill"),
            "hit_rate": metrics.get("hit_rate"),
            "rmse": metrics.get("rmse"),
            "live_skill": live["skill"] if live else None,
            "live_hit_rate": live["hit_rate"] if live else None,
            "live_samples": live_samples,
        }

    if trigger is None:
        metrics = live or _record_metrics(active_record)
        model_store.save_check(symbol, horizon_key, check("none", ood, metrics))
        model_store.append_retrain_log(
            symbol, horizon_key, TRIGGER_NOOP, metrics, False, active_record.version, ood
        )
        return {
            "promoted": False,
            "trigger": TRIGGER_NOOP,
            "metrics": metrics,
            "ood": ood,
            "version": active_record.version,
        }

    challenger, trees = _fit_procedure(split)
    challenger_metrics = evaluate_model(challenger, split.X_holdout, split.y_holdout, close)

    # The incumbent's best evidence: live skill if it has any, else the
    # holdout skill it was promoted on.
    incumbent_skill = None
    if compatible:
        incumbent_skill = live["skill"] if live else active_record.skill
    promote = incumbent_skill is None or challenger_metrics["skill"] >= incumbent_skill - PROMOTION_TOLERANCE

    if promote:
        deployed = _refit(X, y, trees, challenger.weight)
        version = model_store.next_version(symbol, horizon_key)
        reference = build_reference(X)
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
                for name, value in zip(FEATURE_COLUMNS, deployed.feature_importances_)
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
            fit_samples=len(X),
            trees=trees,
            train_end=X.index[-1].date().isoformat(),
            feature_reference=reference,
        )
        model_store.save_model(symbol, horizon_key, deployed, record)
        final_metrics, final_version = challenger_metrics, version
        model_store.save_check(
            symbol, horizon_key, check("promoted", _recent_ood(reference, price_df), final_metrics)
        )
    else:
        final_metrics, final_version = live or _record_metrics(active_record), active_record.version
        model_store.save_check(symbol, horizon_key, check("kept_incumbent", ood, final_metrics))

    model_store.append_retrain_log(
        symbol, horizon_key, trigger, final_metrics, promote, final_version, ood
    )

    return {
        "promoted": promote,
        "trigger": trigger,
        "metrics": final_metrics,
        "ood": ood,
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
