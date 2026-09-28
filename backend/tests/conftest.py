import numpy as np
import pandas as pd
import pytest

from app.config import settings


@pytest.fixture
def synthetic_price_df():
    """Deterministic synthetic OHLCV history with a mild upward drift."""
    rng = np.random.default_rng(seed=42)
    n = 400
    dates = pd.date_range("2023-01-01", periods=n, freq="B")

    drift = np.linspace(0, 40, n)
    noise = rng.normal(0, 1.5, n).cumsum() * 0.3
    close = 100 + drift + noise
    close = np.clip(close, 5, None)

    open_ = close + rng.normal(0, 0.5, n)
    high = np.maximum(open_, close) + rng.uniform(0.1, 1.0, n)
    low = np.minimum(open_, close) - rng.uniform(0.1, 1.0, n)
    volume = rng.integers(1_000_000, 5_000_000, n)

    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=dates,
    )
    df.index.name = "date"
    return df


@pytest.fixture(autouse=True)
def isolated_model_dir(tmp_path, monkeypatch):
    """Redirect model persistence to a temp directory for every test."""
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    monkeypatch.setattr(settings, "model_dir", model_dir)
    yield model_dir


@pytest.fixture
def sample_headlines():
    return [
        {"headline": "Company beats earnings expectations by wide margin", "source": "Reuters", "published_at": None},
        {"headline": "Regulators announce probe into accounting practices", "source": "Bloomberg", "published_at": None},
        {"headline": "Quarterly revenue in line with analyst estimates", "source": "CNBC", "published_at": None},
    ]
