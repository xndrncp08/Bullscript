import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { searchTickers, type TickerSuggestion } from "@/data/tickers";

interface TickerSearchProps {
  value: string;
  onSubmit: (symbol: string) => void;
}

export default function TickerSearch({ value, onSubmit }: TickerSearchProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLFormElement>(null);

  const suggestions: TickerSuggestion[] = searchTickers(draft);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commit = (symbol: string) => {
    if (!symbol.trim()) return;
    onSubmit(symbol.trim().toUpperCase());
    setOpen(false);
  };

  return (
    <form
      ref={containerRef}
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        commit(suggestions[highlighted]?.symbol ?? draft);
      }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-slate-border bg-slate-card px-3 py-1.5 transition-colors focus-within:border-bull/50">
        <Search className="h-4 w-4 text-slate-text" />
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search ticker (e.g. AAPL)"
          aria-label="Search ticker"
          autoComplete="off"
          className="w-44 bg-transparent text-sm text-primary placeholder:text-slate-text focus:outline-none"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-lg border border-slate-border bg-slate-card shadow-xl shadow-black/40"
        >
          {suggestions.map((s, idx) => (
            <li key={s.symbol}>
              <button
                type="button"
                role="option"
                aria-selected={idx === highlighted}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => commit(s.symbol)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  idx === highlighted ? "bg-bull/10 text-bull" : "text-primary hover:bg-obsidian"
                }`}
              >
                <span className="font-mono font-semibold">{s.symbol}</span>
                <span className="truncate pl-3 text-xs text-slate-text">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
