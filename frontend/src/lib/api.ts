import type {
  ChartResponse,
  DiagnosticsResponse,
  PredictionResponse,
  QuotesResponse,
  RetrainResponse,
  SentimentResponse,
} from "@/types";

import { telemetry } from "./telemetry";

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isRateLimited() {
    return this.status === 429;
  }

  get isOffline() {
    return this.status === 0;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** FastAPI errors are {detail: string} or {detail: [{msg}]}; slowapi's 429 is
 * {error: string}. */
function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (Array.isArray(record.detail) && record.detail[0]?.msg) return String(record.detail[0].msg);
    if (typeof record.error === "string") return record.error;
  }
  return fallback;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  { signal, body }: { signal?: AbortSignal; body?: unknown } = {}
): Promise<T> {
  const id = telemetry.start(method, path);
  const started = performance.now();

  let response: Response;
  let text: string;
  try {
    response = await fetch(BASE + path, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await response.text();
  } catch (error) {
    const durationMs = performance.now() - started;
    if (isAbortError(error)) {
      telemetry.finish(id, { status: "aborted", durationMs });
      throw error;
    }
    telemetry.finish(id, { status: "error", durationMs, error: "network unreachable" });
    throw new ApiError("Can't reach the BullScript API", 0, path);
  }

  const durationMs = performance.now() - started;
  const data = text ? parseJson(text) : null;

  if (!response.ok) {
    const message = errorMessage(data, response.statusText || `HTTP ${response.status}`);
    telemetry.finish(id, {
      status: "error",
      httpStatus: response.status,
      durationMs,
      bytes: text.length,
      error: message,
    });
    throw new ApiError(message, response.status, path);
  }

  telemetry.finish(id, { status: "ok", httpStatus: response.status, durationMs, bytes: text.length });
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  chart: (symbol: string, signal?: AbortSignal) =>
    request<ChartResponse>("GET", `/ticker/${enc(symbol)}/chart`, { signal }),

  prediction: (symbol: string, signal?: AbortSignal) =>
    request<PredictionResponse>("GET", `/ticker/${enc(symbol)}/prediction`, { signal }),

  sentiment: (symbol: string, signal?: AbortSignal) =>
    request<SentimentResponse>("GET", `/ticker/${enc(symbol)}/sentiment`, { signal }),

  diagnostics: (symbol: string, signal?: AbortSignal) =>
    request<DiagnosticsResponse>("GET", `/model/diagnostics?symbol=${enc(symbol)}`, { signal }),

  quotes: (symbols: string[], signal?: AbortSignal) =>
    request<QuotesResponse>("GET", `/market/quotes?symbols=${symbols.map(enc).join(",")}`, { signal }),

  retrain: (symbol: string, horizons?: string[]) =>
    request<RetrainResponse>("POST", "/model/retrain", { body: { symbol, horizons } }),
};
