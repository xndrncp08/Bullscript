import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstrumentHeader } from "@/features/market/InstrumentHeader";
import { TickerTape } from "@/features/market/TickerTape";
import { Watchlist } from "@/features/market/Watchlist";
import type { QuotesState } from "@/hooks/useQuotes";

import { loading, makeChart, makeQuote, ready } from "../fixtures";

const quotes: QuotesState = {
  quotes: new Map([
    ["AAPL", makeQuote("AAPL", 339.83, -0.0036)],
    ["MSFT", makeQuote("MSFT", 511.44, 0.012)],
  ]),
  status: "ready",
  updatedAt: 0,
};

describe("Watchlist", () => {
  it("lists symbols with price, move and sparkline, marking the active one", () => {
    render(<Watchlist symbols={["AAPL", "MSFT"]} active="AAPL" quotes={quotes} onSelect={vi.fn()} onRemove={vi.fn()} />);

    const aapl = screen.getByRole("button", { name: /^AAPL/ });
    expect(aapl).toHaveAttribute("aria-current", "true");
    expect(aapl).toHaveTextContent("339.83");
    expect(aapl).toHaveTextContent(/▼−0\.36%down/);
    expect(aapl.querySelector("svg path")).not.toBeNull();
    expect(screen.getByRole("button", { name: /^MSFT/ })).not.toHaveAttribute("aria-current");
  });

  it("selects and removes symbols", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(<Watchlist symbols={["AAPL", "MSFT"]} active="AAPL" quotes={quotes} onSelect={onSelect} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: /^MSFT/ }));
    expect(onSelect).toHaveBeenCalledWith("MSFT");

    await user.click(screen.getByRole("button", { name: "Remove MSFT from watchlist" }));
    expect(onRemove).toHaveBeenCalledWith("MSFT");
    // the active symbol can't be removed out from under the workspace
    expect(screen.queryByRole("button", { name: "Remove AAPL from watchlist" })).toBeNull();
  });
});

describe("TickerTape", () => {
  it("renders the tape once for assistive tech and duplicates it visually for the loop", () => {
    render(<TickerTape symbols={["AAPL", "MSFT"]} quotes={quotes} onSelect={vi.fn()} />);
    const tape = screen.getByRole("navigation", { name: "Market tape" });
    expect(within(tape).getAllByRole("button", { name: /AAPL/ })).toHaveLength(1);
    expect(tape.querySelectorAll("button")).toHaveLength(4);
  });

  it("only starts moving once there are quotes to show", () => {
    const { container, rerender } = render(
      <TickerTape symbols={["AAPL"]} quotes={{ quotes: new Map(), status: "loading", updatedAt: null }} onSelect={vi.fn()} />
    );
    expect(container.querySelector(".motion-marquee")).toBeNull();
    rerender(<TickerTape symbols={["AAPL"]} quotes={quotes} onSelect={vi.fn()} />);
    expect(container.querySelector(".motion-marquee")).not.toBeNull();
  });
});

describe("InstrumentHeader", () => {
  const chart = ready(makeChart("AAPL", 300, 100), "AAPL");

  it("leads with the last price from the daily bars", () => {
    render(<InstrumentHeader symbol="AAPL" chart={chart} watched onToggleWatch={vi.fn()} />);
    const last = chart.data!.candles[299];
    expect(screen.getByTestId("hero-price")).toHaveTextContent(last.close.toFixed(2));
    expect(screen.getByRole("heading", { name: "AAPL" })).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
  });

  it("prefers a fresher live quote for the headline price", () => {
    const quote = { ...makeQuote("AAPL", 999.99), as_of: "2099-01-01" };
    render(<InstrumentHeader symbol="AAPL" chart={chart} quote={quote} watched onToggleWatch={vi.fn()} />);
    expect(screen.getByTestId("hero-price")).toHaveTextContent("999.99");
  });

  it("shows session stats and where price sits in its 52-week range", () => {
    render(<InstrumentHeader symbol="AAPL" chart={chart} watched onToggleWatch={vi.fn()} />);
    for (const label of ["Open", "High", "Low", "HV 20", "Volume", "RSI 14", "ATR", "52W range"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("img", { name: /of the 52-week range/ })).toBeInTheDocument();
  });

  it("toggles the watchlist star", async () => {
    const user = userEvent.setup();
    const onToggleWatch = vi.fn();
    render(<InstrumentHeader symbol="AAPL" chart={chart} watched={false} onToggleWatch={onToggleWatch} />);
    await user.click(screen.getByRole("button", { name: "Add AAPL to watchlist" }));
    expect(onToggleWatch).toHaveBeenCalled();
  });

  it("holds a skeleton until the symbol's bars arrive", () => {
    render(<InstrumentHeader symbol="MSFT" chart={loading(chart.data, "AAPL")} watched onToggleWatch={vi.fn()} />);
    expect(screen.queryByTestId("hero-price")).toBeNull();
  });
});
