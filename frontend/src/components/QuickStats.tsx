import { Activity, BarChart3, TrendingDown, TrendingUp } from "lucide-react";

import Skeleton from "./Skeleton";
import type { ChartResponse, SentimentResponse } from "@/types";

interface QuickStatsProps {
  chart: ChartResponse | null;
  sentiment: SentimentResponse | null;
  loading: boolean;
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return String(volume);
}

export default function QuickStats({ chart, sentiment, loading }: QuickStatsProps) {
  if (loading || !chart || chart.candles.length < 2) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel-glass p-4">
            <Skeleton className="mb-2 h-3 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const candles = chart.candles;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = last.close - prev.close;
  const changePct = (change / prev.close) * 100;
  const isUp = change >= 0;
  const lastIndicator = chart.indicators[chart.indicators.length - 1];

  const tiles = [
    {
      label: "Last Close",
      value: `$${last.close.toFixed(2)}`,
      icon: isUp ? TrendingUp : TrendingDown,
      accent: isUp ? "text-bull" : "text-bear",
    },
    {
      label: "Change",
      value: `${isUp ? "+" : ""}${change.toFixed(2)} (${isUp ? "+" : ""}${changePct.toFixed(2)}%)`,
      icon: isUp ? TrendingUp : TrendingDown,
      accent: isUp ? "text-bull" : "text-bear",
    },
    {
      label: "Volume",
      value: formatVolume(last.volume),
      icon: BarChart3,
      accent: "text-cyan",
    },
    {
      label: "RSI (14) · Sentiment",
      value: `${lastIndicator?.rsi_14?.toFixed(1) ?? "—"} · ${sentiment?.label ?? "—"}`,
      icon: Activity,
      accent: "text-slate-text",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="panel-glass p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-text">
            <tile.icon className={`h-3.5 w-3.5 ${tile.accent}`} />
            {tile.label}
          </div>
          <div className={`font-mono text-lg font-semibold ${tile.accent}`}>{tile.value}</div>
        </div>
      ))}
    </div>
  );
}
