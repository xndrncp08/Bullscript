import type { RequestStatus } from "@/lib/telemetry";

export interface StreamLine {
  label: string;
  status: RequestStatus;
  detail?: string;
}

const STATUS_TEXT: Record<RequestStatus, string> = {
  pending: "…",
  ok: "ok",
  error: "err",
  aborted: "—",
};

const STATUS_TONE: Record<RequestStatus, string> = {
  pending: "text-ink-3",
  ok: "text-brand",
  error: "text-down",
  aborted: "text-ink-3",
};

// Deterministic "random" heights so the bar field looks organic but never
// reflows between renders.
const BARS = Array.from({ length: 28 }, (_, i) => ({
  height: 28 + ((i * 37) % 72),
  delay: (i * 83) % 900,
}));

/** First-load state for data panels: a kinetic bar field over a live log of
 * the requests actually in flight. */
export function DataStreamLoader({ title, lines = [] }: { title: string; lines?: StreamLine[] }) {
  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-40 flex-col items-center justify-center gap-5 p-4">
      <div aria-hidden="true" className="flex h-12 items-end gap-[3px]">
        {BARS.map((bar, i) => (
          <span
            key={i}
            className="motion-stream-bar w-[3px] rounded-[1px] bg-accent/50"
            style={{ height: `${bar.height}%`, animationDelay: `${bar.delay}ms` }}
          />
        ))}
      </div>
      <div className="w-full max-w-xs font-mono text-2xs leading-5">
        <p className="text-accent">
          <span aria-hidden="true">&gt;_ </span>
          {title}
          <span className="motion-caret" aria-hidden="true">
            ▍
          </span>
        </p>
        {lines.map((line) => (
          <p key={line.label} className="motion-fade-up flex items-baseline gap-2 text-ink-2">
            <span className="truncate">{line.label}</span>
            <span className="min-w-4 flex-1 border-b border-dotted border-line-strong" aria-hidden="true" />
            <span className={STATUS_TONE[line.status]}>{STATUS_TEXT[line.status]}</span>
            {line.detail && <span className="text-ink-3">{line.detail}</span>}
          </p>
        ))}
      </div>
    </div>
  );
}
