import { DataStreamLoader } from "@/components/primitives/DataStreamLoader";
import { Panel } from "@/components/primitives/Panel";
import type { Resource } from "@/hooks/useTickerData";
import { formatRelativeTime, formatSigned } from "@/lib/format";
import type { SentimentHeadline, SentimentResponse } from "@/types";

import { SentimentGauge } from "./SentimentGauge";

interface SentimentPanelProps {
  symbol: string;
  sentiment: Resource<SentimentResponse>;
  className?: string;
}

const POLARITY = {
  positive: { glyph: "▲", tone: "text-up", fill: "rgb(var(--color-up))" },
  neutral: { glyph: "•", tone: "text-ink-3", fill: "rgb(var(--color-text-muted))" },
  negative: { glyph: "▼", tone: "text-down", fill: "rgb(var(--color-down))" },
} as const;

type Polarity = keyof typeof POLARITY;

const LABEL_TONE: Record<string, string> = {
  bullish: "text-up",
  bearish: "text-down",
  neutral: "text-ink-2",
};

function polarityOf(headline: SentimentHeadline): Polarity {
  return headline.label in POLARITY ? (headline.label as Polarity) : "neutral";
}

function Distribution({ headlines }: { headlines: SentimentHeadline[] }) {
  const counts: Record<Polarity, number> = { positive: 0, neutral: 0, negative: 0 };
  headlines.forEach((h) => counts[polarityOf(h)]++);
  const total = headlines.length || 1;
  const order: Polarity[] = ["positive", "neutral", "negative"];

  return (
    <div className="space-y-1.5">
      {/* segments are separated by surface gaps, never outlines */}
      <div className="flex h-1.5 gap-0.5" role="img" aria-label={order.map((p) => `${counts[p]} ${p}`).join(", ")}>
        {order.map((p) =>
          counts[p] ? (
            <span key={p} className="rounded-sm" style={{ flexGrow: counts[p] / total, background: POLARITY[p].fill, opacity: 0.8 }} />
          ) : null
        )}
      </div>
      <div className="flex justify-between font-mono text-2xs text-ink-3">
        {order.map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={POLARITY[p].tone}>
              {POLARITY[p].glyph}
            </span>
            {counts[p]} {p}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SentimentPanel({ symbol, sentiment, className = "" }: SentimentPanelProps) {
  const data = sentiment.symbol === symbol ? sentiment.data : null;

  return (
    <Panel
      title="Sentiment"
      meta={data ? `FinBERT · ${data.headlines.length} headlines` : symbol}
      className={className}
      bodyClassName="flex flex-col overflow-hidden"
    >
      {!data && sentiment.status !== "error" && <DataStreamLoader title="scoring headlines · finbert" />}
      {!data && sentiment.status === "error" && (
        <p role="alert" className="p-4 font-mono text-xs text-down">
          &gt;_ {sentiment.error?.message ?? "Sentiment unavailable"}
        </p>
      )}

      {data && (
        <>
          <div key={symbol} className="motion-crossfade flex items-center gap-3 px-3 pt-3">
            <SentimentGauge score={data.weighted_score} label={data.label} />
            <div>
              <p className={`text-lg font-semibold capitalize ${LABEL_TONE[data.label] ?? "text-ink"}`}>{data.label}</p>
              <p className="tabular font-mono text-2xs text-ink-3">index {formatSigned(data.weighted_score, 3)}</p>
              <p className="mt-0.5 text-2xs text-ink-3">recency-weighted</p>
            </div>
          </div>

          <div className="px-3 pb-2 pt-3">
            <Distribution headlines={data.headlines} />
          </div>

          <ul className="min-h-0 flex-1 space-y-px overflow-y-auto border-t border-line/60 px-1 py-1" aria-label="Scored headlines">
            {data.headlines.length === 0 && <li className="p-3 text-xs text-ink-3">No recent headlines for {symbol}.</li>}
            {data.headlines.map((h, index) => {
              const polarity = POLARITY[polarityOf(h)];
              return (
                <li
                  key={`${symbol}-${index}`}
                  className="motion-fade-up grid grid-cols-[0.75rem_1fr] gap-x-2 rounded-md px-2 py-1.5 hover:bg-surface-raised/50"
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <span aria-hidden="true" className={`pt-0.5 text-[9px] ${polarity.tone}`}>
                    {polarity.glyph}
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-xs leading-snug text-ink">{h.headline}</p>
                    <p className="mt-0.5 font-mono text-2xs text-ink-3">
                      <span className="sr-only">{h.label}. </span>
                      {h.source ?? "unknown"}
                      {h.published_at && ` · ${formatRelativeTime(h.published_at)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
