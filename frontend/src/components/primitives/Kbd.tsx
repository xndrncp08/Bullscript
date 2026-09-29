import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-well px-1 font-mono text-2xs text-ink-3">
      {children}
    </kbd>
  );
}
