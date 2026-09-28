from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class _APIModel(BaseModel):
    """Base schema that allows `model_*`-prefixed field names (e.g. model_version)
    without tripping Pydantic's protected-namespace warning."""

    model_config = ConfigDict(protected_namespaces=())


class Candle(_APIModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class IndicatorPoint(_APIModel):
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


class ChartResponse(_APIModel):
    symbol: str
    candles: list[Candle]
    indicators: list[IndicatorPoint]


class ForecastPoint(_APIModel):
    date: date
    predicted_close: float
    lower_bound: float
    upper_bound: float


class HorizonForecast(_APIModel):
    horizon: str
    points: list[ForecastPoint]
    confidence: float


class PredictionResponse(_APIModel):
    symbol: str
    generated_at: datetime
    model_version: str
    last_close: float
    horizons: list[HorizonForecast]


class SentimentHeadline(_APIModel):
    headline: str
    source: str | None = None
    published_at: datetime | None = None
    label: str
    positive: float
    neutral: float
    negative: float


class SentimentResponse(_APIModel):
    symbol: str
    generated_at: datetime
    weighted_score: float
    label: str
    headlines: list[SentimentHeadline]


class RetrainLogEntry(_APIModel):
    timestamp: datetime
    symbol: str
    horizon: str
    trigger: str
    rmse: float
    mape: float
    r2: float
    promoted: bool
    model_version: str


class ModelDiagnostics(_APIModel):
    symbol: str
    horizon: str
    model_version: str
    trained_at: datetime | None
    rmse: float | None
    mape: float | None
    r2: float | None
    feature_importances: dict[str, float]
    retrain_log: list[RetrainLogEntry]


class DiagnosticsResponse(_APIModel):
    generated_at: datetime
    models: list[ModelDiagnostics]


class RetrainRequest(_APIModel):
    symbol: str = Field(..., examples=["AAPL"])
    horizons: list[str] | None = None
