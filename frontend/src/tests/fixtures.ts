import type { Resource } from "@/hooks/useTickerData";
import type {
  Candle,
  ChartResponse,
  DiagnosticsResponse,
  HorizonForecast,
  IndicatorPoint,
  ModelDiagnostics,
  PredictionResponse,
  Quote,
  SentimentResponse,
} from "@/types";

/** Business days (Mon-Fri) starting at `start`, as YYYY-MM-DD. */
export function businessDays(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** A gently trending series with alternating up/down bars. */
export function makeChart(symbol = "AAPL", count = 80, start = 100): ChartResponse {
  const dates = businessDays("2026-01-05", count);
  const candles: Candle[] = dates.map((date, i) => {
    const base = start + i * 0.5;
    const up = i % 3 !== 0;
    const open = up ? base - 0.4 : base + 0.4;
    const close = up ? base + 0.4 : base - 0.4;
    return { date, open, close, high: Math.max(open, close) + 0.6, low: Math.min(open, close) - 0.6, volume: 1_000_000 + i * 1000 };
  });
  const indicators: IndicatorPoint[] = dates.map((date, i) => ({
    date,
    rsi_14: i < 14 ? null : 40 + (i % 30),
    macd: null,
    macd_signal: null,
    macd_hist: null,
    bb_upper: i < 19 ? null : start + i * 0.5 + 2,
    bb_middle: i < 19 ? null : start + i * 0.5,
    bb_lower: i < 19 ? null : start + i * 0.5 - 2,
    ema_20: i < 19 ? null : start + i * 0.5 - 1,
    ema_50: i < 49 ? null : start + i * 0.5 - 3,
    ema_200: null,
    atr_14: i < 14 ? null : 1.2,
    volatility_20: i < 20 ? null : 0.22,
  }));
  return { symbol, candles, indicators };
}

export function makeHorizon(horizon: string, days: number, lastClose: number, overrides: Partial<HorizonForecast> = {}): HorizonForecast {
  const dates = businessDays("2026-06-01", days);
  const drift = 0.002;
  return {
    horizon,
    horizon_days: days,
    model_version: "v3",
    points: dates.map((date, k) => {
      const predicted = lastClose * (1 + drift * (k + 1));
      const spread = lastClose * 0.01 * Math.sqrt(k + 1);
      return { date, predicted_close: predicted, lower_bound: predicted - spread, upper_bound: predicted + spread };
    }),
    target_price: lastClose * (1 + drift * days),
    expected_return: drift * days,
    interval: 0.8,
    hit_rate: 0.58,
    skill: 0.04,
    shrinkage: 0.9,
    ...overrides,
  };
}

export function makePrediction(symbol = "AAPL", lastClose = 140): PredictionResponse {
  return {
    symbol,
    generated_at: "2026-06-01T12:00:00Z",
    as_of: "2026-05-29",
    last_close: lastClose,
    horizons: [
      makeHorizon("5d", 5, lastClose, { hit_rate: 0.6, skill: 0.03 }),
      makeHorizon("14d", 14, lastClose, { hit_rate: 0.69, skill: 0.061 }),
      makeHorizon("30d", 30, lastClose, { hit_rate: 0.51, skill: -0.08, shrinkage: 0.05, expected_return: 0.001 }),
    ],
  };
}

export function makeSentiment(symbol = "AAPL"): SentimentResponse {
  return {
    symbol,
    generated_at: "2026-06-01T12:00:00Z",
    weighted_score: 0.31,
    label: "bullish",
    headlines: [
      { headline: "Apple beats estimates on services strength", source: "Reuters", published_at: new Date(Date.now() - 2 * 3600_000).toISOString(), label: "positive", positive: 0.9, neutral: 0.08, negative: 0.02 },
      { headline: "Regulators open probe into app store fees", source: "Bloomberg", published_at: null, label: "negative", positive: 0.05, neutral: 0.15, negative: 0.8 },
      { headline: "Apple to report earnings next week", source: "CNBC", published_at: null, label: "neutral", positive: 0.1, neutral: 0.85, negative: 0.05 },
    ],
  };
}

export function makeModel(symbol = "AAPL", horizon = "14d", overrides: Partial<ModelDiagnostics> = {}): ModelDiagnostics {
  return {
    symbol,
    horizon,
    model_version: "v3",
    compatible: true,
    target: "log_return",
    trained_at: new Date(Date.now() - 3600_000).toISOString(),
    train_end: "2025-12-31",
    train_samples: 500,
    calibration_samples: 170,
    holdout_samples: 170,
    rmse: 10.96,
    mape: 0.029,
    r2: 0.85,
    skill: 0.061,
    hit_rate: 0.69,
    naive_rmse: 11.67,
    residual_std: 0.039,
    shrinkage: 1,
    feature_importances: { dist_ema_200: 0.12, rsi_14: 0.2, bb_pct_b: 0.08, volume_ratio: 0.05 },
    last_check: {
      timestamp: new Date(Date.now() - 600_000).toISOString(),
      drift_status: "stable",
      action: "none",
      psi: 0.07,
      skill: 0.061,
      hit_rate: 0.69,
      rmse: 10.96,
    },
    retrain_log: [
      {
        timestamp: "2026-06-01T09:14:02Z",
        symbol,
        horizon,
        trigger: "manual",
        rmse: 10.96,
        mape: 0.029,
        r2: 0.85,
        skill: 0.061,
        hit_rate: 0.69,
        psi: null,
        promoted: true,
        model_version: "v3",
      },
    ],
    ...overrides,
  };
}

export function makeDiagnostics(symbol = "AAPL", models?: ModelDiagnostics[]): DiagnosticsResponse {
  return {
    generated_at: "2026-06-01T12:00:00Z",
    drift_skill_floor: -0.1,
    drift_psi_threshold: 0.2,
    models: models ?? [makeModel(symbol, "5d"), makeModel(symbol, "14d"), makeModel(symbol, "30d")],
  };
}

export function makeQuote(symbol: string, price: number, changePct = 0.01): Quote {
  return {
    symbol,
    price,
    previous_close: price / (1 + changePct),
    change: price - price / (1 + changePct),
    change_pct: changePct,
    volume: 1_000_000,
    as_of: "2026-06-01",
    sparkline: [price * 0.97, price * 0.99, price * 0.98, price],
  };
}

export function ready<T>(data: T, symbol: string): Resource<T> {
  return { status: "success", data, symbol, error: null };
}

export function loading<T>(previous: T | null = null, symbol: string | null = null): Resource<T> {
  return { status: "loading", data: previous, symbol, error: null };
}
