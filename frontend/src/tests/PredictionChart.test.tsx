import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import PredictionChart from "@/components/PredictionChart";
import type { ChartResponse, PredictionResponse } from "@/types";

const chart: ChartResponse = {
  symbol: "AAPL",
  candles: Array.from({ length: 10 }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    open: 180 + i,
    high: 182 + i,
    low: 179 + i,
    close: 181 + i,
    volume: 1_000_000 + i,
  })),
  indicators: [],
};

const prediction: PredictionResponse = {
  symbol: "AAPL",
  generated_at: "2024-01-11T00:00:00Z",
  model_version: "v3",
  last_close: 190.5,
  horizons: [
    {
      horizon: "5d",
      confidence: 0.88,
      points: [
        { date: "2024-01-12", predicted_close: 191, lower_bound: 186, upper_bound: 196 },
        { date: "2024-01-13", predicted_close: 192, lower_bound: 187, upper_bound: 197 },
      ],
    },
    {
      horizon: "14d",
      confidence: 0.74,
      points: [
        { date: "2024-01-12", predicted_close: 193, lower_bound: 180, upper_bound: 206 },
      ],
    },
    {
      horizon: "30d",
      confidence: 0.6,
      points: [
        { date: "2024-01-12", predicted_close: 198, lower_bound: 170, upper_bound: 226 },
      ],
    },
  ],
};

describe("PredictionChart", () => {
  it("shows a loading state instead of the chart while loading", () => {
    render(<PredictionChart chart={null} prediction={null} loading={true} />);

    expect(screen.getByText(/loading chart data/i)).toBeInTheDocument();
  });

  it("renders the historical close line and predicted forecast line", () => {
    const { container } = render(
      <PredictionChart chart={chart} prediction={prediction} loading={false} />
    );

    const lineCurves = container.querySelectorAll(".recharts-line-curve");
    // one line for actual historical close, one for the predicted trajectory
    expect(lineCurves.length).toBeGreaterThanOrEqual(2);
  });

  it("renders a shaded confidence band area for the forecast", () => {
    const { container } = render(
      <PredictionChart chart={chart} prediction={prediction} loading={false} />
    );

    const areaPaths = container.querySelectorAll(".recharts-area-area");
    expect(areaPaths.length).toBeGreaterThan(0);
  });

  it("switches forecast horizon and updates displayed confidence", async () => {
    const user = userEvent.setup();
    render(<PredictionChart chart={chart} prediction={prediction} loading={false} />);

    // default horizon is 14d
    expect(screen.getByText(/confidence: 74.0%/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "30D" }));
    expect(screen.getByText(/confidence: 60.0%/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "5D" }));
    expect(screen.getByText(/confidence: 88.0%/i)).toBeInTheDocument();
  });

  it("displays the active model version", () => {
    render(<PredictionChart chart={chart} prediction={prediction} loading={false} />);

    expect(screen.getByText(/model version: v3/i)).toBeInTheDocument();
  });
});
