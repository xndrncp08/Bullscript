"""Model persistence, versioning, and retrain-log storage on disk."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import joblib

from app.config import settings


@dataclass
class ModelRecord:
    symbol: str
    horizon: str
    version: str
    trained_at: str
    rmse: float
    mape: float
    r2: float
    feature_importances: dict[str, float] = field(default_factory=dict)


def _key(symbol: str, horizon: str) -> str:
    return f"{symbol.upper()}_{horizon}"


def _model_path(symbol: str, horizon: str, version: str) -> Path:
    return settings.model_dir / f"{_key(symbol, horizon)}_{version}.joblib"


def _metadata_path(symbol: str, horizon: str) -> Path:
    return settings.model_dir / f"{_key(symbol, horizon)}_meta.json"


def _log_path() -> Path:
    return settings.model_dir / "retrain_log.jsonl"


def next_version(symbol: str, horizon: str) -> str:
    meta = load_metadata(symbol, horizon)
    if meta is None:
        return "v1"
    current = int(meta["record"]["version"].lstrip("v"))
    return f"v{current + 1}"


def save_model(symbol: str, horizon: str, model, record: ModelRecord) -> Path:
    path = _model_path(symbol, horizon, record.version)
    joblib.dump(model, path)
    metadata = {"record": asdict(record)}
    _metadata_path(symbol, horizon).write_text(json.dumps(metadata, indent=2))
    return path


def load_metadata(symbol: str, horizon: str) -> dict | None:
    path = _metadata_path(symbol, horizon)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def load_active_model(symbol: str, horizon: str):
    meta = load_metadata(symbol, horizon)
    if meta is None:
        return None, None
    record = ModelRecord(**meta["record"])
    path = _model_path(symbol, horizon, record.version)
    if not path.exists():
        return None, record
    return joblib.load(path), record


def append_retrain_log(
    symbol: str,
    horizon: str,
    trigger: str,
    rmse: float,
    mape: float,
    r2: float,
    promoted: bool,
    model_version: str,
) -> None:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "symbol": symbol.upper(),
        "horizon": horizon,
        "trigger": trigger,
        "rmse": rmse,
        "mape": mape,
        "r2": r2,
        "promoted": promoted,
        "model_version": model_version,
    }
    with _log_path().open("a") as f:
        f.write(json.dumps(entry) + "\n")


def read_retrain_log(symbol: str | None = None, limit: int = 100) -> list[dict]:
    path = _log_path()
    if not path.exists():
        return []
    entries = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if symbol:
        entries = [e for e in entries if e["symbol"] == symbol.upper()]
    return entries[-limit:][::-1]


def list_tracked_pairs() -> list[tuple[str, str]]:
    pairs = []
    for meta_file in settings.model_dir.glob("*_meta.json"):
        stem = meta_file.stem.removesuffix("_meta")
        symbol, horizon = stem.rsplit("_", 1)
        pairs.append((symbol, horizon))
    return pairs
