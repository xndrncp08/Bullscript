import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { ChartMode, Overlays } from "@/features/chart/model";
import { PriceChart } from "@/features/chart/PriceChart";
import type { Resource } from "@/hooks/useTickerData";
import type { RangeKey } from "@/lib/chart-math";
import type { ChartResponse, PredictionResponse } from "@/types";

import { loading, makeChart, makePrediction, ready } from "../fixtures";

function Harness({
  symbol = "AAPL",
  chart = ready(makeChart("AAPL", 80), "AAPL"),
  prediction = ready(makePrediction("AAPL"), "AAPL"),
  initialMode = "candles",
}: {
  symbol?: string;
  chart?: Resource<ChartResponse>;
  prediction?: Resource<PredictionResponse>;
  initialMode?: ChartMode;
}) {
  const [range, setRange] = useState<RangeKey>("3M");
  const [mode, setMode] = useState<ChartMode>(initialMode);
  const [overlays, setOverlays] = useState<Overlays>({ ema20: true, ema50: false, bollinger: false });
  return (
    <PriceChart
      symbol={symbol}
      chart={chart}
      prediction={prediction}
      horizon="14d"
      range={range}
      onRangeChange={setRange}
      mode={mode}
      onModeChange={setMode}
      overlays={overlays}
      onOverlaysChange={setOverlays}
      onRetry={() => {}}
    />
  );
}

describe("PriceChart", () => {
  it("draws one candle per bar in the range, hollow when up and solid when down", () => {
    render(<Harness />);

    const candles = screen.getAllByTestId("candle");
    expect(candles).toHaveLength(63);

    const up = candles.find((c) => c.getAttribute("data-direction") === "up")!;
    const down = candles.find((c) => c.getAttribute("data-direction") === "down")!;
    expect(up.querySelector("rect")).toHaveAttribute("data-fill", "hollow");
    expect(down.querySelector("rect")).toHaveAttribute("data-fill", "solid");
  });

  it("changes the window when a range is picked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(within(screen.getByRole("radiogroup", { name: "Chart range" })).getByRole("radio", { name: "1M" }));

    expect(screen.getAllByTestId("candle")).toHaveLength(21);
    expect(screen.getByRole("region", { name: /price action/i })).toHaveTextContent("21 bars");
  });

  it("overlays the selected horizon's forecast path and interval band", () => {
    render(<Harness />);

    const layer = screen.getByTestId("forecast-layer");
    expect(layer).toHaveAttribute("data-horizon", "14d");
    expect(within(layer).getByTestId("forecast-line").getAttribute("d")).toMatch(/^M/);
    expect(within(layer).getByTestId("forecast-band").getAttribute("d")).toMatch(/Z$/);
  });

  it("never draws a forecast that belongs to a different symbol's bars", () => {
    render(<Harness prediction={ready(makePrediction("MSFT"), "MSFT")} />);
    expect(screen.queryByTestId("forecast-layer")).toBeNull();
  });

  it("says the forecast is training while the model loads", () => {
    render(<Harness prediction={loading()} />);
    expect(screen.getByText(/training forecast models/i)).toBeInTheDocument();
    expect(screen.queryByTestId("forecast-layer")).toBeNull();
  });

  it("toggles overlays from their legend chips", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const ema20 = screen.getByRole("button", { name: /EMA 20/ });
    expect(ema20).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ema20")).toBeInTheDocument();

    await user.click(ema20);
    expect(ema20).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("ema20")).toBeNull();
  });

  it("switches between candles, line and a table of every value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const types = screen.getByRole("radiogroup", { name: "Chart type" });

    await user.click(within(types).getByRole("radio", { name: "Line" }));
    expect(screen.getByTestId("close-line")).toBeInTheDocument();
    expect(screen.queryAllByTestId("candle")).toHaveLength(0);

    await user.click(within(types).getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table");
    // 63 bars + 14 forecast rows + 2 header rows
    expect(within(table).getAllByRole("row")).toHaveLength(63 + 14 + 2);
  });

  it("reads out the bar under the pointer", () => {
    render(<Harness />);
    const readout = screen.getByTestId("chart-readout");
    const lastDate = readout.textContent;

    // plot spans x 6..738 at 800px wide; the far left is the first bar of the range
    fireEvent.pointerMove(screen.getByTestId("chart-hit-area"), { clientX: 8, clientY: 100 });

    expect(screen.getByTestId("crosshair")).toBeInTheDocument();
    expect(readout.textContent).not.toBe(lastDate);
    // 3M shows the last 63 of 80 bars, so the leftmost bar is the 18th: Jan 28
    expect(readout).toHaveTextContent(/^Jan 28, 2026O[\d.]+H[\d.]+L[\d.]+C[\d.]+/);
  });

  it("reads out forecast points past the last bar", () => {
    render(<Harness />);
    fireEvent.pointerMove(screen.getByTestId("chart-hit-area"), { clientX: 730, clientY: 100 });
    expect(screen.getByTestId("chart-readout")).toHaveTextContent(/forecast.*PRED.*80%/i);
  });

  it("lets the keyboard walk bars with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const chart = screen.getByRole("group", { name: /price chart/i });

    chart.focus();
    await user.keyboard("{Home}");
    expect(screen.getByTestId("crosshair")).toBeInTheDocument();
    const first = screen.getByTestId("chart-readout").textContent;

    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("chart-readout").textContent).not.toBe(first);

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("crosshair")).toBeNull();
  });

  it("summarises the chart for screen readers", () => {
    render(<Harness />);
    expect(screen.getByRole("img", { name: /AAPL daily chart, 63 bars .* 14d forecast target/ })).toBeInTheDocument();
  });

  it("holds the previous symbol's chart, dimmed, while the next one loads", () => {
    render(<Harness symbol="MSFT" chart={loading(makeChart("AAPL", 80), "AAPL")} prediction={loading()} />);

    expect(screen.getAllByTestId("candle").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: /AAPL daily chart/ })).toHaveClass("opacity-35");
    expect(screen.getByText(/loading MSFT/)).toBeInTheDocument();
  });

  it("shows the live request log on first load", () => {
    render(<Harness chart={loading()} prediction={loading()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading AAPL · daily bars/);
  });

  it("offers a retry when the first load fails", () => {
    render(
      <Harness
        chart={{ status: "error", data: null, symbol: null, error: Object.assign(new Error("API down"), { status: 0 }) as never }}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("API down");
    expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
  });
});
