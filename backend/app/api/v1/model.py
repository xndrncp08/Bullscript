from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.core.limiter import limiter
from app.ml import model_store
from app.ml.pipeline import run_full_retrain
from app.models.schemas import DiagnosticsResponse, ModelDiagnostics, RetrainRequest
from app.services.data_fetcher import TickerNotFoundError

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/diagnostics", response_model=DiagnosticsResponse)
@limiter.limit("60/minute")
def get_diagnostics(request: Request):
    models = []
    for symbol, horizon in model_store.list_tracked_pairs():
        meta = model_store.load_metadata(symbol, horizon)
        record = meta["record"] if meta else {}
        log = model_store.read_retrain_log(symbol=symbol, limit=20)
        log = [entry for entry in log if entry["horizon"] == horizon]

        models.append(
            ModelDiagnostics(
                symbol=symbol,
                horizon=horizon,
                model_version=record.get("version", "unset"),
                trained_at=record.get("trained_at"),
                rmse=record.get("rmse"),
                mape=record.get("mape"),
                r2=record.get("r2"),
                feature_importances=record.get("feature_importances", {}),
                retrain_log=log,
            )
        )

    return DiagnosticsResponse(generated_at=datetime.now(timezone.utc), models=models)


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
