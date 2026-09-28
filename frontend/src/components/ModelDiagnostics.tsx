import { RefreshCw, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";

import Skeleton from "./Skeleton";
import type { DiagnosticsResponse } from "@/types";

interface ModelDiagnosticsProps {
  diagnostics: DiagnosticsResponse | null;
  loading: boolean;
  onRetrain: () => Promise<void>;
}

export default function ModelDiagnostics({ diagnostics, loading, onRetrain }: ModelDiagnosticsProps) {
  const [retraining, setRetraining] = useState(false);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await onRetrain();
    } finally {
      setRetraining(false);
    }
  };

  const activeModel = diagnostics?.models[0];
  const importances = Object.entries(activeModel?.feature_importances ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="panel-glass flex h-full flex-col p-4 font-mono">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-bull" />
          <h2 className="text-sm font-semibold text-primary">ml/diagnostics</h2>
          {activeModel && (
            <span className="inline-flex items-center gap-1 rounded-md border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan">
              ACTIVE
            </span>
          )}
        </div>
        <button
          onClick={handleRetrain}
          disabled={retraining}
          className="flex items-center gap-1.5 rounded-md border border-slate-border bg-obsidian px-2.5 py-1 text-xs text-bull transition-colors hover:bg-bull/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${retraining ? "animate-spin" : ""}`} />
          {retraining ? "retraining…" : "retrain"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-border bg-obsidian p-3 text-xs leading-relaxed">
        {loading ? (
          <div className="space-y-2" data-testid="diagnostics-skeleton">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !activeModel ? (
          <p className="text-slate-text">$ no active models yet — trigger a retrain to begin.</p>
        ) : (
          <>
            <p className="text-cyan">$ model --status {activeModel.symbol} {activeModel.horizon}</p>
            <p className="text-slate-text">
              version: <span className="text-primary">{activeModel.model_version}</span>
            </p>
            <p className="text-slate-text">
              last trained: <span className="text-primary">{activeModel.trained_at ?? "n/a"}</span>
            </p>
            <p className="text-slate-text">
              rmse: <span className="text-primary">{activeModel.rmse?.toFixed(4) ?? "—"}</span>{" "}
              mape: <span className="text-primary">{activeModel.mape?.toFixed(4) ?? "—"}</span>{" "}
              r²: <span className="text-primary">{activeModel.r2?.toFixed(4) ?? "—"}</span>
            </p>

            <p className="mt-3 text-cyan">$ model --feature-importance</p>
            {importances.length > 0 && (
              <ul className="sr-only">
                {importances.map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.value.toFixed(3)}
                  </li>
                ))}
              </ul>
            )}
            {importances.length > 0 && (
              <div className="mt-1 h-40 w-full" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={importances} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tick={{ fontSize: 10, fill: "#8A99AD" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                      {importances.map((entry, idx) => (
                        <Cell key={entry.name} fill={idx === 0 ? "#00E676" : "#00C853"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <p className="mt-3 text-cyan">$ model --retrain-log --tail 5</p>
            {activeModel.retrain_log.slice(0, 5).map((entry, idx) => (
              <p key={idx} className="text-slate-text">
                [{entry.timestamp}]{" "}
                <span className={entry.promoted ? "text-bull" : "text-slate-text"}>
                  {entry.promoted ? "PROMOTED" : "no-op"}
                </span>{" "}
                {entry.trigger} rmse={entry.rmse?.toFixed(4) ?? "—"} {entry.model_version}
              </p>
            ))}
            {activeModel.retrain_log.length === 0 && (
              <p className="text-slate-text">no retrain events logged yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
