/** Number and time formatting for the terminal. Signed values use a true
 * minus sign (U+2212) so columns of +/- figures line up. */

const MINUS = "−";

const fixedFormatters = new Map<number, Intl.NumberFormat>();
function fixed(digits: number): Intl.NumberFormat {
  let formatter = fixedFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    fixedFormatters.set(digits, formatter);
  }
  return formatter;
}

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export type Direction = "up" | "down" | "flat";

export function directionOf(value: number | null | undefined): Direction {
  if (value == null || Number.isNaN(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export function priceDigits(price: number): number {
  const magnitude = Math.abs(price);
  if (magnitude > 0 && magnitude < 1) return 4;
  return 2;
}

export function formatPrice(value: number | null | undefined, digits?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return fixed(digits ?? priceDigits(value)).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = fixed(digits).format(Math.abs(value));
  return value < 0 ? `${MINUS}${text}` : text;
}

export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = fixed(digits).format(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `${MINUS}${text}`;
  return text;
}

/** `fraction` is a ratio (0.0153 -> "+1.53%"). */
export function formatPercent(
  fraction: number | null | undefined,
  { digits = 2, signed = true }: { digits?: number; signed?: boolean } = {}
): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  return `${signed ? formatSigned(pct, digits) : formatNumber(pct, digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return compactFormatter.format(value);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse a YYYY-MM-DD market date without the local-timezone shift that
 * `new Date("2026-09-25")` (UTC midnight) introduces west of Greenwich. */
export function parseMarketDate(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

export function formatMarketDate(isoDate: string, { withYear = false } = {}): string {
  const { year, month, day } = parseMarketDate(isoDate);
  const base = `${MONTHS[month - 1]} ${day}`;
  return withYear ? `${base}, ${year}` : base;
}

export function formatMonthYear(isoDate: string): string {
  const { year, month } = parseMarketDate(isoDate);
  return `${MONTHS[month - 1]} '${String(year).slice(2)}`;
}

export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(then);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", { hour12: false });
}
