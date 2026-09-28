import { formatDuration } from "@/lib/format";
import { useTelemetry, type RequestEntry } from "@/lib/telemetry";

const STATUS_TONE: Record<RequestEntry["status"], string> = {
  pending: "text-accent",
  ok: "text-brand",
  error: "text-down",
  aborted: "text-ink-3",
};

function statusText(entry: RequestEntry) {
  if (entry.status === "pending") return "···";
  if (entry.status === "aborted") return "abort";
  if (entry.httpStatus) return String(entry.httpStatus);
  return "net";
}

/** This client's own API traffic, live. */
export function NetworkTab() {
  const entries = useTelemetry();
  const slowest = Math.max(250, ...entries.map((e) => e.durationMs ?? 0));

  if (entries.length === 0) {
    return <p className="p-3 font-mono text-2xs text-ink-3">&gt; no requests yet</p>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="tabular w-full border-collapse font-mono text-2xs">
        <caption className="sr-only">API requests made by this page, newest first</caption>
        <thead className="label-caps sticky top-0 bg-surface">
          <tr>
            <th scope="col" className="px-3 py-1.5 text-left font-medium">Time</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">Request</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Status</th>
            <th scope="col" className="w-1/4 px-2 py-1.5 text-left font-medium">Latency</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Size</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-line/40">
              <td className="px-3 py-1 text-ink-3">{new Date(entry.startedAt).toLocaleTimeString("en-US", { hour12: false })}</td>
              <td className="max-w-0 truncate px-2 py-1 text-ink-2" title={entry.error}>
                <span className="text-ink-3">{entry.method}</span> {entry.path}
              </td>
              <td className={`px-2 py-1 text-right ${STATUS_TONE[entry.status]}`}>{statusText(entry)}</td>
              <td className="px-2 py-1">
                <div className="flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-line/50">
                    <span
                      className={`block h-full origin-left rounded-full ${entry.status === "error" ? "bg-down/70" : "bg-accent/60"}`}
                      style={{ transform: `scaleX(${Math.min(1, (entry.durationMs ?? 0) / slowest)})` }}
                    />
                  </span>
                  <span className="w-12 text-right text-ink-3">{entry.status === "pending" ? "…" : formatDuration(entry.durationMs)}</span>
                </div>
              </td>
              <td className="px-3 py-1 text-right text-ink-3">
                {entry.bytes != null ? `${(entry.bytes / 1024).toFixed(1)}K` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
