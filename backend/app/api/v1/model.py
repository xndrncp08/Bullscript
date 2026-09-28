from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from app.config import settings
from app.core.limiter import limiter
from app.ml import model_store
from app.ml.pipeline import run_full_retrain
from app.models.schemas import (
    SYMBOL_PATTERN,
    DiagnosticsResponse,
    ModelDiagnostics,
    RetrainRequest,
)
from app.services.data_fetcher import TickerNotFoundError

router = APIRouter(prefix="/model", tags=["model"])

LOG_ENTRIES_PER_MODEL = 20


def _horizon_order(horizon: str) -> int:
    return settings.forecast_horizons.get(horizon, 10_000)


@router.get("/diagnostics", response_model=DiagnosticsResponse)
@limiter.limit("60/minute")
def get_diagnostics(
    request: Request,
    symbol: Annotated[str | None, Query(pattern=SYMBOL_PATTERN)] = None,
):
    pairs = model_store.list_tracked_pairs()
    if symbol:
        pairs = [(s, h) for s, h in pairs if s == symbol.upper()]
    pairs.sort(key=lambda pair: (pair[0], _horizon_order(pair[1])))

    log = model_store.read_retrain_log(symbol=symbol, limit=1000)

    models = []
    for pair_symbol, horizon in pairs:
        meta = model_store.load_metadata(pair_symbol, horizon)
        if meta is None:
            continue
        record = model_store.load_record(pair_symbol, horizon)
        entries = [e for e in log if e["symbol"] == pair_symbol and e["horizon"] == horizon]

        models.append(
            ModelDiagnostics(
                symbol=pair_symbol,
                horizon=horizon,
                model_version=record.version,
                compatible=model_store.is_compatible(record),
                target=record.target,
                trained_at=record.trained_at,
                train_end=record.train_end,
                train_samples=record.train_samples,
                calibration_samples=record.calibration_samples,
                holdout_samples=record.holdout_samples,
                rmse=record.rmse,
                mape=record.mape,
                r2=record.r2,
                skill=record.skill,
                hit_rate=record.hit_rate,
                naive_rmse=record.naive_rmse,
                residual_std=record.residual_std,
                shrinkage=record.shrinkage,
                feature_importances=record.feature_importances,
                last_check=meta.get("last_check"),
                retrain_log=entries[:LOG_ENTRIES_PER_MODEL],
            )
        )

    return DiagnosticsResponse(
        generated_at=datetime.now(timezone.utc),
        drift_skill_floor=settings.drift_skill_floor,
        drift_psi_threshold=settings.drift_psi_threshold,
        models=models,
    )


@router.post("/retrain")
@limiter.limit("5/minute")
def trigger_retrain(request: Request, payload: RetrainRequest):
    horizons = payload.horizons or list(settings.forecast_horizons.keys())
    try:
        results = run_full_retrain(payload.symbol, horizons)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"symbol": payload.symbol.upper(), "results": results}
