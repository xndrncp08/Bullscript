from app.ml import sentiment


def fake_finbert_pipeline(texts):
    """Stand-in for the Hugging Face pipeline callable: text-classification
    with top_k=None returns a list of per-label score dicts per input."""
    canned = {
        "Company beats earnings expectations by wide margin": [
            {"label": "positive", "score": 0.91},
            {"label": "neutral", "score": 0.07},
            {"label": "negative", "score": 0.02},
        ],
        "Regulators announce probe into accounting practices": [
            {"label": "negative", "score": 0.88},
            {"label": "neutral", "score": 0.09},
            {"label": "positive", "score": 0.03},
        ],
        "Quarterly revenue in line with analyst estimates": [
            {"label": "neutral", "score": 0.80},
            {"label": "positive", "score": 0.12},
            {"label": "negative", "score": 0.08},
        ],
    }
    return [canned[t] for t in texts]


def test_score_headlines_parses_labels_and_scores(monkeypatch, sample_headlines):
    monkeypatch.setattr(sentiment, "_get_pipeline", lambda: fake_finbert_pipeline)

    scored = sentiment.score_headlines(sample_headlines)

    assert len(scored) == 3
    assert scored[0]["label"] == "positive"
    assert scored[0]["positive"] == 0.91
    assert scored[1]["label"] == "negative"
    assert scored[2]["label"] == "neutral"
    # original fields preserved
    assert scored[0]["source"] == "Reuters"


def test_score_headlines_empty_input_returns_empty_list():
    assert sentiment.score_headlines([]) == []


def test_weighted_sentiment_index_recent_weighting(monkeypatch, sample_headlines):
    monkeypatch.setattr(sentiment, "_get_pipeline", lambda: fake_finbert_pipeline)
    scored = sentiment.score_headlines(sample_headlines)

    index, label = sentiment.weighted_sentiment_index(scored)

    assert -1.0 <= index <= 1.0
    # first headline (most positive, highest weight) should pull index positive
    assert index > 0
    assert label in {"bullish", "bearish", "neutral"}


def test_weighted_sentiment_index_empty_is_neutral():
    index, label = sentiment.weighted_sentiment_index([])
    assert index == 0.0
    assert label == "neutral"


def test_analyze_symbol_sentiment_end_to_end(monkeypatch, sample_headlines):
    monkeypatch.setattr(sentiment, "_get_pipeline", lambda: fake_finbert_pipeline)

    result = sentiment.analyze_symbol_sentiment(sample_headlines)

    assert set(result.keys()) == {"generated_at", "weighted_score", "label", "headlines"}
    assert len(result["headlines"]) == 3
    assert isinstance(result["weighted_score"], float)


def test_mock_score_flags_positive_keywords_higher():
    scores = {s["label"]: s["score"] for s in sentiment._mock_score(
        "Company beats earnings and surges to a record high"
    )}
    assert scores["positive"] > scores["negative"]


def test_mock_score_flags_negative_keywords_higher():
    scores = {s["label"]: s["score"] for s in sentiment._mock_score(
        "Company misses estimates amid fraud probe and lawsuit"
    )}
    assert scores["negative"] > scores["positive"]


def test_mock_score_neutral_headline_has_no_dominant_label():
    scores = {s["label"]: s["score"] for s in sentiment._mock_score(
        "Quarterly report scheduled for next Tuesday"
    )}
    assert scores["positive"] == scores["negative"]


def test_mock_pipeline_scores_each_input_text():
    results = sentiment._mock_pipeline(["great quarter, profits surge", "missed estimates"])
    assert len(results) == 2
    for result in results:
        labels = {s["label"] for s in result}
        assert labels == {"positive", "neutral", "negative"}


def test_get_pipeline_falls_back_to_mock_when_real_loader_fails(monkeypatch):
    sentiment._get_pipeline.cache_clear()
    monkeypatch.setattr(
        sentiment, "_load_real_pipeline", lambda: (_ for _ in ()).throw(RuntimeError("no network"))
    )

    clf = sentiment._get_pipeline()

    assert clf is sentiment._mock_pipeline
    sentiment._get_pipeline.cache_clear()
