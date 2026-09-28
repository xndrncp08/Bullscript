from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # extra="ignore" so a .env written for an older version (with settings that
    # have since been removed) doesn't stop the API from starting.
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="BULLSCRIPT_", protected_namespaces=(), extra="ignore"
    )

    app_name: str = "BullScript API"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    model_dir: Path = data_dir / "models"

    # Forecast horizons in trading days
    forecast_horizons: dict[str, int] = {"5d": 5, "14d": 14, "30d": 30}
    # Central interval drawn around each forecast path.
    forecast_interval: float = 0.8

    # Self-training thresholds. A model is considered drifted when its holdout
    # skill against a random walk on bars it hasn't seen drops below the floor
    # (meaningfully worse than "price stays put"), or when more than this share
    # of recent feature values fall outside the range it was trained on.
    drift_skill_floor: float = -0.10
    drift_ood_threshold: float = 0.1
    retrain_check_interval_minutes: int = 60
    lookback_days: int = 1095

    sentiment_model_name: str = "ProsusAI/finbert"


settings = Settings()
settings.model_dir.mkdir(parents=True, exist_ok=True)
