"""Out-of-sample evaluation for log-return forecasters.

Models predict the log return over a horizon; every metric here is reported
against realised prices so it stays interpretable, alongside the two numbers
that say whether the model is worth anything at all:

* skill    - 1 - RMSE / RMSE(random walk). Above 0 means the model beats the
             "tomorrow's price is today's price" baseline; below 0 means it
             doesn't. Price-level R^2 looks great for any persistent series,
             so skill is the honest headline.
* hit_rate - share of holdout samples where the predicted direction matched
             the realised direction.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

HOLDOUT_FRACTION = 0.2
CALIBRATION_FRACTION = 0.2
MIN_TRAIN_SAMPLES = 40


@dataclass
class Split:
    X_train: pd.DataFrame
    y_train: pd.Series
    X_calibration: pd.DataFrame
    y_calibration: pd.Series
    X_holdout: pd.DataFrame
    y_holdout: pd.Series


def purged_split(
    X: pd.DataFrame,
    y: pd.Series,
    horizon_days: int,
    holdout_fraction: float = HOLDOUT_FRACTION,
    calibration_fraction: float = CALIBRATION_FRACTION,
) -> Split:
    """Chronological train | calibration | holdout split with purge gaps.

    A sample at position i has a target spanning bars (i, i + h]. If i + h
    reaches into the next segment, that segment's prices have leaked into the
    earlier one. Dropping h samples before each boundary removes the leak, so
    the calibration window is unseen by training and the holdout is unseen by
    both.
    """
    n = len(X)
    n_holdout = max(int(round(n * holdout_fraction)), 1)
    n_calibration = max(int(round(n * calibration_fraction)), 1)

    holdout_start = n - n_holdout
    calibration_end = holdout_start - horizon_days
    calibration_start = calibration_end - n_calibration
    train_end = calibration_start - horizon_days

    if train_end < MIN_TRAIN_SAMPLES:
        raise ValueError(
            f"Not enough data for a purged split: {train_end} training samples "
            f"after purging (need {MIN_TRAIN_SAMPLES})"
        )

    return Split(
        X_train=X.iloc[:train_end],
        y_train=y.iloc[:train_end],
        X_calibration=X.iloc[calibration_start:calibration_end],
        y_calibration=y.iloc[calibration_start:calibration_end],
        X_holdout=X.iloc[holdout_start:],
        y_holdout=y.iloc[holdout_start:],
    )


def score_predictions(
    predicted_returns: np.ndarray,
    realised_returns: np.ndarray,
    base_prices: np.ndarray,
) -> dict:
    predicted_returns = np.asarray(predicted_returns, dtype=float)
    realised_returns = np.asarray(realised_returns, dtype=float)
    base_prices = np.asarray(base_prices, dtype=float)

    predicted_price = base_prices * np.exp(predicted_returns)
    realised_price = base_prices * np.exp(realised_returns)

    errors = predicted_price - realised_price
    rmse = float(np.sqrt(np.mean(errors**2)))
    mape = float(np.mean(np.abs(errors / realised_price)))

    ss_res = float(np.sum(errors**2))
    ss_tot = float(np.sum((realised_price - realised_price.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    naive_rmse = float(np.sqrt(np.mean((base_prices - realised_price) ** 2)))
    skill = 1 - rmse / naive_rmse if naive_rmse > 0 else 0.0

    hit_rate = float(np.mean((predicted_returns > 0) == (realised_returns > 0)))

    residuals = realised_returns - predicted_returns
    residual_std = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0

    return {
        "rmse": rmse,
        "mape": mape,
        "r2": float(r2),
        "naive_rmse": naive_rmse,
        "skill": float(skill),
        "hit_rate": hit_rate,
        "residual_std": residual_std,
    }


def evaluate_model(model, X_holdout: pd.DataFrame, y_holdout: pd.Series, close: pd.Series) -> dict:
    base_prices = close.reindex(X_holdout.index).to_numpy()
    predicted = model.predict(X_holdout)
    return score_predictions(predicted, y_holdout.to_numpy(), base_prices)
