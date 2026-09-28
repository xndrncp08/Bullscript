import { Activity, ChartCandlestick, Contrast, Moon, RotateCw, Star, Sun } from "lucide-react";
import { AnimatePresence, MotionConfig, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

import ErrorBoundary from "@/components/ErrorBoundary";
import { PriceChart } from "@/features/chart/PriceChart";
import type { ChartMode, Overlays } from "@/features/chart/model";
import { CommandBar } from "@/features/command/CommandBar";
import { CommandPalette, type PaletteAction } from "@/features/command/CommandPalette";
import { ForecastPanel } from "@/features/intel/ForecastPanel";
import { SentimentPanel } from "@/features/intel/SentimentPanel";
import { InstrumentHeader } from "@/features/market/InstrumentHeader";
import { TickerTape } from "@/features/market/TickerTape";
import { Watchlist } from "@/features/market/Watchlist";
import { TelemetryDock } from "@/features/telemetry/TelemetryDock";
import { useHotkey } from "@/hooks/useHotkey";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useQuotes } from "@/hooks/useQuotes";
import { useRetrain } from "@/hooks/useRetrain";
import { useRevealWindow } from "@/hooks/useRevealWindow";
import { useTheme } from "@/hooks/useTheme";
import { useTickerData } from "@/hooks/useTickerData";
import { RANGES, type RangeKey } from "@/lib/chart-math";
import { directionOf, formatPercent, formatPrice, type Direction } from "@/lib/format";
import { readSessionFlag, writeSessionFlag } from "@/lib/storage";
import { DEFAULT_WATCHLIST, isValidSymbol, normalizeSymbol, TAPE_SYMBOLS } from "@/lib/symbols";
import type { RetrainResponse } from "@/types";

import { AmbientBackdrop } from "./AmbientBackdrop";
import { BootSequence } from "./BootSequence";

export const BOOT_FLAG = "bullscript-booted";
const MIN_BOOT_MS = 900;
const MAX_BOOT_MS = 3500;
const MAX_WATCHLIST = 12;
const DEFAULT_HORIZONS = ["5d", "14d", "30d"];

const isString = (v: unknown): v is string => typeof v === "string";
const isSymbol = (v: unknown): v is string => isString(v) && isValidSymbol(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isSymbol);
const isRange = (v: unknown): v is RangeKey => RANGES.some((r) => r.key === v);
const isMode = (v: unknown): v is ChartMode => v === "candles" || v === "line" || v === "table";
const isOverlays = (v: unknown): v is Overlays =>
  typeof v === "object" && v !== null && ["ema20", "ema50", "bollinger"].every((k) => typeof (v as Record<string, unknown>)[k] === "boolean");

export default function App() {
  const [symbol, setSymbol] = usePersistentState("bullscript-symbol", "AAPL", isSymbol);
  const [horizon, setHorizon] = usePersistentState("bullscript-horizon", "14d", isString);
  const [range, setRange] = usePersistentState<RangeKey>("bullscript-range", "3M", isRange);
  const [mode, setMode] = usePersistentState<ChartMode>("bullscript-chart-mode", "candles", isMode);
  const [overlays, setOverlays] = usePersistentState<Overlays>(
    "bullscript-overlays",
    { ema20: true, ema50: true, bollinger: false },
    isOverlays
  );
  const [watchlist, setWatchlist] = usePersistentState<string[]>("bullscript-watchlist", DEFAULT_WATCHLIST, isStringArray);
  const [recents, setRecents] = usePersistentState<string[]>("bullscript-recents", [], isStringArray);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, palette, toggleTheme, togglePalette } = useTheme();
  const reduceMotion = useReducedMotion();

  const data = useTickerData(symbol);
  const { reloadModel } = data;

  const quoteSymbols = useMemo(() => [...new Set([symbol, ...watchlist, ...TAPE_SYMBOLS])], [symbol, watchlist]);
  const quotes = useQuotes(quoteSymbols);

  const onRetrainComplete = useCallback(
    (response: RetrainResponse) => {
      reloadModel();
      const promoted = Object.values(response.results).filter((r) => r.promoted).length;
      toast.success(`Retrained ${response.symbol}`, {
        description: `${promoted} of ${Object.keys(response.results).length} horizons promoted a new model.`,
      });
    },
    [reloadModel]
  );
  const retrain = useRetrain(onRetrainComplete);

  useEffect(() => {
    if (retrain.state.status === "error" && retrain.state.error) {
      toast.error("Retrain failed", { description: retrain.state.error.message, id: "retrain-error" });
    }
  }, [retrain.state.status, retrain.state.error]);

  // --- symbol selection, with a way back from symbols Yahoo doesn't know ---
  const lastGoodSymbol = useRef(symbol);

  const selectSymbol = useCallback(
    (next: string) => {
      const normalized = normalizeSymbol(next);
      if (!isValidSymbol(normalized)) return;
      setSymbol(normalized);
      setRecents((prev) => [normalized, ...prev.filter((s) => s !== normalized)].slice(0, 8));
    },
    [setSymbol, setRecents]
  );

  useEffect(() => {
    const { chart } = data;
    if (chart.status === "success" && chart.symbol === symbol) {
      lastGoodSymbol.current = symbol;
      return;
    }
    if (chart.status !== "error" || !chart.error) return;

    const error = chart.error;
    if (error.isNotFound && lastGoodSymbol.current !== symbol) {
      toast.error(`No market data for ${symbol}`, {
        id: `not-found-${symbol}`,
        description: "Yahoo Finance doesn't recognise that symbol.",
      });
      setRecents((prev) => prev.filter((s) => s !== symbol));
      setSymbol(lastGoodSymbol.current);
    } else if (error.isOffline) {
      toast.error("BullScript API unreachable", { id: "offline", description: "Start the backend on port 8000, then retry." });
    } else if (error.isRateLimited) {
      toast.warning("Slow down", { id: "rate-limited", description: error.message });
    } else {
      toast.error(`Couldn't load ${symbol}`, { id: `chart-error-${symbol}`, description: error.message });
    }
  }, [data.chart, symbol, setSymbol, setRecents]);

  // --- watchlist ---
  const watched = watchlist.includes(symbol);
  const toggleWatch = useCallback(() => {
    setWatchlist((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= MAX_WATCHLIST) {
        toast.warning("Watchlist is full", { description: `Remove a symbol first — the limit is ${MAX_WATCHLIST}.` });
        return prev;
      }
      return [...prev, symbol];
    });
  }, [setWatchlist, symbol]);

  // --- keyboard ---
  useHotkey("mod+k", () => setPaletteOpen((open) => !open));
  useHotkey("/", () => setPaletteOpen(true));

  // --- boot (first visit per session) ---
  const [booting, setBooting] = useState(() => !readSessionFlag(BOOT_FLAG));
  const bootStartedAt = useRef(Date.now());
  const chartSettled = data.chart.status === "success" || data.chart.status === "error";
  useEffect(() => {
    if (!booting) return;
    const elapsed = Date.now() - bootStartedAt.current;
    const wait = chartSettled ? Math.max(0, (reduceMotion ? 0 : MIN_BOOT_MS) - elapsed) : Math.max(0, MAX_BOOT_MS - elapsed);
    const timer = setTimeout(() => {
      setBooting(false);
      writeSessionFlag(BOOT_FLAG);
    }, wait);
    return () => clearTimeout(timer);
  }, [booting, chartSettled, reduceMotion]);

  const entering = useRevealWindow(booting ? null : "workspace", 900);

  // --- derived ---
  const candles = data.chart.symbol === symbol ? data.chart.data?.candles ?? [] : [];
  const lastClose = candles.length >= 2 ? candles[candles.length - 1].close : null;
  const dayChange = lastClose != null ? lastClose / candles[candles.length - 2].close - 1 : null;
  const regime: Direction = directionOf(dayChange);

  const horizonKey =
    data.prediction.symbol === symbol && data.prediction.data
      ? data.prediction.data.horizons.map((h) => h.horizon).join(",")
      : DEFAULT_HORIZONS.join(",");
  const horizons = useMemo(() => horizonKey.split(","), [horizonKey]);

  useEffect(() => {
    document.title =
      lastClose != null ? `${symbol} ${formatPrice(lastClose)} ${formatPercent(dayChange)} · BullScript` : `${symbol} · BullScript`;
  }, [symbol, lastClose, dayChange]);

  const actions: PaletteAction[] = useMemo(
    () => [
      {
        id: "retrain",
        label: `Retrain forecast models for ${symbol}`,
        keywords: "train model ml refresh",
        icon: <RotateCw className="h-3.5 w-3.5" />,
        run: () => void retrain.run(symbol),
      },
      ...horizons.map((h) => ({
        id: `horizon-${h}`,
        label: `Forecast horizon · ${h.toUpperCase()}`,
        keywords: "horizon forecast days",
        hint: h === horizon ? "current" : undefined,
        icon: <Activity className="h-3.5 w-3.5" />,
        run: () => setHorizon(h),
      })),
      ...RANGES.map((r) => ({
        id: `range-${r.key}`,
        label: `Chart range · ${r.label}`,
        keywords: "range period zoom history",
        hint: r.key === range ? "current" : undefined,
        icon: <ChartCandlestick className="h-3.5 w-3.5" />,
        run: () => setRange(r.key),
      })),
      ...(["candles", "line", "table"] as const).map((m) => ({
        id: `mode-${m}`,
        label: `Chart type · ${m[0].toUpperCase()}${m.slice(1)}`,
        keywords: "chart view mode",
        hint: m === mode ? "current" : undefined,
        icon: <ChartCandlestick className="h-3.5 w-3.5" />,
        run: () => setMode(m),
      })),
      {
        id: "watch",
        label: watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`,
        keywords: "watchlist star favorite",
        icon: <Star className="h-3.5 w-3.5" />,
        run: toggleWatch,
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        keywords: "theme appearance dark light",
        icon: theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />,
        run: toggleTheme,
      },
      {
        id: "palette",
        label: palette === "cvd" ? "Use classic red/green market colors" : "Use colorblind-safe market colors",
        keywords: "accessibility color blind cvd deuteranopia protanopia blue orange",
        icon: <Contrast className="h-3.5 w-3.5" />,
        run: togglePalette,
      },
    ],
    [
      symbol,
      horizons,
      horizon,
      range,
      mode,
      watched,
      theme,
      palette,
      toggleWatch,
      toggleTheme,
      togglePalette,
      retrain.run,
      setHorizon,
      setRange,
      setMode,
    ]
  );

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <div className="relative isolate flex min-h-dvh flex-col [@media(min-width:1024px)_and_(min-height:760px)]:h-dvh [@media(min-width:1024px)_and_(min-height:760px)]:overflow-hidden">
          <AmbientBackdrop regime={regime} />
          <CommandBar
            symbol={symbol}
            horizon={horizon}
            prediction={data.prediction}
            diagnostics={data.diagnostics}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenPalette={() => setPaletteOpen(true)}
            showEmblem={!booting}
          />
          <TickerTape symbols={TAPE_SYMBOLS} quotes={quotes} onSelect={selectSymbol} />

          <main
            className={`grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[228px_minmax(0,1fr)_336px] lg:grid-rows-[minmax(470px,1fr)_minmax(220px,32%)] ${
              entering ? "enter-stagger" : ""
            }`}
          >
            <Watchlist
              className="order-4 max-h-96 lg:order-none lg:max-h-none"
              symbols={watchlist}
              active={symbol}
              quotes={quotes}
              onSelect={selectSymbol}
              onRemove={(s) => setWatchlist((prev) => prev.filter((x) => x !== s))}
            />

            <div className="order-1 flex min-h-0 flex-col gap-2 lg:order-none">
              <InstrumentHeader
                symbol={symbol}
                chart={data.chart}
                quote={quotes.quotes.get(symbol)}
                watched={watched}
                onToggleWatch={toggleWatch}
              />
              <div className="h-[560px] min-h-0 lg:h-auto lg:flex-1">
                <PriceChart
                  symbol={symbol}
                  chart={data.chart}
                  prediction={data.prediction}
                  horizon={horizon}
                  range={range}
                  onRangeChange={setRange}
                  mode={mode}
                  onModeChange={setMode}
                  overlays={overlays}
                  onOverlaysChange={setOverlays}
                  onRetry={data.reload}
                  holdReveal={booting}
                />
              </div>
            </div>

            <div className="order-2 flex min-h-0 flex-col gap-2 lg:order-none lg:overflow-y-auto">
              <ForecastPanel className="shrink-0" symbol={symbol} prediction={data.prediction} horizon={horizon} onHorizonChange={setHorizon} />
              <SentimentPanel className="h-[520px] shrink-0 lg:h-auto lg:min-h-[300px] lg:flex-1" symbol={symbol} sentiment={data.sentiment} />
            </div>

            <TelemetryDock
              className="order-3 h-[440px] lg:order-none lg:col-span-3 lg:h-auto"
              symbol={symbol}
              horizon={horizon}
              horizons={horizons}
              onHorizonChange={setHorizon}
              diagnostics={data.diagnostics}
              retrain={retrain.state}
              onRetrain={() => void retrain.run(symbol)}
            />
          </main>
        </div>

        <Toaster
          theme={theme}
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-lg !border-line !bg-surface !font-sans !text-ink",
              description: "!text-ink-2",
            },
          }}
        />

        {paletteOpen && (
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            onSelectSymbol={selectSymbol}
            actions={actions}
            recents={recents}
            currentSymbol={symbol}
            quotes={quotes}
          />
        )}

        <AnimatePresence>{booting && <BootSequence symbol={symbol} />}</AnimatePresence>
      </ErrorBoundary>
    </MotionConfig>
  );
}
