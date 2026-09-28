import type { StreamLine } from "@/components/primitives/DataStreamLoader";
import { formatDuration } from "@/lib/format";
import type { RequestEntry } from "@/lib/telemetry";

const RESOURCES: { match: (path: string) => boolean; label: string }[] = [
  { match: (p) => p.endsWith("/chart"), label: "daily bars" },
  { match: (p) => p.endsWith("/prediction"), label: "forecast engine" },
  { match: (p) => p.endsWith("/sentiment"), label: "finbert sentiment" },
  { match: (p) => p.includes("/model/diagnostics"), label: "model registry" },
];

function isForSymbol(path: string, symbol: string) {
  const encoded = encodeURIComponent(symbol);
  return path.includes(`/ticker/${encoded}/`) || path.includes(`symbol=${encoded}`);
}

/** The latest request per resource for a symbol, as loader lines. */
export function requestLines(entries: RequestEntry[], symbol: string): StreamLine[] {
  const lines: StreamLine[] = [];
  for (const resource of RESOURCES) {
    // entries are newest-first
    const entry = entries.find((e) => resource.match(e.path) && isForSymbol(e.path, symbol));
    if (!entry) continue;
    lines.push({
      label: resource.label,
      status: entry.status,
      detail: entry.durationMs != null && entry.status !== "pending" ? formatDuration(entry.durationMs) : undefined,
    });
  }
  return lines;
}
