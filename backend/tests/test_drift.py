import numpy as np
import pandas as pd
import pytest

from app.ml.drift import build_reference, score_drift


@pytest.fixture
def training():
    rng = np.random.default_rng(7)
    return pd.DataFrame({"a": rng.normal(0, 1, 2000), "b": rng.uniform(0, 1, 2000)})


def test_reference_stores_the_central_99_percent_range(training):
    reference = build_reference(training)

    assert set(reference) == {"a", "b"}
    lo, hi = reference["a"]["lo"], reference["a"]["hi"]
    assert lo == pytest.approx(np.quantile(training["a"], 0.005))
    assert hi == pytest.approx(np.quantile(training["a"], 0.995))


def test_recent_values_inside_the_training_range_score_near_zero(training):
    reference = build_reference(training)
    rng = np.random.default_rng(99)
    recent = pd.DataFrame({"a": rng.normal(0, 1, 60), "b": rng.uniform(0, 1, 60)})

    assert score_drift(reference, recent)["ood"] < 0.05


def test_a_regime_the_model_has_never_seen_scores_high(training):
    reference = build_reference(training)
    rng = np.random.default_rng(99)
    recent = pd.DataFrame({"a": rng.normal(5, 1, 60), "b": rng.uniform(1.5, 2, 60)})

    result = score_drift(reference, recent)
    assert result["ood"] > 0.9
    assert set(result["per_feature"]) == {"a", "b"}


def test_a_narrow_slice_of_a_familiar_range_is_not_drift(training):
    """The failure mode that ruled out PSI: slow features sit in one corner of
    their range for weeks. That's not drift if the model has seen that corner."""
    reference = build_reference(training)
    corner = training[training["a"] > 1.5].head(60)

    assert score_drift(reference, corner)["ood"] < 0.1


def test_the_score_averages_over_features(training):
    reference = build_reference(training)
    recent = pd.DataFrame({"a": np.full(10, 99.0), "b": np.full(10, 0.5)})
    assert score_drift(reference, recent)["ood"] == pytest.approx(0.5)


def test_references_without_range_bounds_are_unscorable():
    legacy = {"a": {"edges": [0.1, 0.2], "expected": [0.3, 0.3, 0.4]}}
    assert score_drift(legacy, pd.DataFrame({"a": [0.1, 0.2]})) is None
