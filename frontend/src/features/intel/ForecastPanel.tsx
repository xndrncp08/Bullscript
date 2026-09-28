import { motion } from "motion/react";
import { useRef, type KeyboardEvent } from "react";

import { DataStreamLoader } from "@/components/primitives/DataStreamLoader";
import { Delta } from "@/components/primitives/Delta";
import { Panel } from "@/components/primitives/Panel";
import type { Resource } from "@/hooks/useTickerData";
import { formatPercent, formatPrice } from "@/lib/format";
import { springs } from "@/motion/tokens";
import type { HorizonForecast, PredictionResponse } from "@/types";

/** Below this calibrated weight the model is mostly withholding its call. */
export const LOW_SIGNAL_WEIGHT = 0.2;
const SKILL_SCALE = 0.3;

interface ForecastPanelProps {
  symbol: string;
  prediction: Resource<PredictionResponse>;
  horizon: string;
  onHorizonChange: (horizon: string) => void;
  className?: string;
}

function SkillBar({ skill }: { skill: number }) {
  // diverging around zero: the random-walk baseline
  const clamped = Math.max(-SKILL_SCALE, Math.min(SKILL_SCALE, skill));
  const width = (Math.abs(clamped) / SKILL_SCALE) * 50;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-line/60" aria-hidden="true">
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3" />
      <span
        className={`absolute inset-y-0 rounded-full ${skill >= 0 ? "bg-brand" : "bg-warn"}`}
        style={skill >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </div>
  );
}

const SKILL_EXPLAINER =
  "1 − RMSE / RMSE(random walk), scored on recent history the model never trained on. " +
  "Above 0 beat “price stays put” there; it doesn't guarantee it will again.";

function Summary({ forecast }: { forecast: HorizonForecast }) {
  const lowSignal = forecast.shrinkage != null && forecast.shrinkage < LOW_SIGNAL_WEIGHT;
  const last = forecast.points[forecast.points.length - 1];
  return (
    <div key={forecast.horizon} className="motion-fade-in space-y-2 border-t border-line/60 px-3 py-2.5 font-mono text-2xs">
      <div className="flex items-baseline justify-between">
        <span className="text-ink-3">{Math.round(forecast.interval * 100)}% RANGE</span>
        <span className="tabular text-ink">
          {formatPrice(last.lower_bound)} – {formatPrice(last.upper_bound)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <abbr title={SKILL_EXPLAINER} className="cursor-help text-ink-3 no-underline">
          SKILL VS RW
        </abbr>
        <div className="flex-1">{forecast.skill != null && <SkillBar skill={forecast.skill} />}</div>
        <span className={`tabular ${forecast.skill != null && forecast.skill < 0 ? "text-warn" : "text-ink"}`}>
          {formatPercent(forecast.skill, { digits: 1 })}
        </span>
      </div>
      {lowSignal && (
        <p className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5 font-sans leading-relaxed text-ink-2">
          <span className="font-semibold text-warn">Low signal.</span> Its calls didn't hold up on unseen data, so the model
          withholds most of its {forecast.horizon.toUpperCase()} move.
        </p>
      )}
    </div>
  );
}

export function ForecastPanel({ symbol, prediction, horizon, onHorizonChange, className = "" }: ForecastPanelProps) {
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const data = prediction.symbol === symbol ? prediction.data : null;
  const horizons = data?.horizons ?? [];
  const selected = horizons.find((h) => h.horizon === horizon) ?? null;

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + horizons.length) % horizons.length;
    onHorizonChange(horizons[next].horizon);
    rows.current[next]?.focus();
  };

  return (
    <Panel
      title="Forecast"
      meta={data ? `XGBoost · log-return · ${Math.round((horizons[0]?.interval ?? 0.8) * 100)}% PI` : symbol}
      className={className}
      bodyClassName="overflow-y-auto"
    >
      {!data && prediction.status !== "error" && (
        <DataStreamLoader title={`training ${symbol} models`} lines={[]} />
      )}
      {!data && prediction.status === "error" && (
        <p role="alert" className="p-4 font-mono text-xs text-down">
          &gt;_ {prediction.error?.message ?? "Forecast unavailable"}
        </p>
      )}

      {data && (
        <>
          <div role="radiogroup" aria-label="Forecast horizon" className="p-1">
            {horizons.map((h, index) => {
              const isSelected = h.horizon === horizon;
              const lowSignal = h.shrinkage != null && h.shrinkage < LOW_SIGNAL_WEIGHT;
              return (
                <button
                  key={h.horizon}
                  ref={(el) => {
                    rows.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => onHorizonChange(h.horizon)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className="press relative grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-raised/50"
                >
                  {isSelected && (
                    <motion.span
                      layoutId="forecast-row"
                      transition={springs.indicator}
                      className="absolute inset-0 rounded-md bg-surface-raised ring-1 ring-line"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative font-mono text-xs font-semibold text-ink-2">{h.horizon.toUpperCase()}</span>
                  <span className="relative flex flex-col">
                    <span className="tabular font-mono text-sm text-ink">{formatPrice(h.target_price)}</span>
                    <span className="font-mono text-2xs text-ink-3">
                      hit {formatPercent(h.hit_rate, { digits: 0, signed: false })}
                      {lowSignal && <span className="ml-1.5 text-warn">· low signal</span>}
                    </span>
                  </span>
                  <Delta value={h.expected_return} className="relative font-mono text-xs" />
                </button>
              );
            })}
          </div>
          {selected && <Summary forecast={selected} />}
        </>
      )}
    </Panel>
  );
}
