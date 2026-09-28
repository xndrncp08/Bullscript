import type { ChartResponse, DiagnosticsResponse, PredictionResponse, SentimentResponse } from "@/types";

import ModelDiagnostics from "./ModelDiagnostics";
import PredictionChart from "./PredictionChart";
import QuickStats from "./QuickStats";
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
    <main className="mx-auto max-w-7xl space-y-4 p-6">
      <h1 className="font-mono text-2xl font-bold text-primary">{symbol}</h1>

      <QuickStats chart={chart} sentiment={sentiment} loading={loading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="h-[440px]">
            <PredictionChart chart={chart} prediction={prediction} loading={loading} />
          </div>
        </div>

        <div className="h-[480px] lg:h-[440px]">
          <SentimentCard sentiment={sentiment} loading={loading} />
        </div>

        <div className="lg:col-span-3">
          <div className="h-[420px]">
            <ModelDiagnostics diagnostics={diagnostics} loading={loading} onRetrain={onRetrain} />
          </div>
        </div>
      </div>
    </main>
  );
}
