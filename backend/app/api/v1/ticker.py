from datetime import datetime, timezone
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, HTTPException, Path, Request

from app.core.limiter import limiter
from app.ml.features import build_feature_frame
from app.ml.forecaster import generate_all_forecasts
from app.ml.sentiment import analyze_symbol_sentiment
from app.models.schemas import (
    SYMBOL_PATTERN,
    ChartResponse,
    PredictionResponse,
    SentimentResponse,
)
from app.services.data_fetcher import (
    TickerNotFoundError,
    fetch_price_history,
    fetch_recent_news,
)

router = APIRouter(prefix="/ticker", tags=["ticker"])

Symbol = Annotated[str, Path(pattern=SYMBOL_PATTERN, examples=["AAPL"])]

INDICATOR_COLUMNS = [
    "rsi_14",
    "macd",
    "macd_signal",
    "macd_hist",
    "bb_upper",
    "bb_middle",
    "bb_lower",
    "ema_20",
    "ema_50",
    "ema_200",
    "atr_14",
    "volatility_20",
]


def _indicator_records(features: pd.DataFrame) -> list[dict]:
    rounded = features[INDICATOR_COLUMNS].round(4)
    rounded = rounded.astype(object).where(pd.notna(rounded), None)
    return [
        {"date": date, **row}
        for date, row in zip(features.index.date, rounded.to_dict("records"))
    ]


def _candle_records(price_df: pd.DataFrame) -> list[dict]:
    return [
        {"date": d, "open": o, "high": h, "low": low, "close": c, "volume": int(v)}
        for d, o, h, low, c, v in zip(
            price_df.index.date,
            price_df["open"].round(2).tolist(),
            price_df["high"].round(2).tolist(),
            price_df["low"].round(2).tolist(),
            price_df["close"].round(2).tolist(),
            price_df["volume"].fillna(0).tolist(),
        )
    ]


@router.get("/{symbol}/chart", response_model=ChartResponse)
@limiter.limit("30/minute")
def get_chart(request: Request, symbol: Symbol):
    try:
        price_df = fetch_price_history(symbol)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return ChartResponse(
        symbol=symbol.upper(),
        candles=_candle_records(price_df),
        indicators=_indicator_records(build_feature_frame(price_df)),
    )


@router.get("/{symbol}/prediction", response_model=PredictionResponse)
@limiter.limit("15/minute")
def get_prediction(request: Request, symbol: Symbol):
    try:
        result = generate_all_forecasts(symbol)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return PredictionResponse(generated_at=datetime.now(timezone.utc), **result)


@router.get("/{symbol}/sentiment", response_model=SentimentResponse)
@limiter.limit("15/minute")
def get_sentiment(request: Request, symbol: Symbol):
    headlines = fetch_recent_news(symbol)
    result = analyze_symbol_sentiment(headlines)
    return SentimentResponse(symbol=symbol.upper(), **result)
