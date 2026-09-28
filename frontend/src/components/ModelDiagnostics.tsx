import { RefreshCw, TerminalSquare } from "lucide-react";
import { useState } from "react";

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
    .slice(0, 6);

  return (
    <div className="panel flex h-full flex-col p-4 font-mono">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-bull" />
          <h2 className="text-sm font-semibold text-white">ml/diagnostics</h2>
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
          <p className="text-slate-text">$ fetching diagnostics…</p>
        ) : !activeModel ? (
          <p className="text-slate-text">$ no active models yet — trigger a retrain to begin.</p>
        ) : (
          <>
            <p className="text-bull">$ model --status {activeModel.symbol} {activeModel.horizon}</p>
            <p className="text-slate-text">
              version: <span className="text-white">{activeModel.model_version}</span>
            </p>
            <p className="text-slate-text">
              last trained: <span className="text-white">{activeModel.trained_at ?? "n/a"}</span>
            </p>
            <p className="text-slate-text">
              rmse: <span className="text-white">{activeModel.rmse?.toFixed(4) ?? "—"}</span>{" "}
              mape: <span className="text-white">{activeModel.mape?.toFixed(4) ?? "—"}</span>{" "}
              r²: <span className="text-white">{activeModel.r2?.toFixed(4) ?? "—"}</span>
            </p>

            <p className="mt-3 text-bull">$ model --feature-importance</p>
            {importances.map(([name, value]) => (
              <div key={name} className="mt-1 flex items-center gap-2">
                <span className="w-28 shrink-0 text-slate-text">{name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-border">
                  <div
                    className="h-full bg-bull-gradient"
                    style={{ width: `${Math.min(100, value * 500)}%` }}
                  />
                </div>
                <span className="w-14 text-right text-white">{value.toFixed(3)}</span>
              </div>
            ))}

            <p className="mt-3 text-bull">$ model --retrain-log --tail 5</p>
            {activeModel.retrain_log.slice(0, 5).map((entry, idx) => (
              <p key={idx} className="text-slate-text">
                [{entry.timestamp}]{" "}
                <span className={entry.promoted ? "text-bull" : "text-slate-text"}>
                  {entry.promoted ? "PROMOTED" : "no-op"}
                </span>{" "}
                {entry.trigger} rmse={entry.rmse.toFixed(4)} v{entry.model_version}
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
