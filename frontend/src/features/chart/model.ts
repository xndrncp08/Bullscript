/**
 * Chart geometry: turns bars, indicators and a forecast into pixel positions
 * for every mark. Pure and synchronous - the SVG layer only draws what this
 * returns, and the tests exercise it without a DOM.
 *
 * Layout is three stacked panes sharing one x axis - price, volume, RSI -
 * each with its own y scale. Stacking instead of overlaying keeps every pane
 * single-axis (no dual-axis charts).
 */

import {
  bandPath,
  extent,
  linearScale,
  linePath,
  niceTicks,
  padDomain,
  pickIndexTicks,
  rangeStartIndex,
  type LinearScale,
  type RangeKey,
} from "@/lib/chart-math";
import { formatMarketDate, formatMonthYear } from "@/lib/format";
import type { Candle, ForecastPoint, HorizonForecast, IndicatorPoint } from "@/types";

export type ChartMode = "candles" | "line" | "table";

export interface Overlays {
  ema20: boolean;
  ema50: boolean;
  bollinger: boolean;
}

export const MARGIN = { top: 10, right: 62, bottom: 22, left: 6 };
const PANE_GAP = 10;
const COMPACT_HEIGHT = 250;
const DATE_LABEL_HALF_WIDTH = 22;

export interface Pane {
  top: number;
  bottom: number;
}

export interface Bar {
  /** Index into the full candle history. */
  index: number;
  /** Horizontal slot within the visible window. */
  slot: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number | null;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  up: boolean;
  x: number;
  bodyTop: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
  volumeTop: number;
}

export interface ForecastGeometry {
  horizon: string;
  anchorX: number;
  anchorY: number;
  line: string;
  band: string;
  upperEdge: string;
  lowerEdge: string;
  points: (ForecastPoint & { slot: number; x: number; y: number })[];
  target: { x: number; y: number; price: number };
}

export interface ChartModel {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  slotCount: number;
  slotWidth: number;
  bodyWidth: number;
  compact: boolean;
  panes: { price: Pane; volume: Pane; rsi: Pane | null };
  bars: Bar[];
  yPrice: LinearScale;
  yVolume: LinearScale;
  yRsi: LinearScale | null;
  priceTicks: number[];
  /** Decimals the price axis needs: 0 for 300/350, 2 for 0.25 steps. */
  priceTickDigits: number;
  dateTicks: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
  paths: { close: string; closeArea: string; ema20: string; ema50: string; bollinger: string };
  forecast: ForecastGeometry | null;
  last: Bar | null;
  slotX: (slot: number) => number;
}

interface ModelInput {
  candles: Candle[];
  indicators: IndicatorPoint[];
  forecast: HorizonForecast | null;
  range: RangeKey;
  overlays: Overlays;
  width: number;
  height: number;
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

function layoutPanes(height: number): { price: Pane; volume: Pane; rsi: Pane | null; compact: boolean } {
  const top = MARGIN.top;
  const bottom = height - MARGIN.bottom;
  const available = bottom - top;
  const compact = available < COMPACT_HEIGHT;

  const rsiHeight = compact ? 0 : clamp(available * 0.17, 40, 84);
  const volumeHeight = clamp(available * 0.14, 24, 64);

  const rsi = compact ? null : { top: bottom - rsiHeight, bottom };
  const volumeBottom = rsi ? rsi.top - PANE_GAP : bottom;
  const volume = { top: volumeBottom - volumeHeight, bottom: volumeBottom };
  const price = { top, bottom: volume.top - PANE_GAP };

  return { price, volume, rsi, compact };
}

export function buildChartModel({
  candles,
  indicators,
  forecast,
  range,
  overlays,
  width,
  height,
}: ModelInput): ChartModel {
  const { price, volume, rsi, compact } = layoutPanes(height);
  const plotLeft = MARGIN.left;
  const plotRight = Math.max(plotLeft + 1, width - MARGIN.right);

  const start = rangeStartIndex(
    candles.map((c) => c.date),
    range
  );
  const visible = candles.slice(start);
  const indicatorByDate = new Map(indicators.map((i) => [i.date, i]));
  const forecastPoints = forecast?.points ?? [];

  const slotCount = Math.max(1, visible.length + forecastPoints.length);
  const slotWidth = (plotRight - plotLeft) / slotCount;
  const bodyWidth = clamp(slotWidth * 0.62, 1, 11);
  const slotX = (slot: number) => plotLeft + (slot + 0.5) * slotWidth;

  const ind = visible.map((c) => indicatorByDate.get(c.date));

  const priceExtent =
    extent([
      ...visible.flatMap((c) => [c.low, c.high]),
      ...(overlays.ema20 ? ind.map((i) => i?.ema_20) : []),
      ...(overlays.ema50 ? ind.map((i) => i?.ema_50) : []),
      ...(overlays.bollinger ? ind.flatMap((i) => [i?.bb_upper, i?.bb_lower]) : []),
      ...forecastPoints.flatMap((p) => [p.lower_bound, p.upper_bound]),
    ]) ?? [0, 1];
  const priceDomain = padDomain(priceExtent, 0.06);
  const yPrice = linearScale(priceDomain, [price.bottom, price.top]);
  const priceTicks = niceTicks(
    priceDomain[0],
    priceDomain[1],
    clamp(Math.floor((price.bottom - price.top) / 52), 2, 8)
  ).filter((t) => t >= priceDomain[0] && t <= priceDomain[1]);
  const priceTickDigits = Math.min(
    4,
    Math.max(0, ...priceTicks.map((t) => (String(t).split(".")[1] ?? "").length))
  );

  const maxVolume = Math.max(1, ...visible.map((c) => c.volume));
  const yVolume = linearScale([0, maxVolume * 1.05], [volume.bottom, volume.top]);
  const yRsi = rsi ? linearScale([0, 100], [rsi.bottom, rsi.top]) : null;

  const bars: Bar[] = visible.map((c, slot) => {
    const indicator = ind[slot];
    const previous = candles[start + slot - 1];
    const yOpen = yPrice(c.open);
    const yClose = yPrice(c.close);
    const bodyTop = Math.min(yOpen, yClose);
    return {
      index: start + slot,
      slot,
      date: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      change: previous ? c.close / previous.close - 1 : null,
      rsi: indicator?.rsi_14 ?? null,
      ema20: indicator?.ema_20 ?? null,
      ema50: indicator?.ema_50 ?? null,
      up: c.close >= c.open,
      x: slotX(slot),
      bodyTop,
      bodyHeight: Math.max(1, Math.abs(yClose - yOpen)),
      wickTop: yPrice(c.high),
      wickBottom: yPrice(c.low),
      volumeTop: yVolume(c.volume),
    };
  });

  const closePoints = bars.map((b) => ({ x: b.x, y: yPrice(b.close) }));
  const close = linePath(closePoints);
  const closeArea =
    bars.length > 1
      ? `${close}L${bars[bars.length - 1].x},${price.bottom}L${bars[0].x},${price.bottom}Z`
      : "";

  const bollingerBars = bars.filter((_, i) => ind[i]?.bb_upper != null && ind[i]?.bb_lower != null);
  const bollinger = bandPath(
    bollingerBars.map((b) => b.x),
    bollingerBars.map((b) => yPrice(indicatorByDate.get(b.date)!.bb_upper!)),
    bollingerBars.map((b) => yPrice(indicatorByDate.get(b.date)!.bb_lower!))
  );

  const last = bars.length ? bars[bars.length - 1] : null;

  let forecastGeometry: ForecastGeometry | null = null;
  if (forecast && last && forecastPoints.length) {
    const anchorY = yPrice(last.close);
    const points = forecastPoints.map((p, k) => {
      const slot = visible.length + k;
      return { ...p, slot, x: slotX(slot), y: yPrice(p.predicted_close) };
    });
    const xs = [last.x, ...points.map((p) => p.x)];
    const upper = [anchorY, ...points.map((p) => yPrice(p.upper_bound))];
    const lower = [anchorY, ...points.map((p) => yPrice(p.lower_bound))];
    const final = points[points.length - 1];

    forecastGeometry = {
      horizon: forecast.horizon,
      anchorX: last.x,
      anchorY,
      line: linePath([{ x: last.x, y: anchorY }, ...points]),
      band: bandPath(xs, upper, lower),
      upperEdge: linePath(xs.map((x, i) => ({ x, y: upper[i] }))),
      lowerEdge: linePath(xs.map((x, i) => ({ x, y: lower[i] }))),
      points,
      target: { x: final.x, y: final.y, price: final.predicted_close },
    };
  }

  const shortRange = range === "1M" || range === "3M" || range === "6M";
  const slotDate = (slot: number) =>
    slot < visible.length ? visible[slot].date : forecastPoints[slot - visible.length]?.date;
  const dateTicks = pickIndexTicks(slotCount, Math.max(2, Math.floor((plotRight - plotLeft) / 96)))
    .map((slot) => ({ slot, date: slotDate(slot) }))
    .filter((t): t is { slot: number; date: string } => Boolean(t.date))
    .map(({ slot, date }) => {
      const x = slotX(slot);
      // labels near an edge anchor to it instead of being clipped in half
      const anchor: "start" | "middle" | "end" =
        x - DATE_LABEL_HALF_WIDTH < plotLeft ? "start" : x + DATE_LABEL_HALF_WIDTH > plotRight ? "end" : "middle";
      return {
        x: anchor === "start" ? plotLeft : anchor === "end" ? plotRight : x,
        label: shortRange ? formatMarketDate(date) : formatMonthYear(date),
        anchor,
      };
    });

  return {
    width,
    height,
    plotLeft,
    plotRight,
    slotCount,
    slotWidth,
    bodyWidth,
    compact,
    panes: { price, volume, rsi },
    bars,
    yPrice,
    yVolume,
    yRsi,
    priceTicks,
    priceTickDigits,
    dateTicks,
    paths: {
      close,
      closeArea,
      ema20: linePath(bars.map((b) => ({ x: b.x, y: b.ema20 == null ? null : yPrice(b.ema20) }))),
      ema50: linePath(bars.map((b) => ({ x: b.x, y: b.ema50 == null ? null : yPrice(b.ema50) }))),
      bollinger,
    },
    forecast: forecastGeometry,
    last,
    slotX,
  };
}
