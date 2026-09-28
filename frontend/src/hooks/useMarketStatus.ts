import { useEffect, useState } from "react";

export interface MarketStatus {
  isOpen: boolean;
  label: string;
}

/** US equities regular session: Mon-Fri, 9:30am-4:00pm America/New_York. */
function computeMarketStatus(): MarketStatus {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutesSinceMidnight = hour * 60 + minute;

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const isDuringSession = minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight < 16 * 60;
  const isOpen = isWeekday && isDuringSession;

  return { isOpen, label: isOpen ? "Market open" : "Market closed" };
}

export function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(computeMarketStatus);

  useEffect(() => {
    const id = setInterval(() => setStatus(computeMarketStatus()), 60_000);
    return () => clearInterval(id);
  }, []);

  return status;
}
