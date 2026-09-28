"""Estimator wrappers persisted alongside the model record."""

from __future__ import annotations

import numpy as np


def fit_shrinkage(predicted: np.ndarray, realised: np.ndarray) -> float:
    """Least-squares weight w in [0, 1] for realised ~= w * predicted.

    Fit on a calibration window the model never trained on. A model whose
    out-of-sample calls carry no signal gets w -> 0 and degrades to the
    random-walk "no change" forecast instead of confidently predicting noise;
    a model with real signal keeps most of its magnitude.
    """
    predicted = np.asarray(predicted, dtype=float)
    realised = np.asarray(realised, dtype=float)
    denominator = float(np.dot(predicted, predicted))
    if denominator <= 0:
        return 0.0
    return float(np.clip(np.dot(predicted, realised) / denominator, 0.0, 1.0))


class ShrunkRegressor:
    """A fitted regressor whose output is scaled by a calibrated weight."""

    def __init__(self, base, weight: float):
        self.base = base
        self.weight = weight

    def predict(self, X):
        return self.weight * self.base.predict(X)

    @property
    def feature_importances_(self):
        return self.base.feature_importances_
