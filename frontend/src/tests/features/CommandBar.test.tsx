import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandBar } from "@/features/command/CommandBar";
import type { Resource } from "@/hooks/useTickerData";
import type { DiagnosticsResponse, PredictionResponse } from "@/types";

import { loading, makeDiagnostics, makeModel, makePrediction, ready } from "../fixtures";

function renderBar({
  prediction = ready(makePrediction("AAPL"), "AAPL") as Resource<PredictionResponse>,
  diagnostics = ready(makeDiagnostics("AAPL"), "AAPL") as Resource<DiagnosticsResponse>,
  showEmblem = true,
} = {}) {
  const props = {
    symbol: "AAPL",
    horizon: "14d",
    prediction,
    diagnostics,
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
    onOpenPalette: vi.fn(),
    showEmblem,
  };
  render(<CommandBar {...props} />);
  return props;
}

describe("CommandBar", () => {
  it("shows the brand emblem and the dual-tone wordmark", () => {
    renderBar();
    expect(screen.getByAltText("BullScript logo")).toHaveAttribute("src", "/brand/emblem-160.png");
    expect(screen.getByText("Bull")).toBeInTheDocument();
    expect(screen.getByText("Script")).toHaveClass("text-brand");
  });

  it("falls back to a >_ glyph if the emblem fails to load", () => {
    renderBar();
    fireEvent.error(screen.getByAltText("BullScript logo"));
    expect(screen.getByRole("img", { name: "BullScript logo" })).toHaveTextContent(">_");
  });

  it("leaves the emblem slot empty while the boot sequence owns it", () => {
    renderBar({ showEmblem: false });
    expect(screen.queryByAltText("BullScript logo")).toBeNull();
  });

  it("renders the current instrument as a terminal prompt", () => {
    renderBar();
    expect(screen.getByTestId("prompt")).toHaveTextContent(">_~/markets/AAPL");
  });

  it("opens the palette from the search button", async () => {
    const user = userEvent.setup();
    const { onOpenPalette } = renderBar();
    await user.click(screen.getByRole("button", { name: /search symbols/i }));
    expect(onOpenPalette).toHaveBeenCalled();
  });

  it("reports the active model version for the selected horizon", () => {
    renderBar();
    expect(screen.getByTestId("model-badge")).toHaveTextContent("ACTIVE");
    expect(screen.getByTestId("model-badge")).toHaveTextContent("v3 · 14D");
  });

  it("flags drift from the latest check", () => {
    const drifted = makeModel("AAPL", "14d", {
      last_check: { timestamp: "2026-06-01T10:00:00Z", drift_status: "drift", action: "promoted", ood: 0.3, skill: 0, hit_rate: 0.5, rmse: 1, live_skill: null, live_hit_rate: null, live_samples: 0 },
    });
    renderBar({ diagnostics: ready(makeDiagnostics("AAPL", [drifted]), "AAPL") });
    expect(screen.getByTestId("model-badge")).toHaveTextContent("DRIFT");
  });

  it("says the model is training before one exists", () => {
    renderBar({ prediction: loading(), diagnostics: loading() });
    expect(screen.getByTestId("model-badge")).toHaveTextContent("TRAINING");
  });

  it("toggles the theme", async () => {
    const user = userEvent.setup();
    const { onToggleTheme } = renderBar();
    await user.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(onToggleTheme).toHaveBeenCalled();
  });

  it("shows the New York market clock", () => {
    renderBar();
    expect(screen.getByTestId("market-clock")).toHaveTextContent(/ET$/);
  });
});
