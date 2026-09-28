import { X } from "lucide-react";
import { motion } from "motion/react";

import { Delta } from "@/components/primitives/Delta";
import { FlashValue } from "@/components/primitives/FlashValue";
import { Panel } from "@/components/primitives/Panel";
import { Sparkline } from "@/components/primitives/Sparkline";
import type { QuotesState } from "@/hooks/useQuotes";
import { directionOf, formatPrice } from "@/lib/format";
import { lookupInstrument } from "@/lib/symbols";
import { springs } from "@/motion/tokens";

interface WatchlistProps {
  symbols: string[];
  active: string;
  quotes: QuotesState;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  className?: string;
}

export function Watchlist({ symbols, active, quotes, onSelect, onRemove, className = "" }: WatchlistProps) {
  return (
    <Panel title="Watchlist" meta={`${symbols.length}`} className={className} bodyClassName="overflow-y-auto">
      <ul className="p-1">
        {symbols.map((symbol) => {
          const quote = quotes.quotes.get(symbol);
          const isActive = symbol === active;
          return (
            <li key={symbol} className="group relative">
              {isActive && (
                <motion.span
                  layoutId="watchlist-active"
                  transition={springs.indicator}
                  className="absolute inset-0 rounded-md bg-surface-raised ring-1 ring-line"
                  aria-hidden="true"
                >
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                </motion.span>
              )}
              <button
                type="button"
                onClick={() => onSelect(symbol)}
                aria-current={isActive ? "true" : undefined}
                className="press relative grid w-full grid-cols-[1fr_auto] items-center gap-x-2 rounded-md px-2.5 py-2 text-left hover:bg-surface-raised/50"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-semibold text-ink">{symbol}</span>
                  <span className="block truncate text-2xs text-ink-3">{lookupInstrument(symbol)?.name ?? "—"}</span>
                </span>
                <span className="flex flex-col items-end">
                  {quote ? (
                    <>
                      <FlashValue value={quote.price} identity={symbol} className="px-0.5">
                        <span className="tabular font-mono text-xs text-ink">{formatPrice(quote.price)}</span>
                      </FlashValue>
                      <Delta value={quote.change_pct} className="font-mono text-2xs" />
                    </>
                  ) : quotes.status === "loading" ? (
                    <span className="skeleton h-7 w-14" aria-hidden="true" />
                  ) : (
                    <span className="font-mono text-2xs text-ink-3">—</span>
                  )}
                </span>
                {quote && (
                  <Sparkline
                    values={quote.sparkline}
                    direction={directionOf(quote.change_pct)}
                    width={180}
                    height={16}
                    className="col-span-2 mt-1.5 h-4 w-full opacity-80"
                  />
                )}
              </button>
              {!isActive && (
                <button
                  type="button"
                  onClick={() => onRemove(symbol)}
                  aria-label={`Remove ${symbol} from watchlist`}
                  className="press absolute right-1 top-1 hidden rounded p-0.5 text-ink-3 hover:text-ink group-focus-within:block group-hover:block"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
