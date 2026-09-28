/** Human labels for the forecast engine's model features. */
export const FEATURE_LABELS: Record<string, string> = {
  rsi_14: "RSI 14",
  macd_norm: "MACD / price",
  macd_signal_norm: "MACD signal / price",
  macd_hist_norm: "MACD hist / price",
  bb_pct_b: "Bollinger %B",
  bb_width: "Bollinger width",
  dist_ema_20: "Δ EMA 20",
  dist_ema_50: "Δ EMA 50",
  dist_ema_200: "Δ EMA 200",
  atr_pct: "ATR %",
  volatility_20: "Realised vol 20D",
  return_1d: "Return 1D",
  return_5d: "Return 5D",
  return_10d: "Return 10D",
  return_20d: "Return 20D",
  volume_ratio: "Volume ratio",
};

export function featureLabel(name: string): string {
  return FEATURE_LABELS[name] ?? name.replace(/_/g, " ");
}

export const TRIGGER_LABELS: Record<string, string> = {
  manual: "manual",
  bootstrap: "bootstrap",
  schema_upgrade: "schema upgrade",
  performance_drift: "perf drift",
  data_drift: "data drift",
  scheduled_check_no_action: "scheduled",
};
