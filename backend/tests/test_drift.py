import numpy as np
import pandas as pd
import pytest

from app.ml.drift import build_reference, population_stability_index, score_drift


@pytest.fixture
def reference_frame():
    rng = np.random.default_rng(7)
    return pd.DataFrame({"a": rng.normal(0, 1, 2000), "b": rng.uniform(0, 1, 2000)})


def test_psi_is_zero_for_identical_distributions():
    assert population_stability_index([0.2] * 5, [0.2] * 5) == pytest.approx(0.0)


def test_psi_grows_with_distribution_shift():
    small = population_stability_index([0.2] * 5, [0.25, 0.2, 0.2, 0.2, 0.15])
    large = population_stability_index([0.2] * 5, [0.6, 0.1, 0.1, 0.1, 0.1])
    assert 0 < small < large


def test_reference_stores_quintile_edges_and_expected_shares(reference_frame):
    reference = build_reference(reference_frame)

    assert set(reference) == {"a", "b"}
    assert len(reference["a"]["edges"]) == 4
    assert sum(reference["a"]["expected"]) == pytest.approx(1.0)
    assert all(share == pytest.approx(0.2, abs=0.01) for share in reference["a"]["expected"])


def test_same_regime_scores_as_stable(reference_frame):
    reference = build_reference(reference_frame)
    rng = np.random.default_rng(99)
    recent = pd.DataFrame({"a": rng.normal(0, 1, 60), "b": rng.uniform(0, 1, 60)})

    assert score_drift(reference, recent)["psi"] < 0.2


def test_shifted_regime_scores_as_drift(reference_frame):
    reference = build_reference(reference_frame)
    rng = np.random.default_rng(99)
    recent = pd.DataFrame({"a": rng.normal(2.5, 1, 60), "b": rng.uniform(0.7, 1.0, 60)})

    result = score_drift(reference, recent)
    assert result["psi"] > 0.2
    assert set(result["per_feature"]) == {"a", "b"}


def test_constant_feature_does_not_break_reference():
    frame = pd.DataFrame({"flat": np.ones(100)})
    reference = build_reference(frame)
    assert score_drift(reference, frame.iloc[:30])["psi"] == pytest.approx(0.0)
