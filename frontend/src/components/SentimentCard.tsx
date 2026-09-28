import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import Skeleton from "./Skeleton";
import type { SentimentResponse } from "@/types";

interface SentimentCardProps {
  sentiment: SentimentResponse | null;
  loading: boolean;
}

const LABEL_STYLES: Record<string, { color: string; stroke: string; Icon: typeof TrendingUp }> = {
  bullish: { color: "text-bull", stroke: "#00E676", Icon: TrendingUp },
  bearish: { color: "text-bear", stroke: "#FF3B30", Icon: TrendingDown },
  neutral: { color: "text-slate-text", stroke: "#8A99AD", Icon: Minus },
};

/** Semicircle gauge: score in [-1, 1] mapped to a needle angle across 180deg. */
function SentimentGauge({ score, stroke }: { score: number; stroke: string }) {
  const clamped = Math.max(-1, Math.min(1, score));
  const angleDeg = clamped * 90; // -90 (bearish) .. 90 (bullish)
  const angleRad = (angleDeg * Math.PI) / 180;

  const cx = 60;
  const cy = 60;
  const r = 46;
  const needleX = cx + r * Math.sin(angleRad);
  const needleY = cy - r * Math.cos(angleRad);

  return (
    <svg
      viewBox="0 0 120 68"
      className="h-20 w-32"
      role="img"
      aria-label={`Sentiment gauge at ${clamped.toFixed(2)}`}
    >
      <path
        d="M 14 60 A 46 46 0 0 1 106 60"
        fill="none"
        stroke="#1E262C"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d="M 14 60 A 46 46 0 0 1 106 60"
        fill="none"
        stroke="url(#gaugeGradient)"
        strokeWidth={10}
        strokeLinecap="round"
        opacity={0.9}
      />
      <defs>
        <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF3B30" />
          <stop offset="50%" stopColor="#8A99AD" />
          <stop offset="100%" stopColor="#00E676" />
        </linearGradient>
      </defs>
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill={stroke} />
    </svg>
  );
}

export default function SentimentCard({ sentiment, loading }: SentimentCardProps) {
  const style = LABEL_STYLES[sentiment?.label ?? "neutral"];
  const Icon = style.Icon;

  return (
    <div className="panel-glass flex h-full flex-col p-4">
      <h2 className="text-sm font-semibold text-primary">News Sentiment (FinBERT)</h2>
      <p className="mb-2 text-xs text-slate-text">Weighted index across recent headlines</p>

      {loading ? (
        <div className="flex flex-1 flex-col gap-3" data-testid="sentiment-skeleton">
          <Skeleton className="mx-auto h-20 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-center">
            <SentimentGauge score={sentiment?.weighted_score ?? 0} stroke={style.stroke} />
          </div>

          <div className="mb-4 flex items-center justify-center gap-2">
            <Icon className={`h-6 w-6 ${style.color}`} />
            <div className="text-center">
              <div className={`text-xl font-bold capitalize ${style.color}`}>
                {sentiment?.label ?? "neutral"}
              </div>
              <div className="text-xs text-slate-text">
                score {sentiment?.weighted_score.toFixed(3) ?? "0.000"}
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {sentiment?.headlines.slice(0, 6).map((h, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-border bg-obsidian p-2.5 text-xs"
              >
                <p className="line-clamp-2 text-primary/90">{h.headline}</p>
                <div className="mt-1 flex items-center justify-between text-slate-text">
                  <span>{h.source ?? "unknown source"}</span>
                  <span
                    className={
                      h.label === "positive"
                        ? "text-bull"
                        : h.label === "negative"
                          ? "text-bear"
                          : "text-slate-text"
                    }
                  >
                    {h.label}
                  </span>
                </div>
              </div>
            ))}
            {sentiment && sentiment.headlines.length === 0 && (
              <p className="text-xs text-slate-text">No recent headlines found.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
