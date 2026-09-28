import json
import threading
from datetime import datetime, timezone

from app.ml import model_store
from app.ml.features import FEATURE_VERSION


def _record(version: str = "v1") -> model_store.ModelRecord:
    return model_store.ModelRecord(
        symbol="AAPL",
        horizon="5d",
        version=version,
        trained_at=datetime.now(timezone.utc).isoformat(),
        rmse=1.0,
        mape=0.01,
        r2=0.9,
        feature_version=FEATURE_VERSION,
    )


def test_saving_leaves_no_temp_files_behind(isolated_model_dir):
    model_store.save_model("AAPL", "5d", {"weights": [1, 2, 3]}, _record())
    model_store.save_check("AAPL", "5d", {"drift_status": "stable"})

    names = sorted(p.name for p in isolated_model_dir.iterdir())
    assert names == ["AAPL_5d_meta.json", "AAPL_5d_v1.joblib"]


def test_readers_never_see_a_half_written_metadata_file(isolated_model_dir):
    model_store.save_model("AAPL", "5d", {"weights": [0]}, _record())
    stop = threading.Event()
    failures: list[Exception] = []

    def keep_reading():
        while not stop.is_set():
            try:
                model_store.load_metadata("AAPL", "5d")
            except Exception as exc:
                failures.append(exc)

    reader = threading.Thread(target=keep_reading)
    reader.start()
    for i in range(200):
        model_store.save_check("AAPL", "5d", {"drift_status": "stable", "i": i, "pad": "x" * 5000})
    stop.set()
    reader.join()

    assert failures == []


def test_retrain_log_skips_a_line_mid_append(isolated_model_dir):
    model_store.append_retrain_log("AAPL", "5d", "manual", {"rmse": 1.0}, True, "v1")
    with (isolated_model_dir / "retrain_log.jsonl").open("a") as f:
        f.write('{"timestamp": "2026-')  # a concurrent writer's partial line

    entries = model_store.read_retrain_log(symbol="AAPL")
    assert len(entries) == 1
    assert entries[0]["model_version"] == "v1"


def test_records_from_older_versions_load_with_defaults(isolated_model_dir):
    legacy = {"record": {"symbol": "AAPL", "horizon": "5d", "version": "v3", "trained_at": "2025-01-01T00:00:00Z",
                         "rmse": 1.0, "mape": 0.1, "r2": 0.5, "some_retired_field": 42}}
    (isolated_model_dir / "AAPL_5d_meta.json").write_text(json.dumps(legacy))

    record = model_store.load_record("AAPL", "5d")
    assert record.version == "v3"
    assert record.feature_version == 1
    assert not model_store.is_compatible(record)
