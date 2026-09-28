import { useEffect, useRef, useState, type ReactNode } from "react";

interface FlashValueProps {
  value: number | null | undefined;
  /** Flash only when the value changes for the same instrument - switching
   * symbols is a new reading, not a tick. */
  identity: string;
  children: ReactNode;
  className?: string;
}

/** The trading-desk tick flash: a brief up/down wash when a live value moves. */
export function FlashValue({ value, identity, children, className = "" }: FlashValueProps) {
  const previous = useRef({ identity, value });
  const [flash, setFlash] = useState<{ direction: "up" | "down"; tick: number } | null>(null);

  useEffect(() => {
    const prev = previous.current;
    if (prev.identity === identity && value != null && prev.value != null && value !== prev.value) {
      const direction = value > prev.value ? "up" : "down";
      setFlash((current) => ({ direction, tick: (current?.tick ?? 0) + 1 }));
    }
    previous.current = { identity, value };
  }, [identity, value]);

  const flashClass = flash ? (flash.direction === "up" ? "motion-flash-up" : "motion-flash-down") : "";

  return (
    <span key={flash?.tick ?? 0} className={`rounded-sm ${flashClass} ${className}`}>
      {children}
    </span>
  );
}
