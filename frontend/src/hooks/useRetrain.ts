import { useCallback, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { RetrainResponse } from "@/types";

export type RetrainStatus = "idle" | "running" | "success" | "error";

export interface RetrainState {
  status: RetrainStatus;
  symbol: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  response: RetrainResponse | null;
  error: ApiError | null;
}

const IDLE: RetrainState = {
  status: "idle",
  symbol: null,
  startedAt: null,
  finishedAt: null,
  response: null,
  error: null,
};

export function useRetrain(onComplete?: (response: RetrainResponse) => void) {
  const [state, setState] = useState<RetrainState>(IDLE);
  const running = useRef(false);

  const run = useCallback(
    async (symbol: string) => {
      if (running.current) return;
      running.current = true;
      setState({ ...IDLE, status: "running", symbol, startedAt: Date.now() });

      try {
        const response = await api.retrain(symbol);
        setState((prev) => ({ ...prev, status: "success", finishedAt: Date.now(), response }));
        onComplete?.(response);
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError(String(error), 0, "/model/retrain");
        setState((prev) => ({ ...prev, status: "error", finishedAt: Date.now(), error: apiError }));
      } finally {
        running.current = false;
      }
    },
    [onComplete]
  );

  return { state, run };
}
