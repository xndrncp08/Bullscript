"""Feature drift, measured as extrapolation risk.

Tree ensembles don't extrapolate: when an input moves outside the range seen
in training, every split on it saturates and the model is guessing from its
edge. So the drift signal is the share of recent feature values that fall
outside the central 99% of what the deployed model was fit on, averaged over
features ("out-of-range share").

Why not PSI: these features are slow-moving and autocorrelated (ATR %,
distance from the 200-day EMA, realised vol), so any short recent window
covers only a slice of their historical range. Measured on real data, 60-bar
windows drawn from the training set itself score a median PSI of ~0.9-1.2 -
the usual 0.2 threshold would flag drift permanently. The out-of-range share
for the same windows is under 1%.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

DRIFT_WINDOW = 60
TAIL = 0.005


def build_reference(X_train: pd.DataFrame) -> dict[str, dict]:
    """Per-feature bounds of the central 99% of the training distribution."""
    reference = {}
    for column in X_train.columns:
        values = X_train[column].to_numpy(dtype=float)
        lo, hi = np.quantile(values, [TAIL, 1 - TAIL])
        reference[column] = {"lo": float(lo), "hi": float(hi)}
    return reference


def score_drift(reference: dict[str, dict], X_recent: pd.DataFrame) -> dict | None:
    """Share of recent values outside each feature's training range.

    Returns None when the reference predates range bounds (older models), so
    callers can tell "no drift" from "can't tell".
    """
    per_feature: dict[str, float] = {}
    for column, bounds in reference.items():
        if column not in X_recent.columns or "lo" not in bounds:
            continue
        values = X_recent[column].to_numpy(dtype=float)
        outside = (values < bounds["lo"]) | (values > bounds["hi"])
        per_feature[column] = float(outside.mean()) if len(values) else 0.0

    if not per_feature:
        return None
    return {"ood": float(np.mean(list(per_feature.values()))), "per_feature": per_feature}
