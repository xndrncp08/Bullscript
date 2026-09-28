import { Moon, Search, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { Kbd, MOD_KEY } from "@/components/primitives/Kbd";
import type { Resource } from "@/hooks/useTickerData";
import type { Theme } from "@/hooks/useTheme";
import { springs } from "@/motion/tokens";
import type { DiagnosticsResponse, PredictionResponse } from "@/types";

import { MarketClock } from "./MarketClock";

interface CommandBarProps {
  symbol: string;
  horizon: string;
  prediction: Resource<PredictionResponse>;
  diagnostics: Resource<DiagnosticsResponse>;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  /** While the boot sequence owns the emblem, the bar leaves its slot empty
   * so the two can share a layout transition. */
  showEmblem: boolean;
}

export const EMBLEM_LAYOUT_ID = "brand-emblem";

export function BrandEmblem({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`flex items-center justify-center rounded-md bg-brand/15 font-mono font-bold text-brand ${className}`} role="img" aria-label="BullScript logo">
        &gt;_
      </span>
    );
  }
  return (
    <img
      src="/brand/emblem-160.png"
      alt="BullScript logo"
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

type BadgeState = { label: string; detail: string; dot: string; tone: string };

function modelBadge(
  symbol: string,
  horizon: string,
  prediction: Resource<PredictionResponse>,
  diagnostics: Resource<DiagnosticsResponse>
): BadgeState {
  const model =
    diagnostics.symbol === symbol ? diagnostics.data?.models.find((m) => m.horizon === horizon) : undefined;
  const forecast =
    prediction.symbol === symbol ? prediction.data?.horizons.find((h) => h.horizon === horizon) : undefined;
  const version = forecast?.model_version ?? model?.model_version;

  if (prediction.status === "error" && !forecast) {
    return { label: "OFFLINE", detail: "forecast unavailable", dot: "bg-down", tone: "text-down" };
  }
  if (!version) {
    return { label: "TRAINING", detail: horizon.toUpperCase(), dot: "bg-accent animate-pulse-dot", tone: "text-accent" };
  }
  if (model?.last_check?.drift_status === "drift") {
    return { label: "DRIFT", detail: `${version} · ${horizon.toUpperCase()}`, dot: "bg-warn", tone: "text-warn" };
  }
  return { label: "ACTIVE", detail: `${version} · ${horizon.toUpperCase()}`, dot: "bg-accent", tone: "text-accent" };
}

export function CommandBar({
  symbol,
  horizon,
  prediction,
  diagnostics,
  theme,
  onToggleTheme,
  onOpenPalette,
  showEmblem,
}: CommandBarProps) {
  const badge = modelBadge(symbol, horizon, prediction, diagnostics);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-line/70 bg-canvas/80 px-3 backdrop-blur-md sm:gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-10 items-center justify-center">
          {showEmblem && (
            <motion.span layoutId={EMBLEM_LAYOUT_ID} transition={springs.morph} className="block h-8 w-10">
              <BrandEmblem className="h-8 w-10" />
            </motion.span>
          )}
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          <span className="text-ink">Bull</span>
          <span className="text-brand">Script</span>
        </span>
      </div>

      <div className="hidden items-center gap-1 font-mono text-xs lg:flex" aria-label={`Current instrument ${symbol}`} data-testid="prompt">
        <span className="text-accent" aria-hidden="true">
          &gt;_
        </span>
        <span className="text-ink-3">~/markets/</span>
        <span key={symbol} className="motion-crossfade text-ink">
          {symbol}
        </span>
        <span className="motion-caret text-accent" aria-hidden="true">
          ▍
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="press mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-line bg-well/80 px-2.5 text-left text-xs text-ink-3 hover:border-line-strong hover:text-ink-2"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">Search symbols or run a command…</span>
        <span className="hidden items-center gap-1 sm:flex">
          <Kbd>{MOD_KEY}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex items-center gap-3">
        <MarketClock />
        <div
          className="hidden items-center gap-2 rounded-md border border-line bg-well/60 px-2 py-1 font-mono text-2xs sm:flex"
          data-testid="model-badge"
          title="Forecast model for the selected horizon"
        >
          <span className="text-ink-3">ML</span>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
          <span className={badge.tone}>{badge.label}</span>
          <span className="text-ink-3">{badge.detail}</span>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="press flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-3 hover:text-ink"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
