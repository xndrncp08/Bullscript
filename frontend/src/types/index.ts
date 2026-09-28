export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  date: string;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  ema_20: number | null;
  ema_50: number | null;
  ema_200: number | null;
  atr_14: number | null;
  volatility_20: number | null;
}

export interface ChartResponse {
  symbol: string;
  candles: Candle[];
  indicators: IndicatorPoint[];
}

export interface ForecastPoint {
  date: string;
  predicted_close: number;
  lower_bound: number;
  upper_bound: number;
}

export interface HorizonForecast {
  horizon: string;
  horizon_days: number;
  model_version: string;
  points: ForecastPoint[];
  target_price: number;
  /** Simple return from the last close to the horizon target. */
  expected_return: number;
  /** Coverage of lower/upper bounds, e.g. 0.8 for an 80% interval. */
  interval: number;
  /** Holdout directional accuracy of the active model. */
  hit_rate: number | null;
  /** 1 - RMSE / RMSE(random walk) on the holdout; > 0 beats "no change". */
  skill: number | null;
  /** Calibrated signal weight in [0, 1]; 0 means the model makes no call. */
  shrinkage: number | null;
}

export interface PredictionResponse {
  symbol: string;
  generated_at: string;
  as_of: string;
  last_close: number;
  horizons: HorizonForecast[];
}

export interface SentimentHeadline {
  headline: string;
  source: string | null;
  published_at: string | null;
  label: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface SentimentResponse {
  symbol: string;
  generated_at: string;
  weighted_score: number;
  label: string;
  headlines: SentimentHeadline[];
}

export interface RetrainLogEntry {
  timestamp: string;
  symbol: string;
  horizon: string;
  trigger: string;
  rmse: number | null;
  mape: number | null;
  r2: number | null;
  skill: number | null;
  hit_rate: number | null;
  psi: number | null;
  promoted: boolean;
  model_version: string;
}

export interface DriftCheck {
  timestamp: string;
  drift_status: "stable" | "drift" | "unknown";
  action: "none" | "promoted" | "kept_incumbent";
  psi: number | null;
  skill: number | null;
  hit_rate: number | null;
  rmse: number | null;
}

export interface ModelDiagnostics {
  symbol: string;
  horizon: string;
  model_version: string;
  compatible: boolean;
  target: string;
  trained_at: string | null;
  train_end: string | null;
  train_samples: number;
  calibration_samples: number;
  holdout_samples: number;
  rmse: number | null;
  mape: number | null;
  r2: number | null;
  skill: number | null;
  hit_rate: number | null;
  naive_rmse: number | null;
  residual_std: number | null;
  shrinkage: number | null;
  feature_importances: Record<string, number>;
  last_check: DriftCheck | null;
  retrain_log: RetrainLogEntry[];
}

export interface DiagnosticsResponse {
  generated_at: string;
  drift_skill_floor: number;
  drift_psi_threshold: number;
  models: ModelDiagnostics[];
}
