/** Pure geometry for the price chart. No DOM, no React - everything here is
 * unit tested so the SVG layer can stay a thin rendering of its output. */

import { parseMarketDate } from "./format";

export type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y";

export const RANGES: { key: RangeKey; label: string; bars: number | null }[] = [
  { key: "1M", label: "1M", bars: 21 },
  { key: "3M", label: "3M", bars: 63 },
  { key: "6M", label: "6M", bars: 126 },
  { key: "YTD", label: "YTD", bars: null },
  { key: "1Y", label: "1Y", bars: 252 },
  { key: "3Y", label: "3Y", bars: null },
];

/** Index of the first bar visible for a range, over dates sorted ascending. */
export function rangeStartIndex(dates: string[], range: RangeKey): number {
  if (dates.length === 0) return 0;
  if (range === "3Y") return 0;
  if (range === "YTD") {
    const { year } = parseMarketDate(dates[dates.length - 1]);
    const first = dates.findIndex((d) => parseMarketDate(d).year === year);
    return first === -1 ? 0 : first;
  }
  const bars = RANGES.find((r) => r.key === range)?.bars ?? dates.length;
  return Math.max(0, dates.length - bars);
}

export interface LinearScale {
  (value: number): number;
  invert(pixel: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/** Heckbert's nice numbers: ticks on 1/2/2.5/5 x 10^k steps. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  if (min > max) [min, max] = [max, min];

  const rawStep = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = niceResidual * magnitude;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  // round to the step's precision so 0.1 + 0.2 never renders as 0.30000000000000004
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let v = start; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(decimals)));
  }
  return ticks;
}

/** Min/max over finite values, ignoring null/undefined/NaN. */
export function extent(values: Iterable<number | null | undefined>): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? null : [lo, hi];
}

export function padDomain([lo, hi]: [number, number], fraction = 0.06): [number, number] {
  const span = hi - lo || Math.abs(hi) * 0.02 || 1;
  return [lo - span * fraction, hi + span * fraction];
}

/** At most `maxTicks` evenly spaced slot indices, starting at the first. */
export function pickIndexTicks(count: number, maxTicks: number): number[] {
  if (count <= 0) return [];
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / maxTicks);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += step) ticks.push(i);
  return ticks;
}

export interface Point {
  x: number;
  y: number | null;
}

/** An SVG path through the points; null values break the line into
 * separate subpaths instead of drawing a false connection across the gap. */
export function linePath(points: Point[]): string {
  let d = "";
  let penDown = false;
  for (const { x, y } of points) {
    if (y == null || !Number.isFinite(y)) {
      penDown = false;
      continue;
    }
    d += `${penDown ? "L" : "M"}${round(x)},${round(y)}`;
    penDown = true;
  }
  return d;
}

/** Closed polygon between an upper and lower edge sharing x positions. */
export function bandPath(xs: number[], upper: number[], lower: number[]): string {
  if (xs.length === 0) return "";
  let d = `M${round(xs[0])},${round(upper[0])}`;
  for (let i = 1; i < xs.length; i++) d += `L${round(xs[i])},${round(upper[i])}`;
  for (let i = xs.length - 1; i >= 0; i--) d += `L${round(xs[i])},${round(lower[i])}`;
  return `${d}Z`;
}

/** Slot index nearest to a pixel x within a band of `count` equal slots. */
export function slotAt(x: number, left: number, slotWidth: number, count: number): number {
  if (count <= 0 || slotWidth <= 0) return -1;
  const index = Math.floor((x - left) / slotWidth);
  return Math.min(count - 1, Math.max(0, index));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
