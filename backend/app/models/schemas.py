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
    horizon_days: int
    model_version: str
    points: list[ForecastPoint]
    target_price: float
    expected_return: float = Field(description="Simple return to the horizon target")
    interval: float = Field(description="Coverage of the lower/upper bounds, e.g. 0.8")
    hit_rate: float | None = Field(
        default=None, description="Holdout directional accuracy of the active model"
    )
    skill: float | None = Field(
        default=None, description="1 - RMSE / RMSE(random walk) on the holdout"
    )
    shrinkage: float | None = Field(
        default=None, description="Calibrated signal weight in [0, 1] (0 = no call)"
    )


class PredictionResponse(_APIModel):
    symbol: str
    generated_at: datetime
    as_of: date
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
    rmse: float | None = None
    mape: float | None = None
    r2: float | None = None
    skill: float | None = None
    hit_rate: float | None = None
    psi: float | None = None
    promoted: bool
    model_version: str


class DriftCheck(_APIModel):
    timestamp: datetime
    drift_status: str = Field(description="stable | drift | unknown")
    action: str = Field(description="none | promoted | kept_incumbent")
    psi: float | None = None
    skill: float | None = None
    hit_rate: float | None = None
    rmse: float | None = None


class ModelDiagnostics(_APIModel):
    symbol: str
    horizon: str
    model_version: str
    compatible: bool = Field(description="False for models trained on a retired feature set")
    target: str
    trained_at: datetime | None
    train_end: date | None = None
    train_samples: int = 0
    calibration_samples: int = 0
    holdout_samples: int = 0
    rmse: float | None
    mape: float | None
    r2: float | None
    skill: float | None = None
    hit_rate: float | None = None
    naive_rmse: float | None = None
    residual_std: float | None = None
    shrinkage: float | None = Field(
        default=None,
        description="Calibrated weight in [0, 1] applied to raw model output; "
        "0 means the model showed no out-of-sample signal and forecasts no change",
    )
    feature_importances: dict[str, float]
    last_check: DriftCheck | None = None
    retrain_log: list[RetrainLogEntry]


class DiagnosticsResponse(_APIModel):
    generated_at: datetime
    drift_skill_floor: float
    drift_psi_threshold: float
    models: list[ModelDiagnostics]


SYMBOL_PATTERN = r"^[A-Za-z0-9.^=\-]{1,12}$"


class RetrainRequest(_APIModel):
    symbol: str = Field(..., pattern=SYMBOL_PATTERN, examples=["AAPL"])
    horizons: list[str] | None = None
