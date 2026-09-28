import type { ReactNode } from "react";

import { Delta } from "@/components/primitives/Delta";
import { formatCompact, formatMarketDate, formatPrice } from "@/lib/format";

import type { ChartModel, Overlays } from "./model";

function Field({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      {swatch && <span aria-hidden="true" className="inline-block h-0.5 w-2.5 self-center rounded-full" style={{ background: swatch }} />}
      <span className="text-ink-3">{label}</span>
      <span className="tabular text-ink">{value}</span>
    </span>
  );
}

interface ChartReadoutProps {
  model: ChartModel | null;
  /** Slot under the crosshair; null shows the latest bar. */
  slot: number | null;
  overlays: Overlays;
  live: boolean;
}

/** The crosshair's readout, pinned above the plot so it never covers the
 * data it describes. Lists every series at the inspected bar. */
export function ChartReadout({ model, slot, overlays, live }: ChartReadoutProps) {
  if (!model?.last) return <div className="h-5" />;

  const index = slot ?? model.last.slot;
  const bar = model.bars[index];
  const point = bar ? null : model.forecast?.points.find((p) => p.slot === index);

  return (
    <div
      className="flex h-5 min-w-0 items-center gap-3 overflow-hidden font-mono text-2xs"
      aria-live={live ? "polite" : undefined}
      data-testid="chart-readout"
    >
      {bar && (
        <>
          <span className="shrink-0 font-medium uppercase text-ink-2">{formatMarketDate(bar.date, { withYear: true })}</span>
          <Field label="O" value={formatPrice(bar.open)} />
          <Field label="H" value={formatPrice(bar.high)} />
          <Field label="L" value={formatPrice(bar.low)} />
          <Field label="C" value={formatPrice(bar.close)} />
          {bar.change != null && <Delta value={bar.change} className="shrink-0" />}
          <Field label="VOL" value={formatCompact(bar.volume)} />
          {overlays.ema20 && bar.ema20 != null && (
            <Field label="EMA20" value={formatPrice(bar.ema20)} swatch="rgb(var(--series-ema20))" />
          )}
          {overlays.ema50 && bar.ema50 != null && (
            <Field label="EMA50" value={formatPrice(bar.ema50)} swatch="rgb(var(--series-ema50))" />
          )}
          {bar.rsi != null && <Field label="RSI" value={bar.rsi.toFixed(1)} />}
        </>
      )}
      {point && (
        <>
          <span className="shrink-0 font-medium uppercase text-accent">
            {formatMarketDate(point.date, { withYear: true })} · forecast
          </span>
          <Field label="PRED" value={formatPrice(point.predicted_close)} swatch="rgb(var(--series-forecast))" />
          <Field label="80%" value={`${formatPrice(point.lower_bound)} – ${formatPrice(point.upper_bound)}`} />
        </>
      )}
    </div>
  );
}
