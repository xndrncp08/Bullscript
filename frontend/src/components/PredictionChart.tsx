import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartResponse, PredictionResponse } from "@/types";

interface PredictionChartProps {
  chart: ChartResponse | null;
  prediction: PredictionResponse | null;
  loading: boolean;
}

const HORIZONS = ["5d", "14d", "30d"] as const;

type ChartRow = {
  date: string;
  actual?: number;
  predicted?: number;
  lower?: number;
  upper?: number;
};

export default function PredictionChart({ chart, prediction, loading }: PredictionChartProps) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>("14d");

  const rows: ChartRow[] = useMemo(() => {
    if (!chart) return [];

    const historical: ChartRow[] = chart.candles.slice(-90).map((c) => ({
      date: c.date,
      actual: c.close,
    }));

    const forecast = prediction?.horizons.find((h) => h.horizon === horizon);
    const forecastRows: ChartRow[] =
      forecast?.points.map((p) => ({
        date: p.date,
        predicted: p.predicted_close,
        lower: p.lower_bound,
        upper: p.upper_bound,
      })) ?? [];

    if (historical.length && forecastRows.length) {
      const last = historical[historical.length - 1];
      forecastRows.unshift({
        date: last.date,
        predicted: last.actual,
        lower: last.actual,
        upper: last.actual,
      });
    }

    return [...historical, ...forecastRows];
  }, [chart, prediction, horizon]);

  const activeForecast = prediction?.horizons.find((h) => h.horizon === horizon);

  return (
    <div className="panel flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Price & ML Forecast</h2>
          <p className="text-xs text-slate-text">
            {chart ? chart.symbol : "—"} · historical close blended into predicted trajectory
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-border bg-obsidian p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                horizon === h
                  ? "bg-bull-gradient text-obsidian"
                  : "text-slate-text hover:text-white"
              }`}
            >
              {h.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-text">
            Loading chart data…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={320}>
            <ComposedChart data={rows}>
              <defs>
                <linearGradient id="predictedBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E676" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E262C" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#8A99AD"
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis
                stroke="#8A99AD"
                tick={{ fontSize: 11 }}
                domain={["auto", "auto"]}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  background: "#161A22",
                  border: "1px solid #1E262C",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#8A99AD" }}
              />
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="url(#predictedBand)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#0B0E11"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#FFFFFF"
                strokeWidth={1.75}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#00E676"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {activeForecast && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-border pt-3 text-xs text-slate-text">
          <span>Model version: {prediction?.model_version}</span>
          <span>Confidence: {(activeForecast.confidence * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
