import { describe, expect, it } from "vitest";

import { buildChartModel, MARGIN, type Overlays } from "@/features/chart/model";

import { makeChart, makeHorizon } from "../fixtures";

const ALL_OVERLAYS: Overlays = { ema20: true, ema50: true, bollinger: true };
const NO_OVERLAYS: Overlays = { ema20: false, ema50: false, bollinger: false };

function model(overrides: Partial<Parameters<typeof buildChartModel>[0]> = {}) {
  const chart = makeChart("AAPL", 80);
  return buildChartModel({
    candles: chart.candles,
    indicators: chart.indicators,
    forecast: null,
    range: "3M",
    overlays: NO_OVERLAYS,
    width: 800,
    height: 400,
    ...overrides,
  });
}

describe("buildChartModel", () => {
  it("shows the range's window of bars, most recent last", () => {
    const m = model({ range: "1M" });
    expect(m.bars).toHaveLength(21);
    expect(m.last?.index).toBe(79);
    expect(m.bars[0].slot).toBe(0);
  });

  it("reserves one slot per forecast step to the right of the last bar", () => {
    const chart = makeChart("AAPL", 80);
    const forecast = makeHorizon("5d", 5, chart.candles[79].close);
    const m = model({ forecast, range: "1M" });

    expect(m.slotCount).toBe(21 + 5);
    expect(m.forecast?.points.map((p) => p.slot)).toEqual([21, 22, 23, 24, 25]);
    expect(m.forecast!.anchorX).toBe(m.last!.x);
    expect(m.forecast!.target.x).toBeGreaterThan(m.last!.x);
  });

  it("widens the price scale to keep the whole forecast band on screen", () => {
    const chart = makeChart("AAPL", 80);
    const forecast = makeHorizon("30d", 30, chart.candles[79].close);
    const highest = Math.max(...forecast.points.map((p) => p.upper_bound));
    const m = model({ forecast });

    expect(m.yPrice(highest)).toBeGreaterThanOrEqual(m.panes.price.top);
    expect(m.yPrice.domain[1]).toBeGreaterThan(highest);
  });

  it("classifies bars and keeps bodies at least a pixel tall", () => {
    const m = model();
    for (const bar of m.bars) {
      expect(bar.up).toBe(bar.close >= bar.open);
      expect(bar.bodyHeight).toBeGreaterThanOrEqual(1);
      expect(bar.wickTop).toBeLessThanOrEqual(bar.bodyTop);
    }
  });

  it("stacks price, volume and RSI panes without overlap", () => {
    const { price, volume, rsi } = model().panes;
    expect(price.top).toBe(MARGIN.top);
    expect(price.bottom).toBeLessThan(volume.top);
    expect(volume.bottom).toBeLessThan(rsi!.top);
    expect(rsi!.bottom).toBe(400 - MARGIN.bottom);
  });

  it("drops the RSI pane when the chart is too short for three panes", () => {
    const m = model({ height: 240 });
    expect(m.compact).toBe(true);
    expect(m.panes.rsi).toBeNull();
    expect(m.yRsi).toBeNull();
  });

  it("breaks overlay lines where the indicator hasn't warmed up yet", () => {
    const m = model({ range: "3Y", overlays: ALL_OVERLAYS });
    // EMA 50 is null for the first 49 bars: the path starts later, in one piece
    expect(m.paths.ema50.match(/M/g)).toHaveLength(1);
    expect(m.paths.bollinger.endsWith("Z")).toBe(true);
  });

  it("labels dates by day on short ranges and by month on long ones", () => {
    expect(model({ range: "3M" }).dateTicks[0].label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(model({ range: "3Y" }).dateTicks[0].label).toMatch(/^[A-Z][a-z]{2} '\d{2}$/);
  });

  it("anchors edge date labels so they aren't clipped", () => {
    const ticks = model({ range: "3Y" }).dateTicks;
    expect(ticks[0].anchor).toBe("start");
    expect(ticks.slice(1, -1).every((t) => t.anchor === "middle")).toBe(true);
  });

  it("chooses price-axis precision from the tick step", () => {
    expect(model().priceTickDigits).toBe(0);
    const tiny = makeChart("PENNY", 80, 0.1);
    tiny.candles = tiny.candles.map((c) => ({ ...c, open: c.open / 100, high: c.high / 100, low: c.low / 100, close: c.close / 100 }));
    const m = buildChartModel({ candles: tiny.candles, indicators: [], forecast: null, range: "3M", overlays: NO_OVERLAYS, width: 800, height: 400 });
    expect(m.priceTickDigits).toBeGreaterThan(0);
  });

  it("copes with an empty history", () => {
    const m = buildChartModel({ candles: [], indicators: [], forecast: null, range: "3M", overlays: NO_OVERLAYS, width: 800, height: 400 });
    expect(m.bars).toEqual([]);
    expect(m.last).toBeNull();
    expect(m.forecast).toBeNull();
  });
});
