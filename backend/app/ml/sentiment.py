"""FinBERT-based news sentiment scoring."""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache

from app.config import settings

_LABEL_MAP = {0: "positive", 1: "negative", 2: "neutral"}


@lru_cache(maxsize=1)
def _get_pipeline():
    """Lazily load the Hugging Face FinBERT pipeline on first use."""
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        pipeline,
    )

    tokenizer = AutoTokenizer.from_pretrained(settings.sentiment_model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        settings.sentiment_model_name
    )
    return pipeline(
        "text-classification",
        model=model,
        tokenizer=tokenizer,
        top_k=None,
        truncation=True,
    )


def score_headlines(headlines: list[dict]) -> list[dict]:
    """Run FinBERT over a list of {headline, source, published_at} dicts.

    Returns each headline enriched with label + positive/neutral/negative scores.
    """
    if not headlines:
        return []

    clf = _get_pipeline()
    texts = [h["headline"] for h in headlines]
    raw_results = clf(texts)

    enriched = []
    for headline, scores in zip(headlines, raw_results):
        score_map = {s["label"].lower(): s["score"] for s in scores}
        top_label = max(score_map, key=score_map.get)
        enriched.append(
            {
                **headline,
                "label": top_label,
                "positive": score_map.get("positive", 0.0),
                "neutral": score_map.get("neutral", 0.0),
                "negative": score_map.get("negative", 0.0),
            }
        )
    return enriched


def weighted_sentiment_index(scored_headlines: list[dict]) -> tuple[float, str]:
    """Aggregate per-headline sentiment into a single weighted index in [-1, 1].

    More recent headlines are weighted more heavily via linear decay.
    """
    if not scored_headlines:
        return 0.0, "neutral"

    n = len(scored_headlines)
    total_weight = 0.0
    weighted_sum = 0.0

    for i, item in enumerate(scored_headlines):
        weight = n - i  # earlier in list = more recent = higher weight
        polarity = item["positive"] - item["negative"]
        weighted_sum += polarity * weight
        total_weight += weight

    index = weighted_sum / total_weight if total_weight else 0.0

    if index > 0.15:
        label = "bullish"
    elif index < -0.15:
        label = "bearish"
    else:
        label = "neutral"

    return round(index, 4), label


def analyze_symbol_sentiment(headlines: list[dict]) -> dict:
    scored = score_headlines(headlines)
    index, label = weighted_sentiment_index(scored)
    return {
        "generated_at": datetime.now(timezone.utc),
        "weighted_score": index,
        "label": label,
        "headlines": scored,
    }
