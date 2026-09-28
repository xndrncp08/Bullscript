import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "@/lib/api";
import { telemetry } from "@/lib/telemetry";

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    telemetry.reset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON and records a completed request", async () => {
    fetchMock.mockReturnValueOnce(respond(200, { symbol: "AAPL", candles: [], indicators: [] }));

    const chart = await api.chart("AAPL");

    expect(chart.symbol).toBe("AAPL");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/ticker/AAPL/chart", expect.objectContaining({ method: "GET" }));
    const [entry] = telemetry.getSnapshot();
    expect(entry).toMatchObject({ method: "GET", path: "/ticker/AAPL/chart", status: "ok", httpStatus: 200 });
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("surfaces FastAPI's detail message on errors", async () => {
    fetchMock.mockReturnValueOnce(respond(404, { detail: "No price history found for symbol 'ZZZZ'" }));

    const error = await api.chart("ZZZZ").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNotFound).toBe(true);
    expect((error as ApiError).message).toBe("No price history found for symbol 'ZZZZ'");
    expect(telemetry.getSnapshot()[0]).toMatchObject({ status: "error", httpStatus: 404 });
  });

  it("reads validation and rate-limit error shapes", async () => {
    fetchMock.mockReturnValueOnce(respond(422, { detail: [{ msg: "String should match pattern" }] }));
    await expect(api.chart("AAPL")).rejects.toThrow("String should match pattern");

    fetchMock.mockReturnValueOnce(respond(429, { error: "Rate limit exceeded: 5 per 1 minute" }));
    const limited = (await api.retrain("AAPL").catch((e: unknown) => e)) as ApiError;
    expect(limited.isRateLimited).toBe(true);
    expect(limited.message).toMatch(/Rate limit/);
  });

  it("maps a network failure to an offline error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = (await api.sentiment("AAPL").catch((e: unknown) => e)) as ApiError;

    expect(error.isOffline).toBe(true);
    expect(telemetry.getSnapshot()[0].status).toBe("error");
  });

  it("rethrows aborts untouched and records them as aborted", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"));

    await expect(api.prediction("AAPL")).rejects.toMatchObject({ name: "AbortError" });
    expect(telemetry.getSnapshot()[0].status).toBe("aborted");
  });

  it("posts retrain requests as JSON", async () => {
    fetchMock.mockReturnValueOnce(respond(200, { symbol: "AAPL", results: {} }));

    await api.retrain("AAPL");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ symbol: "AAPL" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("encodes symbols in paths and query strings", async () => {
    fetchMock.mockReturnValueOnce(respond(200, { generated_at: "", quotes: [] }));
    await api.quotes(["^VIX", "BRK-B"]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/market/quotes?symbols=%5EVIX,BRK-B");
  });
});
