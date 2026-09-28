import type { ChartResponse, DiagnosticsResponse, PredictionResponse, SentimentResponse } from "@/types";

import ModelDiagnostics from "./ModelDiagnostics";
import PredictionChart from "./PredictionChart";
import SentimentCard from "./SentimentCard";

interface DashboardProps {
  symbol: string;
  chart: ChartResponse | null;
  prediction: PredictionResponse | null;
  sentiment: SentimentResponse | null;
  diagnostics: DiagnosticsResponse | null;
  loading: boolean;
  onRetrain: () => Promise<void>;
}

export default function Dashboard({
  symbol,
  chart,
  prediction,
  sentiment,
  diagnostics,
  loading,
  onRetrain,
}: DashboardProps) {
  return (
    <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-white">{symbol}</h1>
          {prediction && (
            <span className="text-sm text-slate-text">
              last close ${prediction.last_close.toFixed(2)}
            </span>
          )}
        </div>
        <div className="h-[420px]">
          <PredictionChart chart={chart} prediction={prediction} loading={loading} />
        </div>
      </div>

      <div className="h-[480px]">
        <SentimentCard sentiment={sentiment} loading={loading} />
      </div>

      <div className="lg:col-span-3 h-[360px]">
        <ModelDiagnostics diagnostics={diagnostics} loading={loading} onRetrain={onRetrain} />
      </div>
    </main>
  );
}
