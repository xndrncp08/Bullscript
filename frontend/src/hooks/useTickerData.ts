import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, isAbortError } from "@/lib/api";
import type {
  ChartResponse,
  DiagnosticsResponse,
  PredictionResponse,
  SentimentResponse,
} from "@/types";

export type ResourceStatus = "idle" | "loading" | "success" | "error";

export interface Resource<T> {
  status: ResourceStatus;
  /** The most recent successful payload - possibly for the previous symbol
   * while a new one loads, so panels can hold their frame instead of
   * flashing a skeleton. Check `symbol` before trusting it. */
  data: T | null;
  /** Which symbol `data` belongs to. */
  symbol: string | null;
  error: ApiError | null;
}

export interface TickerData {
  chart: Resource<ChartResponse>;
  prediction: Resource<PredictionResponse>;
  sentiment: Resource<SentimentResponse>;
  diagnostics: Resource<DiagnosticsResponse>;
}

type Key = keyof TickerData;
type Payload<K extends Key> = NonNullable<TickerData[K]["data"]>;

const LOADERS: { [K in Key]: (symbol: string, signal: AbortSignal) => Promise<Payload<K>> } = {
  chart: api.chart,
  prediction: api.prediction,
  sentiment: api.sentiment,
  diagnostics: api.diagnostics,
};

const ALL_KEYS: Key[] = ["chart", "prediction", "sentiment", "diagnostics"];

function idle<T>(): Resource<T> {
  return { status: "idle", data: null, symbol: null, error: null };
}

function patch<K extends Key>(state: TickerData, key: K, value: Partial<TickerData[K]>): TickerData {
  return { ...state, [key]: { ...state[key], ...value } };
}

/**
 * Loads everything the workspace shows for one symbol.
 *
 * - Each resource resolves independently: the chart renders as soon as its
 *   bars arrive, without waiting for a model to train.
 * - Switching symbols aborts in-flight requests and bumps a generation
 *   counter, so a slow response for the previous symbol can never land on
 *   top of the new one.
 */
export function useTickerData(symbol: string) {
  const [data, setData] = useState<TickerData>(() => ({
    chart: idle(),
    prediction: idle(),
    sentiment: idle(),
    diagnostics: idle(),
  }));

  const generation = useRef(0);
  const controllers = useRef(new Map<Key, AbortController>());

  const fetchOne = useCallback(<K extends Key>(key: K, target: string) => {
    const current = generation.current;
    controllers.current.get(key)?.abort();
    const controller = new AbortController();
    controllers.current.set(key, controller);

    setData((prev) => patch(prev, key, { status: "loading", error: null } as Partial<TickerData[K]>));

    const loader = LOADERS[key] as (symbol: string, signal: AbortSignal) => Promise<Payload<K>>;
    loader(target, controller.signal)
      .then((payload) => {
        if (generation.current !== current) return;
        setData((prev) =>
          patch(prev, key, {
            status: "success",
            data: payload,
            symbol: target,
            error: null,
          } as Partial<TickerData[K]>)
        );
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || generation.current !== current) return;
        const apiError = error instanceof ApiError ? error : new ApiError(String(error), 0, key);
        setData((prev) =>
          patch(prev, key, { status: "error", error: apiError } as Partial<TickerData[K]>)
        );
      });
  }, []);

  useEffect(() => {
    generation.current += 1;
    ALL_KEYS.forEach((key) => fetchOne(key, symbol));
  }, [symbol, fetchOne]);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  /** Refetch just the model-backed resources (after a retrain). */
  const reloadModel = useCallback(() => {
    fetchOne("prediction", symbol);
    fetchOne("diagnostics", symbol);
  }, [fetchOne, symbol]);

  return { ...data, reloadModel };
}
