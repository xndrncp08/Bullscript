import { ChartCandlestick, ChartLine, Table2 } from "lucide-react";
import { memo, useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { DataStreamLoader } from "@/components/primitives/DataStreamLoader";
import { Panel } from "@/components/primitives/Panel";
import { SegmentedControl } from "@/components/primitives/SegmentedControl";
import { useElementSize } from "@/hooks/useElementSize";
import { useRevealWindow } from "@/hooks/useRevealWindow";
import type { Resource } from "@/hooks/useTickerData";
import { RANGES, slotAt, type RangeKey } from "@/lib/chart-math";
import { formatPercent, formatPrice } from "@/lib/format";
import { useTelemetry } from "@/lib/telemetry";
import { requestLines } from "@/features/telemetry/requestLines";
import type { ChartResponse, PredictionResponse } from "@/types";

import { ChartReadout } from "./ChartReadout";
import { ChartTable } from "./ChartTable";
import { buildChartModel, type Bar, type ChartMode, type ChartModel, type Overlays } from "./model";

const UP = "rgb(var(--color-up))";
const DOWN = "rgb(var(--color-down))";
const GRID = "rgb(var(--color-grid))";
const AXIS_TEXT = "rgb(var(--color-text-muted))";
const FORECAST = "rgb(var(--series-forecast))";
const HOLLOW_MIN_WIDTH = 3;
/** Total stagger budget for the candle load-in, however many bars there are. */
const REVEAL_STAGGER_MS = 240;

interface PriceChartProps {
  symbol: string;
  chart: Resource<ChartResponse>;
  prediction: Resource<PredictionResponse>;
  horizon: string;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  overlays: Overlays;
  onOverlaysChange: (overlays: Overlays) => void;
  onRetry: () => void;
  /** Hold the load-in while something covers the chart (the boot sequence),
   * so it plays when it can actually be seen. */
  holdReveal?: boolean;
}

interface Hover {
  slot: number;
  y: number | null;
  source: "pointer" | "keyboard";
}

const OVERLAY_CHIPS: { key: keyof Overlays; label: string; swatch: string; band?: boolean }[] = [
  { key: "ema20", label: "EMA 20", swatch: "rgb(var(--series-ema20))" },
  { key: "ema50", label: "EMA 50", swatch: "rgb(var(--series-ema50))" },
  { key: "bollinger", label: "BB 20·2", swatch: "rgb(var(--color-text-secondary) / 0.5)", band: true },
];

export function PriceChart(props: PriceChartProps) {
  const { symbol, chart, prediction, horizon, range, mode, overlays } = props;
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const clipId = useId();
  const telemetry = useTelemetry();

  const data = chart.data;
  const dataSymbol = chart.symbol;
  const stale = data != null && dataSymbol !== symbol;
  // Only draw a forecast that belongs to the bars on screen.
  const forecast =
    prediction.data && prediction.symbol === dataSymbol
      ? prediction.data.horizons.find((h) => h.horizon === horizon) ?? null
      : null;

  const model = useMemo(() => {
    if (!data || size.width < 40 || size.height < 80) return null;
    return buildChartModel({
      candles: data.candles,
      indicators: data.indicators,
      forecast,
      range,
      overlays,
      width: size.width,
      height: size.height,
    });
  }, [data, forecast, range, overlays, size.width, size.height]);

  const revealing = useRevealWindow(props.holdReveal ? null : dataSymbol, 700);
  const forecastKey = forecast ? `${dataSymbol}:${forecast.horizon}:${forecast.model_version}` : null;

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    if (!model) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const slot = slotAt(x, model.plotLeft, model.slotWidth, model.slotCount);
    setHover({ slot, y, source: "pointer" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!model?.last) return;
    const current = hover?.slot ?? model.last.slot;
    const last = model.slotCount - 1;
    const next: Record<string, number> = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(last, current + 1),
      Home: 0,
      End: last,
    };
    if (event.key === "Escape") {
      setHover(null);
      return;
    }
    if (!(event.key in next)) return;
    event.preventDefault();
    setHover({ slot: next[event.key], y: null, source: "keyboard" });
  };

  const lines = requestLines(telemetry, symbol);
  const barsInView = model?.bars.length ?? 0;

  return (
    <Panel
      title="Price action"
      meta={data ? `${dataSymbol} · daily · ${barsInView} bars` : symbol}
      className="h-full"
      actions={
        <SegmentedControl<ChartMode>
          label="Chart type"
          value={mode}
          onChange={props.onModeChange}
          options={[
            { value: "candles", label: <><ChartCandlestick className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Candles</span></>, title: "Candles" },
            { value: "line", label: <><ChartLine className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Line</span></>, title: "Line" },
            { value: "table", label: <><Table2 className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Table</span></>, title: "Table" },
          ]}
        />
      }
      bodyClassName="flex flex-col"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/50 px-3 py-2">
        <SegmentedControl<RangeKey>
          label="Chart range"
          value={range}
          onChange={props.onRangeChange}
          options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
        />
        <div className="flex items-center gap-1" role="group" aria-label="Overlays">
          {OVERLAY_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={overlays[chip.key]}
              onClick={() => props.onOverlaysChange({ ...overlays, [chip.key]: !overlays[chip.key] })}
              className={`press inline-flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-2xs ${
                overlays[chip.key]
                  ? "border-line-strong bg-surface-raised text-ink"
                  : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              <span
                aria-hidden="true"
                className={chip.band ? "h-2 w-3 rounded-[2px]" : "h-0.5 w-3 rounded-full"}
                style={{ background: chip.swatch, opacity: overlays[chip.key] ? 1 : 0.4 }}
              />
              {chip.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 font-mono text-2xs">
          <span aria-hidden="true" className="inline-block h-0 w-3 border-t-2 border-dashed" style={{ borderColor: FORECAST }} />
          <span className="text-ink-3">
            forecast {horizon.toUpperCase()} ·{" "}
            {forecast ? `${Math.round(forecast.interval * 100)}% interval` : prediction.status === "error" ? "unavailable" : "training"}
          </span>
        </div>
      </div>

      <div className="px-3 pt-2">
        <ChartReadout model={model} slot={hover?.slot ?? null} overlays={overlays} live={hover?.source === "keyboard"} />
      </div>

      <div
        ref={containerRef}
        className="relative min-h-[220px] flex-1 outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
        tabIndex={mode === "table" ? -1 : 0}
        onKeyDown={onKeyDown}
        onBlur={() => hover?.source === "keyboard" && setHover(null)}
        aria-label={`${symbol} price chart. Left and right arrow keys inspect individual bars.`}
        role="group"
        aria-roledescription="interactive chart"
      >
        {mode === "table" && data ? (
          <div className="absolute inset-0 px-1">
            <ChartTable candles={data.candles} indicators={data.indicators} forecast={forecast} range={range} />
          </div>
        ) : model ? (
          <svg
            width={model.width}
            height={model.height}
            className={`absolute inset-0 transition-opacity duration-200 ${stale ? "opacity-35" : "opacity-100"}`}
            role="img"
            aria-label={chartSummary(model, dataSymbol ?? symbol)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={model.plotLeft} y={0} width={model.plotRight - model.plotLeft} height={model.height} />
              </clipPath>
            </defs>
            <StaticLayers
              model={model}
              mode={mode}
              overlays={overlays}
              revealing={revealing}
              clipId={clipId}
              symbol={dataSymbol ?? symbol}
            />
            {model.forecast && forecastKey && (
              <ForecastLayer
                key={forecastKey}
                model={model}
                horizon={horizon}
                delayed={revealing}
                lastClose={model.last?.close ?? 0}
              />
            )}
            {hover && !stale && <Crosshair model={model} hover={hover} />}
            <rect
              x={model.plotLeft}
              y={0}
              width={model.plotRight - model.plotLeft}
              height={model.height}
              fill="transparent"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
              data-testid="chart-hit-area"
            />
          </svg>
        ) : null}

        {!data && chart.status !== "error" && (
          <div className="absolute inset-0">
            <DataStreamLoader title={`loading ${symbol} · daily bars`} lines={lines} />
          </div>
        )}

        {!data && chart.status === "error" && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-mono text-xs">
            <p className="text-down">&gt;_ {chart.error?.message ?? "Couldn't load market data"}</p>
            <button type="button" onClick={props.onRetry} className="press rounded-md border border-line px-3 py-1.5 text-ink-2 hover:text-ink">
              retry
            </button>
          </div>
        )}

        {stale && (
          <div className="pointer-events-none absolute inset-0 flex flex-col" aria-hidden="true">
            <div className="h-px overflow-hidden bg-line/40">
              <div className="motion-scan h-px w-1/4 bg-accent" />
            </div>
            <div className="flex flex-1 items-center justify-center">
              <span className="rounded-md border border-line bg-surface/90 px-3 py-1.5 font-mono text-2xs text-accent backdrop-blur">
                &gt;_ loading {symbol}
                <span className="motion-caret">▍</span>
              </span>
            </div>
          </div>
        )}

        {data && !stale && mode !== "table" && prediction.status === "loading" && !forecast && (
          <span className="pointer-events-none absolute right-16 top-3 font-mono text-2xs text-accent/80">
            &gt;_ training forecast models<span className="motion-caret">▍</span>
          </span>
        )}
      </div>
    </Panel>
  );
}

function chartSummary(model: ChartModel, symbol: string): string {
  const first = model.bars[0];
  const last = model.last;
  if (!first || !last) return `${symbol} price chart`;
  const change = last.close / first.close - 1;
  let text = `${symbol} daily chart, ${model.bars.length} bars from ${first.date} to ${last.date}, closing ${formatPrice(
    last.close
  )} (${formatPercent(change)} over the period).`;
  if (model.forecast) {
    text += ` ${model.forecast.horizon} forecast target ${formatPrice(model.forecast.target.price)}.`;
  }
  return text;
}

interface StaticLayersProps {
  model: ChartModel;
  mode: ChartMode;
  overlays: Overlays;
  revealing: boolean;
  clipId: string;
  symbol: string;
}

/** Grid, axes, candles, volume, RSI and overlays: everything that doesn't
 * move with the pointer. Memoised so hovering re-renders only the crosshair,
 * not thousands of marks. */
const StaticLayers = memo(function StaticLayers({ model, mode, overlays, revealing, clipId, symbol }: StaticLayersProps) {
  const { panes, plotLeft, plotRight, bars, bodyWidth, yPrice } = model;
  const hollow = bodyWidth >= HOLLOW_MIN_WIDTH;
  const step = bars.length > 1 ? REVEAL_STAGGER_MS / bars.length : 0;
  const last = model.last;
  const lastUp = last ? (last.change ?? 0) >= 0 : true;

  return (
    <g>
      {/* grid */}
      <g shapeRendering="crispEdges">
        {model.priceTicks.map((tick) => (
          <line key={tick} x1={plotLeft} x2={plotRight} y1={yPrice(tick)} y2={yPrice(tick)} stroke={GRID} />
        ))}
        <line x1={plotLeft} x2={plotRight} y1={panes.volume.bottom} y2={panes.volume.bottom} stroke={GRID} />
      </g>

      {/* forecast zone */}
      {model.forecast && (
        <g aria-hidden="true">
          <rect
            x={model.forecast.anchorX}
            y={panes.price.top}
            width={Math.max(0, plotRight - model.forecast.anchorX)}
            height={panes.price.bottom - panes.price.top}
            fill="rgb(var(--color-accent) / 0.035)"
          />
          <line
            x1={model.forecast.anchorX}
            x2={model.forecast.anchorX}
            y1={panes.price.top}
            y2={(panes.rsi ?? panes.volume).bottom}
            stroke="rgb(var(--color-accent) / 0.35)"
            shapeRendering="crispEdges"
          />
          {/* a narrow zone (long range, short horizon) puts the label left of the NOW line */}
          <text
            x={plotRight - model.forecast.anchorX < 96 ? model.forecast.anchorX - 6 : model.forecast.anchorX + 6}
            textAnchor={plotRight - model.forecast.anchorX < 96 ? "end" : "start"}
            y={panes.price.top + 11}
            className="fill-accent/70 font-mono"
            fontSize={9}
            letterSpacing="0.1em"
          >
            FORECAST · {model.forecast.horizon.toUpperCase()}
          </text>
        </g>
      )}

      {/* bollinger band */}
      {overlays.bollinger && model.paths.bollinger && (
        <path
          d={model.paths.bollinger}
          fill="rgb(var(--color-text-secondary) / 0.07)"
          stroke="rgb(var(--color-text-secondary) / 0.3)"
          strokeWidth={1}
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* price */}
      <g clipPath={`url(#${clipId})`} data-testid="price-layer">
        {mode === "line" ? (
          <g className={revealing ? "motion-reveal" : undefined}>
            <path d={model.paths.closeArea} fill="rgb(var(--color-text-primary) / 0.05)" />
            <path
              d={model.paths.close}
              fill="none"
              stroke="rgb(var(--color-text-primary) / 0.85)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              data-testid="close-line"
            />
          </g>
        ) : (
          bars.map((bar) => (
            <CandleMark
              key={`${symbol}:${bar.date}`}
              bar={bar}
              bodyWidth={bodyWidth}
              hollow={hollow}
              animate={revealing}
              delay={bar.slot * step}
            />
          ))
        )}
      </g>

      {/* moving averages */}
      {overlays.ema20 && (
        <path d={model.paths.ema20} fill="none" stroke="rgb(var(--series-ema20))" strokeWidth={1.5} strokeLinejoin="round" data-testid="ema20" />
      )}
      {overlays.ema50 && (
        <path d={model.paths.ema50} fill="none" stroke="rgb(var(--series-ema50))" strokeWidth={1.5} strokeLinejoin="round" data-testid="ema50" />
      )}

      {/* volume pane */}
      <g aria-hidden="true">
        {bars.map((bar) => (
          <rect
            key={bar.date}
            x={bar.x - bodyWidth / 2}
            y={bar.volumeTop}
            width={bodyWidth}
            height={Math.max(0, panes.volume.bottom - bar.volumeTop)}
            fill={bar.up ? UP : DOWN}
            fillOpacity={0.32}
            className={revealing ? "motion-candle" : undefined}
            style={revealing ? { animationDelay: `${bar.slot * step}ms`, transformOrigin: "50% 100%" } : undefined}
          />
        ))}
        <text x={plotLeft + 2} y={panes.volume.top + 9} className="font-mono" fontSize={9} fill={AXIS_TEXT} letterSpacing="0.1em">
          VOL
        </text>
      </g>

      {/* RSI pane */}
      {panes.rsi && model.yRsi && (
        <RsiPane model={model} />
      )}

      {/* price axis */}
      <g className="tabular font-mono" fontSize={10} fill={AXIS_TEXT}>
        {model.priceTicks.map((tick) => (
          <text key={tick} x={plotRight + 8} y={yPrice(tick) + 3.5}>
            {formatPrice(tick, model.priceTickDigits)}
          </text>
        ))}
      </g>

      {/* last price tag: a label set inside a filled mark picks ink by luminance */}
      {last && (
        <g>
          <line
            x1={plotLeft}
            x2={plotRight}
            y1={yPrice(last.close)}
            y2={yPrice(last.close)}
            stroke={lastUp ? UP : DOWN}
            strokeOpacity={0.35}
            shapeRendering="crispEdges"
          />
          <rect x={plotRight + 2} y={yPrice(last.close) - 8} width={model.width - plotRight - 4} height={16} rx={3} fill={lastUp ? UP : DOWN} />
          <text x={plotRight + 7} y={yPrice(last.close) + 3.5} className="tabular font-mono" fontSize={10} fontWeight={600} fill="#06080A">
            {formatPrice(last.close)}
          </text>
        </g>
      )}

      {/* date axis */}
      <g className="font-mono" fontSize={10} fill={AXIS_TEXT}>
        {model.dateTicks.map((tick) => (
          <text key={`${tick.x}-${tick.label}`} x={tick.x} y={model.height - 6} textAnchor={tick.anchor}>
            {tick.label}
          </text>
        ))}
      </g>
    </g>
  );
});

function CandleMark({
  bar,
  bodyWidth,
  hollow,
  animate,
  delay,
}: {
  bar: Bar;
  bodyWidth: number;
  hollow: boolean;
  animate: boolean;
  delay: number;
}) {
  const color = bar.up ? UP : DOWN;
  const isHollow = hollow && bar.up;
  return (
    <g
      data-direction={bar.up ? "up" : "down"}
      data-testid="candle"
      className={animate ? "motion-candle" : undefined}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      <line x1={bar.x} x2={bar.x} y1={bar.wickTop} y2={bar.wickBottom} stroke={color} strokeWidth={1} shapeRendering="crispEdges" />
      <rect
        x={bar.x - bodyWidth / 2}
        y={bar.bodyTop}
        width={bodyWidth}
        height={bar.bodyHeight}
        fill={isHollow ? "rgb(var(--color-card))" : color}
        stroke={color}
        strokeWidth={isHollow ? 1 : 0}
        shapeRendering="crispEdges"
        data-fill={isHollow ? "hollow" : "solid"}
      />
    </g>
  );
}

function RsiPane({ model }: { model: ChartModel }) {
  const pane = model.panes.rsi!;
  const y = model.yRsi!;
  const path = model.bars.reduce((d, bar) => {
    if (bar.rsi == null) return d;
    return `${d}${d ? "L" : "M"}${bar.x.toFixed(1)},${y(bar.rsi).toFixed(1)}`;
  }, "");

  return (
    <g aria-hidden="true">
      <rect x={model.plotLeft} y={y(70)} width={model.plotRight - model.plotLeft} height={y(30) - y(70)} fill="rgb(var(--color-text-primary) / 0.025)" />
      {[70, 30].map((level) => (
        <g key={level}>
          <line x1={model.plotLeft} x2={model.plotRight} y1={y(level)} y2={y(level)} stroke={GRID} shapeRendering="crispEdges" />
          <text x={model.plotRight + 8} y={y(level) + 3.5} className="tabular font-mono" fontSize={10} fill={AXIS_TEXT}>
            {level}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="rgb(var(--color-text-secondary))" strokeWidth={1.25} strokeLinejoin="round" data-testid="rsi-line" />
      <text x={model.plotLeft + 2} y={pane.top + 9} className="font-mono" fontSize={9} fill={AXIS_TEXT} letterSpacing="0.1em">
        RSI 14
      </text>
    </g>
  );
}

function ForecastLayer({
  model,
  horizon,
  delayed,
  lastClose,
}: {
  model: ChartModel;
  horizon: string;
  delayed: boolean;
  lastClose: number;
}) {
  const f = model.forecast!;
  const change = f.target.price / lastClose - 1;
  // keep the target label inside the plot when the target sits at the edge
  const labelX = Math.min(f.target.x - 6, model.plotRight - 6);

  return (
    <g
      className="motion-reveal"
      style={delayed ? { animationDelay: "220ms" } : undefined}
      data-testid="forecast-layer"
      data-horizon={horizon}
    >
      <path d={f.band} fill={FORECAST} fillOpacity={0.12} data-testid="forecast-band" />
      <path d={f.upperEdge} fill="none" stroke={FORECAST} strokeOpacity={0.4} strokeWidth={1} />
      <path d={f.lowerEdge} fill="none" stroke={FORECAST} strokeOpacity={0.4} strokeWidth={1} />
      <path d={f.line} fill="none" stroke={FORECAST} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" data-testid="forecast-line" />
      <circle cx={f.target.x} cy={f.target.y} r={4} fill={FORECAST} stroke="rgb(var(--color-card))" strokeWidth={2} />
      <text x={labelX} y={f.target.y - 10} textAnchor="end" className="tabular font-mono" fontSize={10}>
        <tspan fill="rgb(var(--color-text-primary))">{formatPrice(f.target.price)}</tspan>
        <tspan dx={6} fill={change >= 0 ? UP : DOWN}>
          {change >= 0 ? "▲" : "▼"} {formatPercent(change)}
        </tspan>
      </text>
    </g>
  );
}

function Crosshair({ model, hover }: { model: ChartModel; hover: Hover }) {
  const x = model.slotX(hover.slot);
  const bottom = (model.panes.rsi ?? model.panes.volume).bottom;
  const { price } = model.panes;
  const showHorizontal = hover.y != null && hover.y >= price.top && hover.y <= price.bottom;
  const priceAtPointer = showHorizontal ? model.yPrice.invert(hover.y!) : null;

  return (
    <g pointerEvents="none" data-testid="crosshair">
      <line x1={x} x2={x} y1={price.top} y2={bottom} stroke="rgb(var(--color-text-secondary) / 0.45)" shapeRendering="crispEdges" />
      {showHorizontal && (
        <>
          <line
            x1={model.plotLeft}
            x2={model.plotRight}
            y1={hover.y!}
            y2={hover.y!}
            stroke="rgb(var(--color-text-secondary) / 0.45)"
            shapeRendering="crispEdges"
          />
          <rect x={model.plotRight + 2} y={hover.y! - 8} width={model.width - model.plotRight - 4} height={16} rx={3} fill="rgb(var(--color-border-strong))" />
          <text x={model.plotRight + 7} y={hover.y! + 3.5} className="tabular font-mono" fontSize={10} fill="rgb(var(--color-text-primary))">
            {formatPrice(priceAtPointer)}
          </text>
        </>
      )}
      {hover.slot < model.bars.length && (
        <circle
          cx={x}
          cy={model.yPrice(model.bars[hover.slot].close)}
          r={3}
          fill="rgb(var(--color-text-primary))"
          stroke="rgb(var(--color-card))"
          strokeWidth={2}
        />
      )}
    </g>
  );
}
