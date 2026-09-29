"""FinBERT-based news sentiment scoring, with an offline keyword fallback."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from functools import lru_cache

from app.config import settings

logger = logging.getLogger("bullscript.sentiment")

_LABEL_MAP = {0: "positive", 1: "negative", 2: "neutral"}

_POSITIVE_WORDS = {
    "beat", "beats", "beating", "surge", "surges", "surging", "soar", "soars",
    "rally", "rallies", "gain", "gains", "growth", "record", "upgrade",
    "upgraded", "outperform", "strong", "profit", "profits", "bullish",
    "rise", "rises", "rising", "jump", "jumps", "boost", "boosts", "win",
    "wins", "expand", "expands", "expansion", "buy", "buyback",
}

_NEGATIVE_WORDS = {
    "miss", "misses", "missed", "plunge", "plunges", "plunging", "crash",
    "crashes", "fall", "falls", "falling", "drop", "drops", "dropping",
    "loss", "losses", "downgrade", "downgraded", "underperform", "weak",
    "bearish", "probe", "lawsuit", "recall", "decline", "declines", "cut",
    "cuts", "warning", "warns", "layoff", "layoffs", "investigation",
    "antitrust", "fraud", "sell-off", "selloff",
}


def _mock_score(text: str) -> list[dict]:
    """Deterministic keyword-based sentiment scorer for offline development.

    Used only when the FinBERT pipeline can't be loaded (no network access
    to Hugging Face, model not cached, etc.) so the app stays usable end to
    end without requiring real model weights.
    """
    words = re.findall(r"[a-z']+", text.lower())
    pos_hits = sum(1 for w in words if w in _POSITIVE_WORDS)
    neg_hits = sum(1 for w in words if w in _NEGATIVE_WORDS)

    raw_positive = 0.2 + 0.6 * pos_hits
    raw_negative = 0.2 + 0.6 * neg_hits
    raw_neutral = 0.3
    total = raw_positive + raw_negative + raw_neutral

    return [
        {"label": "positive", "score": raw_positive / total},
        {"label": "neutral", "score": raw_neutral / total},
        {"label": "negative", "score": raw_negative / total},
    ]


def _mock_pipeline(texts: list[str]) -> list[list[dict]]:
    return [_mock_score(t) for t in texts]


def _load_real_pipeline():
    """Load the actual Hugging Face FinBERT pipeline. Split out from
    _get_pipeline so tests can force the fallback path deterministically,
    independent of whether transformers/torch happen to be installed."""
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


@lru_cache(maxsize=1)
def _get_pipeline():
    """Lazily load the Hugging Face FinBERT pipeline on first use.

    Falls back to a deterministic keyword-based mock scorer if the model
    can't be loaded (offline dev, no cached weights, Hugging Face Hub
    unreachable), so /sentiment stays functional without real inference.
    """
    try:
        return _load_real_pipeline()
    except Exception as exc:
        logger.warning(
            "FinBERT pipeline unavailable (%s); falling back to offline mock sentiment.",
            exc,
        )
        return _mock_pipeline


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
    for headline, scores in zip(headlines, raw_results, strict=True):
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
