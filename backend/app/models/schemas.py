from datetime import date, datetime

from pydantic import BaseModel, Field


class Candle(BaseModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class IndicatorPoint(BaseModel):
    date: date
    rsi_14: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    macd_hist: float | None = None
    bb_upper: float | None = None
    bb_middle: float | None = None
    bb_lower: float | None = None
    ema_20: float | None = None
    ema_50: float | None = None
    ema_200: float | None = None
    atr_14: float | None = None
    volatility_20: float | None = None


class ChartResponse(BaseModel):
    symbol: str
    candles: list[Candle]
    indicators: list[IndicatorPoint]


class ForecastPoint(BaseModel):
    date: date
    predicted_close: float
    lower_bound: float
    upper_bound: float


class HorizonForecast(BaseModel):
    horizon: str
    points: list[ForecastPoint]
    confidence: float


class PredictionResponse(BaseModel):
    symbol: str
    generated_at: datetime
    model_version: str
    last_close: float
    horizons: list[HorizonForecast]


class SentimentHeadline(BaseModel):
    headline: str
    source: str | None = None
    published_at: datetime | None = None
    label: str
    positive: float
    neutral: float
    negative: float


class SentimentResponse(BaseModel):
    symbol: str
    generated_at: datetime
    weighted_score: float
    label: str
    headlines: list[SentimentHeadline]


class RetrainLogEntry(BaseModel):
    timestamp: datetime
    symbol: str
    horizon: str
    trigger: str
    rmse: float
    mape: float
    r2: float
    promoted: bool
    model_version: str


class ModelDiagnostics(BaseModel):
    symbol: str
    horizon: str
    model_version: str
    trained_at: datetime | None
    rmse: float | None
    mape: float | None
    r2: float | None
    feature_importances: dict[str, float]
    retrain_log: list[RetrainLogEntry]


class DiagnosticsResponse(BaseModel):
    generated_at: datetime
    models: list[ModelDiagnostics]


class RetrainRequest(BaseModel):
    symbol: str = Field(..., examples=["AAPL"])
    horizons: list[str] | None = None
