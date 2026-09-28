import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TelemetryDock } from "@/features/telemetry/TelemetryDock";
import type { RetrainState } from "@/hooks/useRetrain";
import { telemetry } from "@/lib/telemetry";

import { makeDiagnostics, makeModel, ready } from "../fixtures";

const idle: RetrainState = { status: "idle", symbol: null, startedAt: null, finishedAt: null, response: null, error: null };

function renderDock(overrides: Partial<Parameters<typeof TelemetryDock>[0]> = {}) {
  const props = {
    symbol: "AAPL",
    horizon: "14d",
    horizons: ["5d", "14d", "30d"],
    onHorizonChange: vi.fn(),
    diagnostics: ready(makeDiagnostics("AAPL"), "AAPL"),
    retrain: idle,
    onRetrain: vi.fn(),
    ...overrides,
  };
  const utils = render(<TelemetryDock {...props} />);
  return { ...props, ...utils, user: userEvent.setup() };
}

describe("TelemetryDock · model", () => {
  beforeEach(() => telemetry.reset());

  it("shows the selected horizon's model health", () => {
    renderDock();
    const health = screen.getByRole("region", { name: "Model health" });
    expect(health).toHaveTextContent("AAPL · 14D · v3");
    expect(health).toHaveTextContent("ACTIVE");
    expect(health).toHaveTextContent(/SKILL\+6\.1%/);
    expect(health).toHaveTextContent(/HIT69%/);
    expect(health).toHaveTextContent("500 train · 170 cal · 170 holdout");
    expect(screen.getByRole("img", { name: "PSI 0.07 against a drift threshold of 0.2" })).toBeInTheDocument();
  });

  it("labels drifted and legacy models", () => {
    const drifted = makeModel("AAPL", "14d", {
      last_check: { timestamp: "2026-06-01T10:00:00Z", drift_status: "drift", action: "promoted", psi: 0.41, skill: 0, hit_rate: 0.5, rmse: 1 },
    });
    const { rerender } = renderDock({ diagnostics: ready(makeDiagnostics("AAPL", [drifted]), "AAPL") });
    expect(screen.getByRole("region", { name: "Model health" })).toHaveTextContent("DRIFT");

    const legacy = makeModel("AAPL", "14d", { compatible: false });
    rerender(
      <TelemetryDock
        symbol="AAPL"
        horizon="14d"
        horizons={["14d"]}
        onHorizonChange={vi.fn()}
        diagnostics={ready(makeDiagnostics("AAPL", [legacy]), "AAPL")}
        retrain={idle}
        onRetrain={vi.fn()}
      />
    );
    expect(screen.getByRole("region", { name: "Model health" })).toHaveTextContent("LEGACY");
  });

  it("ranks feature importances with readable names", () => {
    renderDock();
    const features = within(screen.getByRole("region", { name: "Feature importance" })).getAllByRole("listitem");
    expect(features[0]).toHaveTextContent("RSI 14");
    expect(features[1]).toHaveTextContent("Δ EMA 200");
  });

  it("explains a missing model instead of showing zeros", () => {
    renderDock({ diagnostics: ready(makeDiagnostics("AAPL", []), "AAPL") });
    expect(screen.getByRole("region", { name: "Model health" })).toHaveTextContent(/no 14d model for AAPL yet/);
  });

  it("switches the model horizon", async () => {
    const { user, onHorizonChange } = renderDock();
    await user.click(screen.getByRole("radio", { name: "30D" }));
    expect(onHorizonChange).toHaveBeenCalledWith("30d");
  });

  it("prints the retrain history", () => {
    renderDock();
    const log = screen.getByRole("log", { name: "Retrain log" });
    expect(log).toHaveTextContent(/14d\s+v3 PROMOTED manual · skill \+6\.1%/);
  });
});

describe("TelemetryDock · retrain console", () => {
  beforeEach(() => telemetry.reset());

  it("runs a retrain from the console", async () => {
    const { user, onRetrain } = renderDock();
    await user.click(screen.getByRole("button", { name: /run retrain/i }));
    expect(onRetrain).toHaveBeenCalledTimes(1);
  });

  it("streams progress while training and locks the button", () => {
    renderDock({ retrain: { ...idle, status: "running", symbol: "AAPL", startedAt: Date.now() } });
    expect(screen.getByRole("button", { name: /running/i })).toBeDisabled();
    expect(screen.getByRole("log", { name: "Retrain log" })).toHaveTextContent(/retrain AAPL --horizons 5d,14d,30d/);
  });

  it("prints per-horizon results when training finishes", () => {
    renderDock({
      retrain: {
        status: "success",
        symbol: "AAPL",
        startedAt: 1_000,
        finishedAt: 4_200,
        error: null,
        response: {
          symbol: "AAPL",
          results: {
            "5d": { promoted: true, trigger: "manual", version: "v4", psi: null, metrics: { rmse: 1, mape: 0.01, r2: 0.9, skill: 0.031, hit_rate: 0.58, naive_rmse: 1.1, residual_std: 0.02 } },
            "30d": { promoted: false, trigger: "manual", version: "v3", psi: null, metrics: { rmse: 1, mape: 0.01, r2: 0.9, skill: -0.2, hit_rate: 0.4, naive_rmse: 1.1, residual_std: 0.02 } },
          },
        },
      },
    });
    const log = screen.getByRole("log", { name: "Retrain log" });
    expect(log).toHaveTextContent("done in 3.2s");
    expect(log).toHaveTextContent(/5d\s+v4\s+PROMOTED skill \+3\.1%/);
    expect(log).toHaveTextContent(/30d\s+v3\s+KEPT/);
  });

  it("reports a failed retrain", () => {
    renderDock({
      retrain: { ...idle, status: "error", symbol: "AAPL", startedAt: 1, finishedAt: 2, error: Object.assign(new Error("Rate limit exceeded"), { status: 429 }) as never },
    });
    expect(screen.getByRole("log", { name: "Retrain log" })).toHaveTextContent("✗ retrain failed: Rate limit exceeded");
  });
});

describe("TelemetryDock · network", () => {
  beforeEach(() => telemetry.reset());

  it("lists this client's API requests with status and latency", async () => {
    const { user } = renderDock();
    act(() => {
      const ok = telemetry.start("GET", "/ticker/AAPL/chart");
      telemetry.finish(ok, { status: "ok", httpStatus: 200, durationMs: 263, bytes: 2048 });
      const bad = telemetry.start("GET", "/ticker/ZZZZ/chart");
      telemetry.finish(bad, { status: "error", httpStatus: 404, durationMs: 90, error: "not found" });
      telemetry.start("GET", "/ticker/AAPL/prediction");
    });

    // the pending request badges the tab
    await user.click(screen.getByRole("tab", { name: /network/i }));
    expect(screen.getByRole("tab", { name: /network/i })).toHaveAttribute("aria-selected", "true");

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/GET \/ticker\/AAPL\/prediction.*···/);
    expect(rows[1]).toHaveTextContent(/404.*90ms/);
    expect(rows[2]).toHaveTextContent(/200.*263ms.*2\.0K/);
  });

  it("switches tabs with the arrow keys", async () => {
    const { user } = renderDock();
    screen.getByRole("tab", { name: /model/i }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /network/i })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/no requests yet/);
  });
});
