import { CornerDownLeft } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Delta } from "@/components/primitives/Delta";
import { Kbd } from "@/components/primitives/Kbd";
import type { QuotesState } from "@/hooks/useQuotes";
import { formatPrice } from "@/lib/format";
import { isValidSymbol, lookupInstrument, normalizeSymbol, searchInstruments } from "@/lib/symbols";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
  actions: PaletteAction[];
  recents: string[];
  currentSymbol: string;
  quotes: QuotesState;
}

type Item =
  | { type: "symbol"; id: string; symbol: string; name: string; kind: string; group: string }
  | { type: "open"; id: string; symbol: string; group: string }
  | { type: "action"; id: string; action: PaletteAction; group: string };

function buildItems(query: string, actions: PaletteAction[], recents: string[], currentSymbol: string): Item[] {
  const q = query.trim();
  const items: Item[] = [];

  if (!q) {
    for (const symbol of recents.filter((s) => s !== currentSymbol).slice(0, 5)) {
      const instrument = lookupInstrument(symbol);
      items.push({ type: "symbol", id: `sym-${symbol}`, symbol, name: instrument?.name ?? "", kind: instrument?.kind ?? "", group: "Recent" });
    }
  } else {
    const matches = searchInstruments(q, 6);
    for (const m of matches) {
      items.push({ type: "symbol", id: `sym-${m.symbol}`, symbol: m.symbol, name: m.name, kind: m.kind, group: "Symbols" });
    }
    const typed = normalizeSymbol(q);
    if (isValidSymbol(typed) && !matches.some((m) => m.symbol === typed)) {
      items.push({ type: "open", id: `open-${typed}`, symbol: typed, group: "Symbols" });
    }
  }

  // every word of the query must appear somewhere: "range 1y" finds "Chart range · 1Y"
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  for (const action of actions) {
    const haystack = `${action.label} ${action.keywords ?? ""}`.toLowerCase();
    if (tokens.every((token) => haystack.includes(token))) {
      items.push({ type: "action", id: `act-${action.id}`, action, group: "Actions" });
    }
  }
  return items;
}

/**
 * The keyboard front door: jump to any symbol or run any command.
 * Opens and closes instantly - it's summoned many times a day, so any
 * animation here would only be latency.
 */
export function CommandPalette({ onClose, onSelectSymbol, actions, recents, currentSymbol, quotes }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-opt-${index}`;

  const items = useMemo(() => buildItems(query, actions, recents, currentSymbol), [query, actions, recents, currentSymbol]);
  const active = Math.min(activeIndex, Math.max(0, items.length - 1));

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, active]);

  const execute = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.type === "action") item.action.run();
    else onSelectSymbol(item.symbol);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((active + 1) % Math.max(1, items.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((active - 1 + items.length) % Math.max(1, items.length));
        break;
      case "Enter":
        event.preventDefault();
        execute(items[active]);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      case "Tab":
        // the input is the dialog's only tab stop; keep focus inside
        event.preventDefault();
        break;
    }
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="panel w-full max-w-xl overflow-hidden">
        <div className="flex h-12 items-center gap-2 border-b border-line px-3">
          <span className="font-mono text-sm text-accent" aria-hidden="true">
            &gt;_
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items.length ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search symbols or commands"
            placeholder="Search symbols, or type a command…"
            spellCheck={false}
            autoComplete="off"
            className="h-full flex-1 bg-transparent font-mono text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto p-1">
          {items.length === 0 && (
            <li className="px-3 py-6 text-center font-mono text-xs text-ink-3">
              No matches. Symbols look like AAPL, BRK-B or ^VIX.
            </li>
          )}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const selected = index === active;
            const quote = item.type !== "action" ? quotes.quotes.get(item.symbol) : undefined;
            return (
              <li key={item.id} role="presentation">
                {header && (
                  <div role="presentation" className="label-caps px-2.5 pb-1 pt-2">
                    {header}
                  </div>
                )}
                <div
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => index !== active && setActiveIndex(index)}
                  onClick={() => execute(item)}
                  className={`flex h-9 cursor-pointer items-center gap-3 rounded-md px-2.5 text-sm ${
                    selected ? "bg-surface-raised text-ink" : "text-ink-2"
                  }`}
                >
                  {item.type === "symbol" && (
                    <>
                      <span className="w-16 font-mono text-xs font-semibold">{item.symbol}</span>
                      <span className="flex-1 truncate text-xs text-ink-2">{item.name}</span>
                      {quote ? (
                        <span className="flex items-center gap-2 font-mono text-2xs">
                          <span className="tabular text-ink-2">{formatPrice(quote.price)}</span>
                          <Delta value={quote.change_pct} />
                        </span>
                      ) : (
                        <span className="label-caps">{item.kind}</span>
                      )}
                    </>
                  )}
                  {item.type === "open" && (
                    <>
                      <span className="w-16 font-mono text-xs font-semibold">{item.symbol}</span>
                      <span className="flex-1 truncate text-xs text-ink-2">Open {item.symbol}</span>
                    </>
                  )}
                  {item.type === "action" && (
                    <>
                      <span className="flex w-16 justify-center text-ink-3" aria-hidden="true">
                        {item.action.icon}
                      </span>
                      <span className="flex-1 truncate text-xs">{item.action.label}</span>
                      {item.action.hint && <span className="font-mono text-2xs text-ink-3">{item.action.hint}</span>}
                    </>
                  )}
                  {selected && <CornerDownLeft className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center gap-4 border-t border-line px-3 py-2 font-mono text-2xs text-ink-3">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto">
            <span className="text-accent">&gt;_</span> {currentSymbol}
          </span>
        </footer>
      </div>
    </div>
  );
}
