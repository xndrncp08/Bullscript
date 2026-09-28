from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings
from app.ml import model_store
from app.ml.pipeline import run_full_retrain
from app.models.schemas import DiagnosticsResponse, ModelDiagnostics, RetrainRequest

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/diagnostics", response_model=DiagnosticsResponse)
def get_diagnostics():
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
def trigger_retrain(payload: RetrainRequest):
    horizons = payload.horizons or list(settings.forecast_horizons.keys())
    results = run_full_retrain(payload.symbol, horizons)
    return {"symbol": payload.symbol.upper(), "results": results}
