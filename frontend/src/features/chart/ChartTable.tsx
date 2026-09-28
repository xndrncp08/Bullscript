import { useMemo } from "react";

import { Delta } from "@/components/primitives/Delta";
import { rangeStartIndex, type RangeKey } from "@/lib/chart-math";
import { formatCompact, formatMarketDate, formatPrice } from "@/lib/format";
import type { Candle, HorizonForecast, IndicatorPoint } from "@/types";

interface ChartTableProps {
  candles: Candle[];
  indicators: IndicatorPoint[];
  forecast: HorizonForecast | null;
  range: RangeKey;
}

const th = "sticky top-0 z-10 bg-surface px-2 py-1.5 text-right font-medium first:text-left";
const td = "px-2 py-1 text-right first:text-left";

/** The chart's table twin: every plotted value, readable without a pointer. */
export function ChartTable({ candles, indicators, forecast, range }: ChartTableProps) {
  const rows = useMemo(() => {
    const start = rangeStartIndex(
      candles.map((c) => c.date),
      range
    );
    const rsiByDate = new Map(indicators.map((i) => [i.date, i.rsi_14]));
    return candles
      .slice(start)
      .map((c, i, arr) => {
        const prev = i > 0 ? arr[i - 1] : candles[start - 1];
        return { ...c, change: prev ? c.close / prev.close - 1 : null, rsi: rsiByDate.get(c.date) ?? null };
      })
      .reverse();
  }, [candles, indicators, range]);

  return (
    <div className="h-full overflow-auto">
      <table className="tabular w-full border-collapse font-mono text-2xs">
        <caption className="sr-only">Daily bars, newest first, with the model forecast</caption>
        {forecast && (
          <tbody aria-label="Forecast">
            <tr className="label-caps">
              <th scope="col" className={th}>
                Forecast {forecast.horizon.toUpperCase()}
              </th>
              <th scope="col" className={th} colSpan={2}>
                Predicted
              </th>
              <th scope="col" className={th} colSpan={3}>
                {Math.round(forecast.interval * 100)}% interval
              </th>
              <th scope="col" className={th} colSpan={2} />
            </tr>
            {[...forecast.points].reverse().map((p) => (
              <tr key={`f-${p.date}`} className="text-accent">
                <td className={td}>{formatMarketDate(p.date, { withYear: true })}</td>
                <td className={td} colSpan={2}>
                  {formatPrice(p.predicted_close)}
                </td>
                <td className={td} colSpan={3}>
                  {formatPrice(p.lower_bound)} – {formatPrice(p.upper_bound)}
                </td>
                <td className={td} colSpan={2} />
              </tr>
            ))}
          </tbody>
        )}
        <tbody>
          <tr className="label-caps">
            {["Date", "Open", "High", "Low", "Close", "Chg", "Volume", "RSI"].map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
          {rows.map((r) => (
            <tr key={r.date} className="border-t border-line/40 text-ink-2 hover:bg-surface-raised/60">
              <td className={`${td} text-ink`}>{formatMarketDate(r.date, { withYear: true })}</td>
              <td className={td}>{formatPrice(r.open)}</td>
              <td className={td}>{formatPrice(r.high)}</td>
              <td className={td}>{formatPrice(r.low)}</td>
              <td className={`${td} text-ink`}>{formatPrice(r.close)}</td>
              <td className={td}>{r.change == null ? "—" : <Delta value={r.change} />}</td>
              <td className={td}>{formatCompact(r.volume)}</td>
              <td className={td}>{r.rsi == null ? "—" : r.rsi.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
