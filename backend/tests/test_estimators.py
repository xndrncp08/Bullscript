import numpy as np
import pytest

from app.ml.estimators import ShrunkRegressor, fit_shrinkage


class _Constant:
    feature_importances_ = np.array([0.7, 0.3])

    def __init__(self, value: float):
        self.value = value

    def predict(self, X):
        return np.full(len(X), self.value)


def test_shrinkage_keeps_a_well_calibrated_signal():
    predicted = np.array([0.01, -0.02, 0.03, -0.01])
    assert fit_shrinkage(predicted, predicted) == pytest.approx(1.0)


def test_shrinkage_scales_down_an_overconfident_signal():
    predicted = np.array([0.04, -0.02, 0.06, -0.04])
    realised = predicted / 2
    assert fit_shrinkage(predicted, realised) == pytest.approx(0.5)


def test_shrinkage_withholds_an_anticorrelated_signal():
    predicted = np.array([0.01, -0.02, 0.03, -0.01])
    assert fit_shrinkage(predicted, -predicted) == 0.0


def test_shrinkage_is_capped_at_one():
    predicted = np.array([0.01, -0.01])
    assert fit_shrinkage(predicted, predicted * 5) == 1.0


def test_shrinkage_of_an_all_zero_signal_is_zero():
    assert fit_shrinkage(np.zeros(3), np.array([0.01, 0.02, -0.01])) == 0.0


def test_shrunk_regressor_scales_predictions_and_exposes_importances():
    model = ShrunkRegressor(_Constant(0.1), weight=0.25)

    np.testing.assert_allclose(model.predict([[0], [0]]), [0.025, 0.025])
    np.testing.assert_allclose(model.feature_importances_, [0.7, 0.3])
