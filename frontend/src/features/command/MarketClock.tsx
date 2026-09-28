import { useEffect, useState } from "react";

import { getMarketSession, type Session } from "@/lib/market";

const TONE: Record<Session, { dot: string; text: string; pulse: boolean }> = {
  open: { dot: "bg-up", text: "text-ink", pulse: true },
  pre: { dot: "bg-warn", text: "text-ink-2", pulse: false },
  after: { dot: "bg-warn", text: "text-ink-2", pulse: false },
  closed: { dot: "bg-ink-3", text: "text-ink-3", pulse: false },
};

/** Ticks once a second on its own, so the rest of the command bar doesn't. */
export function MarketClock() {
  const [session, setSession] = useState(() => getMarketSession());

  useEffect(() => {
    const id = setInterval(() => setSession(getMarketSession()), 1000);
    return () => clearInterval(id);
  }, []);

  const tone = TONE[session.session];
  return (
    <div className="hidden items-center gap-2 font-mono text-2xs md:flex" data-testid="market-clock">
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        {tone.pulse && <span className={`absolute inset-0 rounded-full ${tone.dot} animate-pulse-dot`} />}
        <span className={`relative h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </span>
      <span className={`uppercase tracking-wider ${tone.text}`}>{session.label}</span>
      <span className="tabular text-ink-3">{session.time} ET</span>
    </div>
  );
}
