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
  points: ForecastPoint[];
  confidence: number;
}

export interface PredictionResponse {
  symbol: string;
  generated_at: string;
  model_version: string;
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
  rmse: number;
  mape: number;
  r2: number;
  promoted: boolean;
  model_version: string;
}

export interface ModelDiagnostics {
  symbol: string;
  horizon: string;
  model_version: string;
  trained_at: string | null;
  rmse: number | null;
  mape: number | null;
  r2: number | null;
  feature_importances: Record<string, number>;
  retrain_log: RetrainLogEntry[];
}

export interface DiagnosticsResponse {
  generated_at: string;
  models: ModelDiagnostics[];
}
