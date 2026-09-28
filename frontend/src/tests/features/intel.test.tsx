import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ForecastPanel } from "@/features/intel/ForecastPanel";
import { SentimentPanel } from "@/features/intel/SentimentPanel";

import { loading, makePrediction, makeSentiment, ready } from "../fixtures";

describe("ForecastPanel", () => {
  const prediction = ready(makePrediction("AAPL", 140), "AAPL");

  it("lists every horizon with its target, expected move and hit rate", () => {
    render(<ForecastPanel symbol="AAPL" prediction={prediction} horizon="14d" onHorizonChange={vi.fn()} />);

    const rows = within(screen.getByRole("radiogroup", { name: "Forecast horizon" })).getAllByRole("radio");
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => expect(row.textContent).toMatch(new RegExp(`^${["5D", "14D", "30D"][i]}\\d`)));
    const fourteen = screen.getByRole("radio", { name: /14D/ });
    expect(fourteen).toHaveAttribute("aria-checked", "true");
    expect(fourteen).toHaveTextContent("hit 69%");
    expect(fourteen).toHaveTextContent(/▲\+2\.80%/);
  });

  it("changes horizon on click and with the arrow keys", async () => {
    const user = userEvent.setup();
    const onHorizonChange = vi.fn();
    render(<ForecastPanel symbol="AAPL" prediction={prediction} horizon="14d" onHorizonChange={onHorizonChange} />);

    await user.click(screen.getByRole("radio", { name: /5D/ }));
    expect(onHorizonChange).toHaveBeenLastCalledWith("5d");

    screen.getByRole("radio", { name: /14D/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(onHorizonChange).toHaveBeenLastCalledWith("30d");
  });

  it("shows the selected horizon's interval and skill against a random walk", () => {
    render(<ForecastPanel symbol="AAPL" prediction={prediction} horizon="14d" onHorizonChange={vi.fn()} />);
    const region = screen.getByRole("region", { name: /forecast/i });
    expect(region).toHaveTextContent("80% RANGE");
    expect(region).toHaveTextContent(/SKILL VS RW.*\+6\.1%/);
  });

  it("flags a model that withholds its call", () => {
    render(<ForecastPanel symbol="AAPL" prediction={prediction} horizon="30d" onHorizonChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /30D/ })).toHaveTextContent("low signal");
    expect(screen.getByText(/Low signal\./)).toBeInTheDocument();
  });

  it("shows training progress before the first forecast", () => {
    render(<ForecastPanel symbol="AAPL" prediction={loading()} horizon="14d" onHorizonChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("training AAPL models");
  });

  it("ignores a forecast for a different symbol", () => {
    render(<ForecastPanel symbol="MSFT" prediction={prediction} horizon="14d" onHorizonChange={vi.fn()} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("explains an unavailable forecast", () => {
    render(
      <ForecastPanel
        symbol="AAPL"
        prediction={{ status: "error", data: null, symbol: null, error: Object.assign(new Error("Not enough data"), { status: 422 }) as never }}
        horizon="14d"
        onHorizonChange={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough data");
  });
});

describe("SentimentPanel", () => {
  it("reads the weighted index on a labelled gauge", () => {
    render(<SentimentPanel symbol="AAPL" sentiment={ready(makeSentiment("AAPL"), "AAPL")} />);
    expect(screen.getByRole("img", { name: /Sentiment bullish, score 0\.31/ })).toBeInTheDocument();
    expect(screen.getByText("bullish")).toBeInTheDocument();
  });

  it("breaks the headlines down by polarity", () => {
    render(<SentimentPanel symbol="AAPL" sentiment={ready(makeSentiment("AAPL"), "AAPL")} />);
    expect(screen.getByRole("img", { name: "1 positive, 1 neutral, 1 negative" })).toBeInTheDocument();
  });

  it("lists scored headlines with source, age, and a spoken label", () => {
    render(<SentimentPanel symbol="AAPL" sentiment={ready(makeSentiment("AAPL"), "AAPL")} />);
    const items = within(screen.getByRole("list", { name: "Scored headlines" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Apple beats estimates");
    expect(items[0]).toHaveTextContent(/positive\. Reuters · 2h ago/);
  });

  it("says when there's no news", () => {
    render(<SentimentPanel symbol="AAPL" sentiment={ready({ ...makeSentiment("AAPL"), headlines: [] }, "AAPL")} />);
    expect(screen.getByText(/No recent headlines for AAPL/)).toBeInTheDocument();
  });

  it("scores in the background with a live status", () => {
    render(<SentimentPanel symbol="AAPL" sentiment={loading()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/scoring headlines/);
  });
});
