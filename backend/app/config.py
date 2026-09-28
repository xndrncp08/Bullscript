from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="BULLSCRIPT_", protected_namespaces=()
    )

    app_name: str = "BullScript API"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    model_dir: Path = data_dir / "models"

    # Forecast horizons in trading days
    forecast_horizons: dict[str, int] = {"5d": 5, "14d": 14, "30d": 30}

    # Self-training thresholds
    drift_rmse_threshold: float = 0.08
    drift_mape_threshold: float = 0.12
    retrain_check_interval_minutes: int = 60
    lookback_days: int = 730

    sentiment_model_name: str = "ProsusAI/finbert"


settings = Settings()
settings.model_dir.mkdir(parents=True, exist_ok=True)
