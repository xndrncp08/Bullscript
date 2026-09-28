from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.ml.features import build_feature_frame
from app.ml.forecaster import generate_all_forecasts
from app.ml.sentiment import analyze_symbol_sentiment
from app.models.schemas import ChartResponse, PredictionResponse, SentimentResponse
from app.services.data_fetcher import (
    TickerNotFoundError,
    fetch_price_history,
    fetch_recent_news,
)

router = APIRouter(prefix="/ticker", tags=["ticker"])


@router.get("/{symbol}/chart", response_model=ChartResponse)
def get_chart(symbol: str):
    try:
        price_df = fetch_price_history(symbol)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    features = build_feature_frame(price_df)

    candles = [
        {
            "date": idx.date(),
            "open": round(row.open, 2),
            "high": round(row.high, 2),
            "low": round(row.low, 2),
            "close": round(row.close, 2),
            "volume": int(row.volume),
        }
        for idx, row in price_df.iterrows()
    ]

    indicators = [
        {
            "date": idx.date(),
            "rsi_14": _safe_round(row.get("rsi_14")),
            "macd": _safe_round(row.get("macd")),
            "macd_signal": _safe_round(row.get("macd_signal")),
            "macd_hist": _safe_round(row.get("macd_hist")),
            "bb_upper": _safe_round(row.get("bb_upper")),
            "bb_middle": _safe_round(row.get("bb_middle")),
            "bb_lower": _safe_round(row.get("bb_lower")),
            "ema_20": _safe_round(row.get("ema_20")),
            "ema_50": _safe_round(row.get("ema_50")),
            "ema_200": _safe_round(row.get("ema_200")),
            "atr_14": _safe_round(row.get("atr_14")),
            "volatility_20": _safe_round(row.get("volatility_20")),
        }
        for idx, row in features.iterrows()
    ]

    return ChartResponse(symbol=symbol.upper(), candles=candles, indicators=indicators)


@router.get("/{symbol}/prediction", response_model=PredictionResponse)
def get_prediction(symbol: str):
    try:
        result = generate_all_forecasts(symbol)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return PredictionResponse(
        symbol=result["symbol"],
        generated_at=datetime.now(timezone.utc),
        model_version=result["model_version"],
        last_close=result["last_close"],
        horizons=result["horizons"],
    )


@router.get("/{symbol}/sentiment", response_model=SentimentResponse)
def get_sentiment(symbol: str):
    headlines = fetch_recent_news(symbol)
    result = analyze_symbol_sentiment(headlines)
    return SentimentResponse(symbol=symbol.upper(), **result)


def _safe_round(value, digits: int = 4):
    if value is None:
        return None
    try:
        if value != value:  # NaN check without importing numpy/pandas here
            return None
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None
