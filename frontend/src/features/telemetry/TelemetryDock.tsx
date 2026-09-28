import { motion } from "motion/react";
import { useId, useState, type KeyboardEvent } from "react";

import { SegmentedControl } from "@/components/primitives/SegmentedControl";
import type { RetrainState } from "@/hooks/useRetrain";
import type { Resource } from "@/hooks/useTickerData";
import { useTelemetry } from "@/lib/telemetry";
import { springs } from "@/motion/tokens";
import type { DiagnosticsResponse } from "@/types";

import { ModelTab } from "./ModelTab";
import { NetworkTab } from "./NetworkTab";

type Tab = "model" | "network";

interface TelemetryDockProps {
  symbol: string;
  horizon: string;
  horizons: string[];
  onHorizonChange: (horizon: string) => void;
  diagnostics: Resource<DiagnosticsResponse>;
  retrain: RetrainState;
  onRetrain: () => void;
  className?: string;
}

export function TelemetryDock({
  symbol,
  horizon,
  horizons,
  onHorizonChange,
  diagnostics,
  retrain,
  onRetrain,
  className = "",
}: TelemetryDockProps) {
  const [tab, setTab] = useState<Tab>("model");
  const baseId = useId();
  const pending = useTelemetry().filter((e) => e.status === "pending").length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "model", label: "Model" },
    { id: "network", label: "Network", badge: pending || undefined },
  ];

  const onTabKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    setTab(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <section aria-label="Telemetry" className={`panel flex min-h-0 flex-col ${className}`}>
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line/70 px-3">
        <span className="label-caps flex items-center gap-1.5 text-ink-2">
          <span className="text-accent" aria-hidden="true">
            &gt;_
          </span>
          Telemetry
        </span>
        <div role="tablist" aria-label="Telemetry views" className="flex items-center gap-1">
          {tabs.map((t, index) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                id={`${baseId}-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={`press relative h-9 px-2 font-mono text-2xs uppercase tracking-wider ${
                  selected ? "text-ink" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {t.label}
                {t.badge != null && <span className="ml-1.5 rounded bg-accent/15 px-1 text-accent">{t.badge}</span>}
                {selected && (
                  <motion.span
                    layoutId={`${baseId}-underline`}
                    transition={springs.indicator}
                    className="absolute inset-x-1 -bottom-px h-px bg-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        {tab === "model" && (
          <div className="ml-auto">
            <SegmentedControl
              label="Model horizon"
              value={horizon}
              onChange={onHorizonChange}
              options={horizons.map((h) => ({ value: h, label: h.toUpperCase() }))}
            />
          </div>
        )}
      </header>

      <div
        id={`${baseId}-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="min-h-0 flex-1 overflow-hidden rounded-b-[10px]"
      >
        {tab === "model" ? (
          <ModelTab symbol={symbol} horizon={horizon} diagnostics={diagnostics} retrain={retrain} onRetrain={onRetrain} />
        ) : (
          <NetworkTab />
        )}
      </div>
    </section>
  );
}
