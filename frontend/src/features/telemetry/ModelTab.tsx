import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import type { RetrainState } from "@/hooks/useRetrain";
import type { Resource } from "@/hooks/useTickerData";
import { formatClockTime, formatDuration, formatNumber, formatPercent, formatRelativeTime } from "@/lib/format";
import type { DiagnosticsResponse, ModelDiagnostics, RetrainLogEntry } from "@/types";

import { featureLabel, TRIGGER_LABELS } from "./features";

interface ModelTabProps {
  symbol: string;
  horizon: string;
  diagnostics: Resource<DiagnosticsResponse>;
  retrain: RetrainState;
  onRetrain: () => void;
}

type Status = { label: string; tone: string; dot: string };

function statusOf(model: ModelDiagnostics): Status {
  if (!model.compatible) return { label: "LEGACY", tone: "text-warn", dot: "bg-warn" };
  if (model.last_check?.drift_status === "drift") return { label: "DRIFT", tone: "text-warn", dot: "bg-warn" };
  return { label: "ACTIVE", tone: "text-accent", dot: "bg-accent" };
}

function Metric({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className={`tabular ${tone}`}>{value}</dd>
    </div>
  );
}

/** Share of recent inputs outside the training range, on a scale that puts
 * the drift threshold at the midpoint. */
function RangeMeter({ share, threshold }: { share: number; threshold: number }) {
  const max = threshold * 2;
  const fill = Math.min(1, share / max);
  const over = share > threshold;
  return (
    <div
      className="relative h-1.5 w-full rounded-full bg-line/70"
      role="img"
      aria-label={`${formatPercent(share, { digits: 1, signed: false })} of recent inputs outside the training range; drift threshold ${formatPercent(threshold, { digits: 0, signed: false })}`}
    >
      <span
        className={`absolute inset-y-0 left-0 origin-left rounded-full ${over ? "bg-warn" : "bg-accent/70"}`}
        style={{ width: "100%", transform: `scaleX(${fill})`, transition: "transform 300ms var(--ease-out)" }}
      />
      <span className="absolute inset-y-[-3px] w-px bg-ink-2" style={{ left: "50%" }} title="drift threshold" />
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular">{formatDuration(now - since)}</span>;
}

function logLine(entry: RetrainLogEntry) {
  return {
    key: `${entry.timestamp}-${entry.horizon}-${entry.model_version}-${entry.trigger}`,
    time: formatClockTime(entry.timestamp),
    horizon: entry.horizon,
    version: entry.model_version,
    promoted: entry.promoted,
    trigger: TRIGGER_LABELS[entry.trigger] ?? entry.trigger,
    skill: entry.skill,
    ood: entry.ood,
  };
}

export function ModelTab({ symbol, horizon, diagnostics, retrain, onRetrain }: ModelTabProps) {
  const data = diagnostics.symbol === symbol ? diagnostics.data : null;
  const model = data?.models.find((m) => m.horizon === horizon) ?? null;
  const threshold = data?.drift_ood_threshold ?? 0.1;
  const running = retrain.status === "running" && retrain.symbol === symbol;
  const finished = retrain.symbol === symbol && (retrain.status === "success" || retrain.status === "error");

  const importances = model
    ? Object.entries(model.feature_importances)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    : [];
  const maxImportance = importances[0]?.[1] ?? 1;

  const history = (data?.models ?? [])
    .flatMap((m) => m.retrain_log)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 14)
    .map(logLine);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-px bg-line/40 md:grid-cols-[1.1fr_1fr_1.35fr]">
      {/* model card */}
      <section aria-label="Model health" className="min-h-0 overflow-y-auto bg-surface/95 p-3">
        {!model ? (
          <p className="font-mono text-2xs text-ink-3">
            {diagnostics.status === "loading" || diagnostics.status === "idle"
              ? "> reading model registry…"
              : `> no ${horizon} model for ${symbol} yet — it trains on first forecast.`}
          </p>
        ) : (
          <div className="space-y-3 font-mono text-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink">
                {model.symbol} · {model.horizon.toUpperCase()} · {model.model_version}
              </span>
              {(() => {
                const status = statusOf(model);
                return (
                  <span className={`inline-flex items-center gap-1 rounded border border-line px-1.5 py-px ${status.tone}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                    {status.label}
                  </span>
                );
              })()}
            </div>
            <p className="text-ink-3">
              trained {formatRelativeTime(model.trained_at)} · fit on {model.fit_samples || model.train_samples} bars
              {model.trees ? ` · ${model.trees} trees` : ""} · scored on {model.holdout_samples} holdout bars
            </p>
            <dl className="grid grid-cols-4 gap-x-3 gap-y-2">
              <Metric label="SKILL" value={formatPercent(model.skill, { digits: 1 })} tone={model.skill != null && model.skill < 0 ? "text-warn" : "text-ink"} />
              <Metric label="HIT" value={formatPercent(model.hit_rate, { digits: 0, signed: false })} />
              <Metric label="WEIGHT" value={model.shrinkage == null ? "—" : model.shrinkage.toFixed(2)} />
              <Metric label="σ RESID" value={formatPercent(model.residual_std, { digits: 1, signed: false })} />
              <Metric label="RMSE" value={formatNumber(model.rmse)} />
              <Metric label="NAIVE" value={formatNumber(model.naive_rmse)} />
              <Metric label="MAPE" value={formatPercent(model.mape, { digits: 1, signed: false })} />
              <Metric label="R² PX" value={formatNumber(model.r2, 3)} />
            </dl>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <abbr
                  title="Share of recent feature values outside the range the model was fit on. Trees can't extrapolate, so this is when forecasts stop being trustworthy."
                  className="cursor-help text-ink-3 no-underline"
                >
                  INPUTS OUT OF RANGE
                </abbr>
                <span className="tabular text-ink">
                  {formatPercent(model.last_check?.ood, { digits: 1, signed: false })}
                  <span className="text-ink-3"> / {formatPercent(threshold, { digits: 0, signed: false })}</span>
                </span>
              </div>
              {model.last_check?.ood != null && <RangeMeter share={model.last_check.ood} threshold={threshold} />}
              <p className="text-ink-3" data-testid="live-monitor">
                {model.last_check?.live_skill != null
                  ? `live · ${model.last_check.live_samples} unseen bars · skill ${formatPercent(model.last_check.live_skill, { digits: 1 })} · hit ${formatPercent(model.last_check.live_hit_rate, { digits: 0, signed: false })}`
                  : "live · waiting for 20 bars the model hasn't seen"}
              </p>
              <p className="text-ink-3">
                {model.last_check
                  ? `last check ${formatRelativeTime(model.last_check.timestamp)} · ${model.last_check.drift_status} · ${model.last_check.action.replace("_", " ")}`
                  : "not checked since training"}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* feature importance */}
      <section aria-label="Feature importance" className="min-h-0 overflow-y-auto bg-surface/95 p-3">
        <p className="label-caps mb-2">Feature importance · gain</p>
        {importances.length === 0 ? (
          <p className="font-mono text-2xs text-ink-3">—</p>
        ) : (
          <ol className="space-y-1.5">
            {importances.map(([name, value]) => (
              <li key={name} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 font-mono text-2xs">
                <span className="truncate text-ink-2">{featureLabel(name)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line/50">
                  <span
                    className="block h-full origin-left rounded-full bg-accent/70"
                    style={{ transform: `scaleX(${value / maxImportance})`, transition: "transform 260ms var(--ease-out)" }}
                  />
                </span>
                <span className="tabular text-right text-ink-3">{(value * 100).toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* retrain console */}
      <section aria-label="Retrain console" className="flex min-h-0 flex-col bg-well">
        <div className="flex items-center justify-between border-b border-line/60 px-3 py-1.5">
          <code className="truncate font-mono text-2xs text-ink-3">
            <span className="text-accent">&gt;_</span> bullscript retrain --symbol {symbol}
          </code>
          <button
            type="button"
            onClick={onRetrain}
            disabled={running}
            className="press inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-2xs text-brand hover:border-brand/40 hover:bg-brand/10 disabled:cursor-progress disabled:opacity-60"
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            {running ? "running" : "run retrain"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-2xs leading-5" role="log" aria-label="Retrain log">
          {running && retrain.startedAt && (
            <div className="motion-fade-up text-ink-2">
              <p>
                <span className="text-accent">$</span> retrain {symbol} --horizons 5d,14d,30d
              </p>
              <p className="text-ink-3">
                &nbsp;&nbsp;fetch 3y bars → purged split → early-stop → calibrate →{" "}
                <span className="text-accent">
                  <Elapsed since={retrain.startedAt} />
                  <span className="motion-caret">▍</span>
                </span>
              </p>
            </div>
          )}
          {finished && retrain.status === "error" && (
            <p className="motion-fade-up text-down">✗ retrain failed: {retrain.error?.message}</p>
          )}
          {finished && retrain.status === "success" && retrain.response && (
            <div className="mb-1 border-b border-line/40 pb-1">
              <p className="text-ink-2">
                <span className="text-accent">$</span> retrain {symbol} · done in{" "}
                {formatDuration((retrain.finishedAt ?? 0) - (retrain.startedAt ?? 0))}
              </p>
              {Object.entries(retrain.response.results).map(([h, result], index) => (
                <p key={h} className="motion-fade-up text-ink-2" style={{ animationDelay: `${index * 60}ms` }}>
                  &nbsp;&nbsp;{h.padEnd(4, " ")} {result.version.padEnd(4, " ")}{" "}
                  <span className={result.promoted ? "text-brand" : "text-ink-3"}>{result.promoted ? "PROMOTED" : "KEPT    "}</span>{" "}
                  skill {formatPercent(result.metrics.skill, { digits: 1 })} · hit{" "}
                  {formatPercent(result.metrics.hit_rate, { digits: 0, signed: false })}
                </p>
              ))}
            </div>
          )}
          {history.length === 0 && !running && <p className="text-ink-3">no retrain events for {symbol} yet</p>}
          {history.map((line) => (
            <p key={line.key} className="whitespace-nowrap text-ink-3">
              [{line.time}] <span className="text-ink-2">{line.horizon.padEnd(3, " ")}</span> {line.version}{" "}
              <span className={line.promoted ? "text-brand" : "text-ink-3"}>{line.promoted ? "PROMOTED" : "no-op"}</span>{" "}
              {line.trigger}
              {line.skill != null && ` · skill ${formatPercent(line.skill, { digits: 1 })}`}
              {line.ood != null && ` · ood ${formatPercent(line.ood, { digits: 1, signed: false })}`}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
