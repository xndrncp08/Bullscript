import { render, screen, within } from "@testing-library/react";
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

const horizonDefaults = {
  model_version: "v3",
  interval: 0.8,
  skill: 0.02,
  shrinkage: 1,
};

const prediction: PredictionResponse = {
  symbol: "AAPL",
  generated_at: "2024-01-11T00:00:00Z",
  as_of: "2024-01-10",
  last_close: 190.5,
  horizons: [
    {
      ...horizonDefaults,
      horizon: "5d",
      horizon_days: 5,
      hit_rate: 0.88,
      target_price: 192,
      expected_return: 0.0079,
      points: [
        { date: "2024-01-12", predicted_close: 191, lower_bound: 186, upper_bound: 196 },
        { date: "2024-01-13", predicted_close: 192, lower_bound: 187, upper_bound: 197 },
      ],
    },
    {
      ...horizonDefaults,
      horizon: "14d",
      horizon_days: 14,
      hit_rate: 0.74,
      target_price: 193,
      expected_return: 0.0131,
      points: [
        { date: "2024-01-12", predicted_close: 193, lower_bound: 180, upper_bound: 206 },
      ],
    },
    {
      ...horizonDefaults,
      horizon: "30d",
      horizon_days: 30,
      hit_rate: 0.6,
      target_price: 198,
      expected_return: 0.0394,
      points: [
        { date: "2024-01-12", predicted_close: 198, lower_bound: 170, upper_bound: 226 },
      ],
    },
  ],
};

describe("PredictionChart", () => {
  it("shows a skeleton loader instead of the chart while loading", () => {
    render(<PredictionChart chart={null} prediction={null} loading={true} />);

    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
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

  it("switches forecast horizon and updates the displayed hit rate", async () => {
    const user = userEvent.setup();
    render(<PredictionChart chart={chart} prediction={prediction} loading={false} />);

    const horizonGroup = screen.getByRole("group", { name: /forecast horizon/i });

    // default horizon is 14d
    expect(screen.getByText(/hit rate: 74.0%/i)).toBeInTheDocument();

    await user.click(within(horizonGroup).getByRole("button", { name: "30D" }));
    expect(screen.getByText(/hit rate: 60.0%/i)).toBeInTheDocument();

    await user.click(within(horizonGroup).getByRole("button", { name: "5D" }));
    expect(screen.getByText(/hit rate: 88.0%/i)).toBeInTheDocument();
  });

  it("displays the active model version", () => {
    render(<PredictionChart chart={chart} prediction={prediction} loading={false} />);

    expect(screen.getByText(/model version: v3/i)).toBeInTheDocument();
  });

  it("switches the historical range window without breaking the chart layout", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PredictionChart chart={chart} prediction={prediction} loading={false} />
    );

    const rangeGroup = screen.getByRole("group", { name: /historical range/i });
    await user.click(within(rangeGroup).getByRole("button", { name: "1Y" }));

    expect(container.querySelectorAll(".recharts-line-curve").length).toBeGreaterThanOrEqual(2);
  });
});
