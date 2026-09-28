"""Model persistence, versioning, drift-check state, and retrain-log storage."""

from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path

import joblib

from app.config import settings
from app.ml.features import FEATURE_VERSION

_SAFE_KEY = re.compile(r"^[A-Z0-9.^=\-]+_[0-9]+d$")


def _atomic_write(path: Path, write) -> None:
    """Write via a temp file in the same directory, then rename over the
    target. Readers never see a half-written file - the diagnostics endpoint
    reads model metadata while a retrain may be writing it."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    os.close(fd)
    try:
        write(Path(tmp))
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


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
    # Fields below were added with feature version 2. Records written before
    # then load with these defaults and are flagged incompatible.
    feature_version: int = 1
    target: str = "price"
    skill: float | None = None
    hit_rate: float | None = None
    naive_rmse: float | None = None
    residual_std: float | None = None
    shrinkage: float | None = None
    # Evaluation segments of the procedure (metrics come from the holdout)...
    train_samples: int = 0
    calibration_samples: int = 0
    holdout_samples: int = 0
    # ...and the deployed refit: rows it was fit on, trees early stopping chose.
    fit_samples: int = 0
    trees: int = 0
    train_end: str | None = None
    feature_reference: dict[str, dict] = field(default_factory=dict)


_RECORD_FIELDS = {f.name for f in fields(ModelRecord)}


def is_compatible(record: ModelRecord | None) -> bool:
    return record is not None and record.feature_version == FEATURE_VERSION


def _key(symbol: str, horizon: str) -> str:
    key = f"{symbol.upper()}_{horizon}"
    # Keys become file names; refuse anything that could escape the model dir.
    if not _SAFE_KEY.match(key):
        raise ValueError(f"Unsafe model key: {key!r}")
    return key


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
    # binary first, metadata second: metadata never points at a model file
    # that isn't fully on disk
    _atomic_write(path, lambda tmp: joblib.dump(model, tmp))
    metadata = {"record": asdict(record), "last_check": None}
    _atomic_write(_metadata_path(symbol, horizon), lambda tmp: tmp.write_text(json.dumps(metadata, indent=2)))
    return path


def load_metadata(symbol: str, horizon: str) -> dict | None:
    path = _metadata_path(symbol, horizon)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _record_from_meta(meta: dict) -> ModelRecord:
    raw = {k: v for k, v in meta["record"].items() if k in _RECORD_FIELDS}
    return ModelRecord(**raw)


def load_record(symbol: str, horizon: str) -> ModelRecord | None:
    meta = load_metadata(symbol, horizon)
    return _record_from_meta(meta) if meta else None


def load_active_model(symbol: str, horizon: str):
    meta = load_metadata(symbol, horizon)
    if meta is None:
        return None, None
    record = _record_from_meta(meta)
    path = _model_path(symbol, horizon, record.version)
    if not path.exists():
        return None, record
    return joblib.load(path), record


def save_check(symbol: str, horizon: str, check: dict) -> None:
    """Persist the outcome of the most recent drift check alongside the model."""
    meta = load_metadata(symbol, horizon)
    if meta is None:
        return
    meta["last_check"] = check
    _atomic_write(_metadata_path(symbol, horizon), lambda tmp: tmp.write_text(json.dumps(meta, indent=2)))


def append_retrain_log(
    symbol: str,
    horizon: str,
    trigger: str,
    metrics: dict,
    promoted: bool,
    model_version: str,
    ood: float | None = None,
) -> None:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "symbol": symbol.upper(),
        "horizon": horizon,
        "trigger": trigger,
        "rmse": metrics.get("rmse"),
        "mape": metrics.get("mape"),
        "r2": metrics.get("r2"),
        "skill": metrics.get("skill"),
        "hit_rate": metrics.get("hit_rate"),
        "ood": ood,
        "promoted": promoted,
        "model_version": model_version,
    }
    with _log_path().open("a") as f:
        f.write(json.dumps(entry) + "\n")


def read_retrain_log(symbol: str | None = None, limit: int = 100) -> list[dict]:
    path = _log_path()
    if not path.exists():
        return []
    entries = []
    for line in path.read_text().splitlines():
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue  # a line mid-append by a concurrent writer
    if symbol:
        entries = [e for e in entries if e["symbol"] == symbol.upper()]
    return entries[-limit:][::-1]


def list_tracked_pairs() -> list[tuple[str, str]]:
    pairs = []
    for meta_file in sorted(settings.model_dir.glob("*_meta.json")):
        stem = meta_file.stem.removesuffix("_meta")
        symbol, horizon = stem.rsplit("_", 1)
        pairs.append((symbol, horizon))
    return pairs
