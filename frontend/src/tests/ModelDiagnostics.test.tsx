import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import ModelDiagnostics from "@/components/ModelDiagnostics";
import type { DiagnosticsResponse } from "@/types";

vi.mock("@/api/client", () => ({
  api: {
    triggerRetrain: vi.fn().mockResolvedValue({ symbol: "AAPL", results: {} }),
  },
}));

const logDefaults = { skill: 0.03, hit_rate: 0.55, psi: 0.08 };

const diagnostics: DiagnosticsResponse = {
  generated_at: "2024-01-11T00:00:00Z",
  drift_skill_floor: -0.1,
  drift_psi_threshold: 0.2,
  models: [
    {
      symbol: "AAPL",
      horizon: "5d",
      model_version: "v3",
      compatible: true,
      target: "log_return",
      trained_at: "2024-01-10T12:00:00Z",
      train_end: "2023-10-01",
      train_samples: 400,
      calibration_samples: 120,
      holdout_samples: 120,
      rmse: 1.2345,
      mape: 0.0456,
      r2: 0.912,
      skill: 0.03,
      hit_rate: 0.55,
      naive_rmse: 1.27,
      residual_std: 0.03,
      shrinkage: 0.8,
      feature_importances: { rsi_14: 0.32, dist_ema_20: 0.21, bb_pct_b: 0.18 },
      last_check: null,
      retrain_log: [
        {
          ...logDefaults,
          timestamp: "2024-01-10T12:00:00Z",
          symbol: "AAPL",
          horizon: "5d",
          trigger: "performance_drift",
          rmse: 1.2345,
          mape: 0.0456,
          r2: 0.912,
          promoted: true,
          model_version: "v3",
        },
        {
          ...logDefaults,
          timestamp: "2024-01-09T12:00:00Z",
          symbol: "AAPL",
          horizon: "5d",
          trigger: "scheduled_check_no_action",
          rmse: 1.4,
          mape: 0.05,
          r2: 0.9,
          promoted: false,
          model_version: "v2",
        },
      ],
    },
  ],
};

describe("ModelDiagnostics", () => {
  it("shows a skeleton loading state in the terminal console", () => {
    render(<ModelDiagnostics diagnostics={null} loading={true} onRetrain={vi.fn()} />);
    expect(screen.getByTestId("diagnostics-skeleton")).toBeInTheDocument();
  });

  it("shows an empty state when no models are tracked yet", () => {
    render(
      <ModelDiagnostics
        diagnostics={{
          generated_at: "2024-01-11T00:00:00Z",
          drift_skill_floor: -0.1,
          drift_psi_threshold: 0.2,
          models: [],
        }}
        loading={false}
        onRetrain={vi.fn()}
      />
    );
    expect(screen.getByText(/no active models yet/i)).toBeInTheDocument();
  });

  it("renders model metrics, feature importances, and retrain log entries", () => {
    render(<ModelDiagnostics diagnostics={diagnostics} loading={false} onRetrain={vi.fn()} />);

    expect(screen.getByText(/version:/i)).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText(/rsi_14/)).toBeInTheDocument();
    expect(screen.getByText(/PROMOTED/)).toBeInTheDocument();
    expect(screen.getByText(/no-op/)).toBeInTheDocument();
  });

  it("calls onRetrain when the retrain button is clicked", async () => {
    const user = userEvent.setup();
    const onRetrain = vi.fn().mockResolvedValue(undefined);
    render(<ModelDiagnostics diagnostics={diagnostics} loading={false} onRetrain={onRetrain} />);

    await user.click(screen.getByRole("button", { name: /retrain/i }));

    expect(onRetrain).toHaveBeenCalledTimes(1);
  });

  it("shows a retraining indicator while the retrain request is in flight", async () => {
    const user = userEvent.setup();
    let resolveRetrain!: () => void;
    const onRetrain = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetrain = resolve;
        })
    );

    render(<ModelDiagnostics diagnostics={diagnostics} loading={false} onRetrain={onRetrain} />);

    await user.click(screen.getByRole("button", { name: /retrain/i }));
    expect(screen.getByText(/retraining…/i)).toBeInTheDocument();

    resolveRetrain();
    await waitFor(() => expect(screen.queryByText(/retraining…/i)).not.toBeInTheDocument());
  });

  it("wires the retrain action through to the API client's POST call", async () => {
    const user = userEvent.setup();
    const onRetrain = () => api.triggerRetrain("AAPL").then(() => undefined);

    render(<ModelDiagnostics diagnostics={diagnostics} loading={false} onRetrain={onRetrain} />);
    await user.click(screen.getByRole("button", { name: /retrain/i }));

    expect(api.triggerRetrain).toHaveBeenCalledWith("AAPL");
  });
});
