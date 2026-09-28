import { Delta } from "@/components/primitives/Delta";
import type { QuotesState } from "@/hooks/useQuotes";
import { formatPrice } from "@/lib/format";

interface TickerTapeProps {
  symbols: string[];
  quotes: QuotesState;
  onSelect: (symbol: string) => void;
}

const SECONDS_PER_ITEM = 5;

function Items({ symbols, quotes, onSelect, hidden }: TickerTapeProps & { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {symbols.map((symbol) => {
        const quote = quotes.quotes.get(symbol);
        return (
          <li key={symbol}>
            <button
              type="button"
              tabIndex={hidden ? -1 : 0}
              onClick={() => onSelect(symbol)}
              className="inline-flex h-7 items-center gap-2 px-4 font-mono text-2xs hover:bg-surface-raised/60"
            >
              <span className="font-semibold text-ink-2">{symbol}</span>
              <span className="tabular text-ink">{quote ? formatPrice(quote.price) : "—"}</span>
              {quote && <Delta value={quote.change_pct} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A slow marquee of the broad market. The list is rendered twice so the
 * loop is seamless; the copy is hidden from assistive tech and the tab
 * order. Pauses on hover so a moving item can actually be clicked, and sits
 * still under reduced motion. */
export function TickerTape(props: TickerTapeProps) {
  const ready = props.quotes.quotes.size > 0;
  return (
    <nav aria-label="Market tape" className="relative h-7 shrink-0 overflow-hidden border-b border-line/70 bg-well/60">
      <div
        className={`flex w-max ${ready ? "motion-marquee" : ""}`}
        style={{ ["--marquee-duration" as string]: `${props.symbols.length * SECONDS_PER_ITEM}s` }}
      >
        <Items {...props} />
        <Items {...props} hidden />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-canvas to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-canvas to-transparent" />
    </nav>
  );
}
