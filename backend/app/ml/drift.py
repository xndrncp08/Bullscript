"""Feature-distribution drift detection via the Population Stability Index.

At training time each feature's distribution is summarised as quantile bin
edges plus the share of training samples in each bin. At check time the most
recent window of feature rows is binned on the same edges and compared.

Rule of thumb for PSI: < 0.1 stable, 0.1-0.2 moderate shift, > 0.2 the market
regime the model learned from no longer describes the data it's scoring.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

PSI_BINS = 5
PSI_WINDOW = 60
_EPS = 1e-4


def _bin_proportions(values: np.ndarray, edges: np.ndarray) -> np.ndarray:
    idx = np.searchsorted(edges, values, side="right")
    counts = np.bincount(idx, minlength=len(edges) + 1)
    return counts / max(len(values), 1)


def build_reference(X_train: pd.DataFrame, bins: int = PSI_BINS) -> dict[str, dict]:
    quantiles = np.linspace(0, 1, bins + 1)[1:-1]
    reference = {}
    for column in X_train.columns:
        values = X_train[column].to_numpy(dtype=float)
        edges = np.unique(np.quantile(values, quantiles))
        reference[column] = {
            "edges": edges.tolist(),
            "expected": _bin_proportions(values, edges).tolist(),
        }
    return reference


def population_stability_index(expected, actual) -> float:
    e = np.clip(np.asarray(expected, dtype=float), _EPS, None)
    a = np.clip(np.asarray(actual, dtype=float), _EPS, None)
    return float(np.sum((a - e) * np.log(a / e)))


def score_drift(reference: dict[str, dict], X_recent: pd.DataFrame) -> dict:
    per_feature: dict[str, float] = {}
    for column, ref in reference.items():
        if column not in X_recent.columns:
            continue
        actual = _bin_proportions(
            X_recent[column].to_numpy(dtype=float), np.asarray(ref["edges"], dtype=float)
        )
        per_feature[column] = population_stability_index(ref["expected"], actual)

    mean_psi = float(np.mean(list(per_feature.values()))) if per_feature else 0.0
    return {"psi": mean_psi, "per_feature": per_feature}
