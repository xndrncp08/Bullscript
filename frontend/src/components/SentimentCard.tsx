import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { SentimentResponse } from "@/types";

interface SentimentCardProps {
  sentiment: SentimentResponse | null;
  loading: boolean;
}

const LABEL_STYLES: Record<string, { color: string; Icon: typeof TrendingUp }> = {
  bullish: { color: "text-bull", Icon: TrendingUp },
  bearish: { color: "text-bear", Icon: TrendingDown },
  neutral: { color: "text-slate-text", Icon: Minus },
};

export default function SentimentCard({ sentiment, loading }: SentimentCardProps) {
  const style = LABEL_STYLES[sentiment?.label ?? "neutral"];
  const Icon = style.Icon;

  const scorePct = sentiment ? Math.round(((sentiment.weighted_score + 1) / 2) * 100) : 50;

  return (
    <div className="panel flex h-full flex-col p-4">
      <h2 className="text-sm font-semibold text-primary">News Sentiment (FinBERT)</h2>
      <p className="mb-4 text-xs text-slate-text">Weighted index across recent headlines</p>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-text">
          Analyzing headlines…
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Icon className={`h-8 w-8 ${style.color}`} />
            <div>
              <div className={`text-2xl font-bold capitalize ${style.color}`}>
                {sentiment?.label ?? "neutral"}
              </div>
              <div className="text-xs text-slate-text">
                score {sentiment?.weighted_score.toFixed(3) ?? "0.000"}
              </div>
            </div>
          </div>

          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-obsidian">
            <div
              className="h-full bg-gradient-to-r from-bear via-slate-border to-bull transition-all"
              style={{ width: "100%", opacity: 0.3 }}
            />
            <div
              className="-mt-2 h-2 w-2 rounded-full bg-primary shadow-glow-bull"
              style={{ marginLeft: `${scorePct}%` }}
            />
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
