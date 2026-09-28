import { Moon, Sun, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useTheme } from "@/hooks/useTheme";

import TickerSearch from "./TickerSearch";

interface NavbarProps {
  activeSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

const ML_BADGE_VERSION = "v2.4.1";

export default function Navbar({ activeSymbol, onSymbolChange }: NavbarProps) {
  const { isOpen, label } = useMarketStatus();
  const { theme, toggle } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-border bg-obsidian-deep/90 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {logoFailed ? (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md bg-bull-gradient font-mono text-sm font-bold text-obsidian"
            aria-label="BullScript logo"
          >
            B
          </div>
        ) : (
          <img
            src="/brand/emblem-160.png"
            alt="BullScript logo"
            className="h-8 w-10 object-contain"
            onError={() => setLogoFailed(true)}
          />
        )}

        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-primary">Bull</span>
          <span className="text-lg font-bold text-bull">Script</span>
        </div>

        <span className="terminal-badge" data-testid="terminal-badge">
          <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            &gt;_ ML Model: <span className="text-cyan">ACTIVE</span> {ML_BADGE_VERSION}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="hidden items-center gap-1.5 rounded-md border border-slate-border bg-slate-card px-2.5 py-1 text-xs text-slate-text sm:flex"
          data-testid="market-status"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isOpen ? "animate-pulse-dot bg-bull" : "bg-bear"
            }`}
            aria-hidden="true"
          />
          {label}
        </div>

        <TickerSearch value={activeSymbol} onSubmit={onSymbolChange} />

        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-border bg-slate-card text-slate-text transition-colors hover:text-primary"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
