import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App, { BOOT_FLAG } from "@/app/App";
import { telemetry } from "@/lib/telemetry";

import { makeChart, makeDiagnostics, makePrediction, makeQuote, makeSentiment } from "../fixtures";

const KNOWN = new Set(["AAPL", "MSFT"]);

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** A tiny fake of the BullScript API, routed by path. */
function fakeApi(calls: string[]) {
  return vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const path = new URL(url, "http://test").pathname;
    const query = new URL(url, "http://test").searchParams;

    const ticker = path.match(/^\/api\/v1\/ticker\/([^/]+)\/(\w+)$/);
    if (ticker) {
      const [, symbol, resource] = ticker;
      if (!KNOWN.has(symbol)) return json({ detail: `No price history found for symbol '${symbol}'` }, 404);
      if (resource === "chart") return json(makeChart(symbol, 90, symbol === "MSFT" ? 400 : 100));
      if (resource === "prediction") return json(makePrediction(symbol, symbol === "MSFT" ? 445 : 145));
      if (resource === "sentiment") return json(makeSentiment(symbol));
    }
    if (path === "/api/v1/model/diagnostics") return json(makeDiagnostics(query.get("symbol") ?? "AAPL"));
    if (path === "/api/v1/market/quotes") {
      const symbols = (query.get("symbols") ?? "").split(",");
      return json({ generated_at: "", quotes: symbols.filter((s) => KNOWN.has(s)).map((s) => makeQuote(s, s === "MSFT" ? 445 : 145)) });
    }
    if (path === "/api/v1/model/retrain") {
      const { symbol } = JSON.parse(String(init?.body));
      return json({
        symbol,
        results: {
          "14d": { promoted: true, trigger: "manual", version: "v4", psi: null, metrics: { rmse: 1, mape: 0.01, r2: 0.9, skill: 0.05, hit_rate: 0.6, naive_rmse: 1.1, residual_std: 0.02 } },
        },
      });
    }
    return json({ detail: "not found" }, 404);
  });
}

describe("App", () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    telemetry.reset();
    vi.stubGlobal("fetch", fakeApi(calls));
    sessionStorage.setItem(BOOT_FLAG, "1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the workspace for the default symbol", async () => {
    render(<App />);

    expect(await screen.findByTestId("hero-price")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AAPL" })).toBeInTheDocument();
    expect(await screen.findAllByTestId("candle")).not.toHaveLength(0);
    expect(await screen.findByRole("radiogroup", { name: "Forecast horizon" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /Sentiment bullish/ })).toBeInTheDocument();
    expect(calls).toEqual(
      expect.arrayContaining([
        "GET /api/v1/ticker/AAPL/chart",
        "GET /api/v1/ticker/AAPL/prediction",
        "GET /api/v1/ticker/AAPL/sentiment",
        "GET /api/v1/model/diagnostics?symbol=AAPL",
      ])
    );
    await waitFor(() => expect(document.title).toMatch(/^AAPL \d/));
  });

  it("jumps to a symbol from the command palette", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("hero-price");

    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByRole("combobox"), "msft{Enter}");

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByRole("heading", { name: "MSFT" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("hero-price")).toHaveTextContent(/^4\d\d\./));
    expect(calls).toContain("GET /api/v1/ticker/MSFT/chart");
    expect(localStorage.getItem("bullscript-symbol")).toBe('"MSFT"');
  });

  it("falls back to the last good symbol when Yahoo doesn't know one", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("hero-price");

    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByRole("combobox"), "zzzz{Enter}");

    expect(await screen.findByText("No market data for ZZZZ")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "AAPL" })).toBeInTheDocument());
  });

  it("retrains from the telemetry console and refreshes the model", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("radiogroup", { name: "Forecast horizon" });
    const predictionCalls = () => calls.filter((c) => c.endsWith("/ticker/AAPL/prediction")).length;
    const before = predictionCalls();

    await user.click(screen.getByRole("button", { name: /run retrain/i }));

    expect(await screen.findByText("Retrained AAPL")).toBeInTheDocument();
    expect(calls).toContain("POST /api/v1/model/retrain");
    await waitFor(() => expect(predictionCalls()).toBe(before + 1));
    expect(screen.getByRole("log", { name: "Retrain log" })).toHaveTextContent(/14d\s+v4\s+PROMOTED/);
  });

  it("adds the current symbol to the watchlist from the header star", async () => {
    const user = userEvent.setup();
    localStorage.setItem("bullscript-watchlist", JSON.stringify(["MSFT"]));
    render(<App />);
    await screen.findByTestId("hero-price");

    await user.click(screen.getByRole("button", { name: "Add AAPL to watchlist" }));

    const watchlist = screen.getByRole("region", { name: /watchlist/i });
    expect(within(watchlist).getByRole("button", { name: /^AAPL/ })).toBeInTheDocument();
  });

  it("plays the boot sequence once per session", async () => {
    sessionStorage.clear();
    const { unmount } = render(<App />);

    expect(screen.getByTestId("boot-sequence")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("boot-sequence")).toBeNull(), { timeout: 4000 });
    expect(sessionStorage.getItem(BOOT_FLAG)).toBe("1");

    unmount();
    render(<App />);
    expect(screen.queryByTestId("boot-sequence")).toBeNull();
  });
});
