/** US equity session state, computed in America/New_York regardless of the
 * viewer's timezone. Exchange holidays aren't modelled. */

export type Session = "pre" | "open" | "after" | "closed";

export interface MarketSession {
  session: Session;
  label: string;
  /** Wall-clock time in New York, e.g. "15:42:08". */
  time: string;
  /** Calendar date in New York, YYYY-MM-DD - the date a live daily bar carries. */
  date: string;
  weekday: string;
}

const PRE_OPEN = 4 * 60;
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const AFTER_CLOSE = 20 * 60;

const LABELS: Record<Session, string> = {
  pre: "Pre-market",
  open: "Market open",
  after: "After hours",
  closed: "Market closed",
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function getMarketSession(at: Date = new Date()): MarketSession {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  // Some engines render midnight as "24".
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const minutes = hour * 60 + minute;
  const weekday = parts.weekday ?? "Mon";
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";

  let session: Session = "closed";
  if (isWeekday) {
    if (minutes >= OPEN && minutes < CLOSE) session = "open";
    else if (minutes >= PRE_OPEN && minutes < OPEN) session = "pre";
    else if (minutes >= CLOSE && minutes < AFTER_CLOSE) session = "after";
  }

  return {
    session,
    label: LABELS[session],
    time: `${String(hour).padStart(2, "0")}:${parts.minute}:${parts.second}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
  };
}

/** Whether a daily bar is still forming: it's dated today in New York and
 * the market hasn't reached the end of after-hours trading. */
export function isLiveBar(barDate: string, at: Date = new Date()): boolean {
  const { date, session } = getMarketSession(at);
  return barDate === date && session !== "closed";
}
