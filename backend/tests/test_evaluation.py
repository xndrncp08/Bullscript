import numpy as np
import pandas as pd
import pytest

from app.ml.evaluation import purged_split, score_predictions


def _frame(n: int) -> tuple[pd.DataFrame, pd.Series]:
    index = pd.date_range("2024-01-01", periods=n, freq="B")
    X = pd.DataFrame({"f": np.arange(n, dtype=float)}, index=index)
    y = pd.Series(np.zeros(n), index=index)
    return X, y


def _position(X: pd.DataFrame, label) -> int:
    return X.index.get_loc(label)


def test_purged_split_leaves_a_horizon_sized_gap_before_each_later_segment():
    X, y = _frame(300)
    horizon = 10

    split = purged_split(X, y, horizon, holdout_fraction=0.2, calibration_fraction=0.2)

    train_last = _position(X, split.X_train.index[-1])
    calibration_first = _position(X, split.X_calibration.index[0])
    calibration_last = _position(X, split.X_calibration.index[-1])
    holdout_first = _position(X, split.X_holdout.index[0])

    # a sample's target covers (i, i + h]; it must end before the next segment begins
    assert train_last + horizon < calibration_first
    assert calibration_last + horizon < holdout_first
    assert len(split.X_holdout) == 60
    assert len(split.X_calibration) == 60
    assert len(split.X_train) == 300 - 60 - 60 - 2 * horizon


def test_purged_split_segments_are_chronological_and_disjoint():
    X, y = _frame(300)
    split = purged_split(X, y, horizon_days=5)

    assert split.X_train.index.max() < split.X_calibration.index.min()
    assert split.X_calibration.index.max() < split.X_holdout.index.min()
    assert split.X_holdout.index[-1] == X.index[-1]


def test_purged_split_refuses_when_too_little_training_data_remains():
    X, y = _frame(100)
    with pytest.raises(ValueError, match="purged split"):
        purged_split(X, y, horizon_days=30)


def test_perfect_forecast_scores_full_skill_and_hit_rate():
    realised = np.array([0.02, -0.01, 0.03, -0.02])
    base = np.array([100.0, 101.0, 99.0, 102.0])

    metrics = score_predictions(realised, realised, base)

    assert metrics["rmse"] == pytest.approx(0.0)
    assert metrics["skill"] == pytest.approx(1.0)
    assert metrics["hit_rate"] == pytest.approx(1.0)
    assert metrics["residual_std"] == pytest.approx(0.0)


def test_zero_return_forecast_matches_the_random_walk_baseline():
    realised = np.array([0.02, -0.01, 0.03, -0.02])
    base = np.array([100.0, 101.0, 99.0, 102.0])

    metrics = score_predictions(np.zeros(4), realised, base)

    assert metrics["rmse"] == pytest.approx(metrics["naive_rmse"])
    assert metrics["skill"] == pytest.approx(0.0)


def test_wrong_direction_forecast_has_negative_skill_and_zero_hit_rate():
    realised = np.array([0.02, -0.01, 0.03, -0.02])
    base = np.full(4, 100.0)

    metrics = score_predictions(-realised, realised, base)

    assert metrics["skill"] < 0
    assert metrics["hit_rate"] == pytest.approx(0.0)


def test_metrics_are_reported_in_price_space():
    base = np.array([200.0])
    realised = np.array([np.log(1.1)])  # realised price 220
    predicted = np.array([np.log(1.05)])  # predicted price 210

    metrics = score_predictions(predicted, realised, base)

    assert metrics["rmse"] == pytest.approx(10.0)
    assert metrics["naive_rmse"] == pytest.approx(20.0)
    assert metrics["skill"] == pytest.approx(0.5)
