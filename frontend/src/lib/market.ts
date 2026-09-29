/** US equity session state, computed in America/New_York regardless of the
 * viewer's timezone. NYSE full-day holidays close the session (the same
 * rules as backend/app/ml/trading_calendar.py); early closes aren't modelled. */

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

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return utc(year, Math.floor(n / 31), (n % 31) + 1);
}

/** 0 = Sunday … 6 = Saturday, matching Date#getUTCDay. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  return addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1));
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utc(year, month + 1, 0);
  return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
}

function observed(day: Date): Date {
  const dow = day.getUTCDay();
  return dow === 6 ? addDays(day, -1) : dow === 0 ? addDays(day, 1) : day;
}

const holidayCache = new Map<number, Set<string>>();

/** NYSE full-day holidays for a year, as YYYY-MM-DD strings. Weekend
 * holidays move to the adjacent weekday, except a Saturday New Year's Day,
 * which isn't observed. */
export function nyseHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const days = [
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Washington's Birthday
    addDays(easter(year), -2), // Good Friday
    lastWeekday(year, 5, 1), // Memorial Day
    observed(utc(year, 7, 4)), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    observed(utc(year, 12, 25)), // Christmas
  ];
  const newYear = utc(year, 1, 1);
  if (newYear.getUTCDay() !== 6) days.push(observed(newYear));
  if (year >= 2022) days.push(observed(utc(year, 6, 19))); // Juneteenth
  const set = new Set(days.map(iso));
  holidayCache.set(year, set);
  return set;
}

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
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";
  const isHoliday = isWeekday && nyseHolidays(Number(parts.year)).has(date);

  let session: Session = "closed";
  if (isWeekday && !isHoliday) {
    if (minutes >= OPEN && minutes < CLOSE) session = "open";
    else if (minutes >= PRE_OPEN && minutes < OPEN) session = "pre";
    else if (minutes >= CLOSE && minutes < AFTER_CLOSE) session = "after";
  }

  return {
    session,
    label: isHoliday ? "Market holiday" : LABELS[session],
    time: `${String(hour).padStart(2, "0")}:${parts.minute}:${parts.second}`,
    date,
    weekday,
  };
}

/** Whether a daily bar is still forming: it's dated today in New York and
 * the market hasn't reached the end of after-hours trading. */
export function isLiveBar(barDate: string, at: Date = new Date()): boolean {
  const { date, session } = getMarketSession(at);
  return barDate === date && session !== "closed";
}
