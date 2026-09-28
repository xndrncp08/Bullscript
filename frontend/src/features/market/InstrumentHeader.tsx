import { Star } from "lucide-react";
import { useMemo } from "react";

import { Delta } from "@/components/primitives/Delta";
import { FlashValue } from "@/components/primitives/FlashValue";
import type { Resource } from "@/hooks/useTickerData";
import { formatCompact, formatMarketDate, formatPercent, formatPrice } from "@/lib/format";
import { isLiveBar } from "@/lib/market";
import { lookupInstrument } from "@/lib/symbols";
import type { ChartResponse, Quote } from "@/types";

interface InstrumentHeaderProps {
  symbol: string;
  chart: Resource<ChartResponse>;
  /** Refreshed every minute; preferred over the (longer-cached) daily bars
   * for the headline price so intraday moves show up and tick-flash. */
  quote?: Quote;
  watched: boolean;
  onToggleWatch: () => void;
}

interface Snapshot {
  close: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  volumeRatio: number | null;
  rsi: number | null;
  atrPct: number | null;
  vol20: number | null;
  low52: number;
  high52: number;
  asOf: string;
}

function snapshotOf(chart: ChartResponse): Snapshot | null {
  const { candles, indicators } = chart;
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const indicator = indicators[indicators.length - 1];
  const year = candles.slice(-252);
  const recentVolumes = candles.slice(-21, -1).map((c) => c.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / Math.max(1, recentVolumes.length);

  return {
    close: last.close,
    change: last.close - prev.close,
    changePct: last.close / prev.close - 1,
    open: last.open,
    high: last.high,
    low: last.low,
    volume: last.volume,
    volumeRatio: avgVolume > 0 ? last.volume / avgVolume : null,
    rsi: indicator?.rsi_14 ?? null,
    atrPct: indicator?.atr_14 != null ? indicator.atr_14 / last.close : null,
    vol20: indicator?.volatility_20 ?? null,
    low52: Math.min(...year.map((c) => c.low)),
    high52: Math.max(...year.map((c) => c.high)),
    asOf: last.date,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-caps">{label}</dt>
      <dd className="tabular font-mono text-xs text-ink">{value}</dd>
    </div>
  );
}

export function InstrumentHeader({ symbol, chart, quote, watched, onToggleWatch }: InstrumentHeaderProps) {
  const current = chart.symbol === symbol ? chart.data : null;
  const snapshot = useMemo(() => (current ? snapshotOf(current) : null), [current]);
  const instrument = lookupInstrument(symbol);

  // The live quote wins when it's at least as recent as the last daily bar.
  const live = snapshot && quote && quote.symbol === symbol && quote.as_of >= snapshot.asOf ? quote : null;
  const price = live?.price ?? snapshot?.close ?? 0;
  const change = live?.change ?? snapshot?.change ?? 0;
  const changePct = live?.change_pct ?? snapshot?.changePct ?? 0;
  const asOf = live?.as_of ?? snapshot?.asOf ?? "";
  const forming = asOf !== "" && isLiveBar(asOf);

  const rangePosition = snapshot
    ? (price - snapshot.low52) / Math.max(1e-9, snapshot.high52 - snapshot.low52)
    : 0;

  return (
    <section aria-label={`${symbol} quote`} className="panel flex flex-wrap items-end gap-x-8 gap-y-3 px-4 py-3">
      <div key={symbol} className="motion-crossfade min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-sm font-semibold tracking-wide text-ink">{symbol}</h1>
          <span className="truncate text-xs text-ink-2">{instrument?.name ?? "—"}</span>
          {instrument && <span className="label-caps rounded border border-line px-1 py-px">{instrument.kind}</span>}
          <button
            type="button"
            onClick={onToggleWatch}
            aria-pressed={watched}
            aria-label={watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
            className="press ml-1 rounded p-1 text-ink-3 hover:text-ink"
          >
            <Star className={`h-3.5 w-3.5 ${watched ? "fill-warn text-warn" : ""}`} />
          </button>
        </div>

        {snapshot ? (
          <div className="mt-1 flex items-baseline gap-3">
            <FlashValue value={price} identity={symbol} className="px-0.5">
              <span className="text-[40px] font-semibold leading-none tracking-tight text-ink" data-testid="hero-price">
                {formatPrice(price)}
              </span>
            </FlashValue>
            <div className="flex flex-col font-mono text-xs">
              <Delta value={change} kind="absolute" />
              <span className="tabular text-ink-3">{formatPercent(changePct)}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 self-end pb-0.5 font-mono text-2xs text-ink-3">
              {forming && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-up" aria-hidden="true" />}
              {forming ? "live" : "close"} · {formatMarketDate(asOf, { withYear: true })}
            </span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-3" aria-hidden="true">
            <div className="skeleton h-9 w-40" />
            <div className="skeleton h-6 w-16" />
          </div>
        )}
      </div>

      {snapshot && (
        <dl className="motion-fade-in ml-auto grid grid-cols-4 gap-x-6 gap-y-2 sm:grid-cols-8">
          <Stat label="Open" value={formatPrice(snapshot.open)} />
          <Stat label="High" value={formatPrice(snapshot.high)} />
          <Stat label="Low" value={formatPrice(snapshot.low)} />
          <Stat label="HV 20" value={formatPercent(snapshot.vol20, { digits: 1, signed: false })} />
          <Stat
            label="Volume"
            value={`${formatCompact(snapshot.volume)}${snapshot.volumeRatio ? ` · ${snapshot.volumeRatio.toFixed(1)}×` : ""}`}
          />
          <Stat label="RSI 14" value={snapshot.rsi == null ? "—" : snapshot.rsi.toFixed(1)} />
          <Stat label="ATR" value={formatPercent(snapshot.atrPct, { signed: false })} />
          <div className="flex flex-col gap-1">
            <dt className="label-caps">52W range</dt>
            <dd className="flex items-center gap-1.5 font-mono text-2xs text-ink-3">
              <span className="tabular">{formatPrice(snapshot.low52, 0)}</span>
              <span className="relative h-1 w-14 rounded-full bg-line" role="img" aria-label={`at ${Math.round(rangePosition * 100)}% of the 52-week range`}>
                <span
                  className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-ink"
                  style={{ left: `calc(${Math.min(1, Math.max(0, rangePosition)) * 100}% - 1px)` }}
                />
              </span>
              <span className="tabular">{formatPrice(snapshot.high52, 0)}</span>
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
