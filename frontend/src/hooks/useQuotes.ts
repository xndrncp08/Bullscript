import { useEffect, useMemo, useState } from "react";

import { api, isAbortError } from "@/lib/api";
import type { Quote } from "@/types";

const REFRESH_MS = 60_000;

export interface QuotesState {
  quotes: Map<string, Quote>;
  status: "loading" | "ready" | "error";
  updatedAt: number | null;
}

/** Polls batch quotes for a set of symbols. Pauses while the tab is hidden
 * and refreshes as soon as it's visible again. */
export function useQuotes(symbols: string[]): QuotesState {
  const key = useMemo(() => [...new Set(symbols)].slice(0, 25).join(","), [symbols]);
  const [state, setState] = useState<QuotesState>({ quotes: new Map(), status: "loading", updatedAt: null });

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      api
        .quotes(list, controller.signal)
        .then((response) => {
          setState({
            quotes: new Map(response.quotes.map((q) => [q.symbol, q])),
            status: "ready",
            updatedAt: Date.now(),
          });
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) return;
          setState((prev) => ({ ...prev, status: prev.quotes.size ? "ready" : "error" }));
        })
        .finally(() => {
          timer = setTimeout(refresh, REFRESH_MS);
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key]);

  return state;
}
