"""Background scheduler driving the self-training loop."""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app.ml.pipeline import check_all_tracked_models

logger = logging.getLogger("bullscript.scheduler")

_scheduler = AsyncIOScheduler()


def _run_drift_check() -> None:
    logger.info("Running scheduled drift check across tracked models")
    results = check_all_tracked_models()
    for key, result in results.items():
        logger.info("Drift check %s -> %s", key, result)


def start_scheduler() -> None:
    if _scheduler.running:
        return
    _scheduler.add_job(
        _run_drift_check,
        "interval",
        minutes=settings.retrain_check_interval_minutes,
        id="drift_check",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Self-training scheduler started (interval=%sm)",
        settings.retrain_check_interval_minutes,
    )


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
