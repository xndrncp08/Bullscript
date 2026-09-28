import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";

import { api } from "@/api/client";
import Dashboard from "@/components/Dashboard";
import ErrorBoundary from "@/components/ErrorBoundary";
import Navbar from "@/components/Navbar";
import type { ChartResponse, DiagnosticsResponse, PredictionResponse, SentimentResponse } from "@/types";

export default function App() {
  const [symbol, setSymbol] = useState("AAPL");
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [sentiment, setSentiment] = useState<SentimentResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async (targetSymbol: string) => {
    setLoading(true);
    try {
      const [chartData, sentimentData, diagnosticsData] = await Promise.all([
        api.getChart(targetSymbol),
        api.getSentiment(targetSymbol),
        api.getDiagnostics(),
      ]);
      setChart(chartData);
      setSentiment(sentimentData);
      setDiagnostics(diagnosticsData);

      try {
        const predictionData = await api.getPrediction(targetSymbol);
        setPrediction(predictionData);
      } catch {
        setPrediction(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Couldn't load data for ${targetSymbol}`;
      toast.error("Failed to load ticker", { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(symbol);
  }, [symbol, loadAll]);

  const handleRetrain = async () => {
    try {
      await api.triggerRetrain(symbol);
      toast.success(`Retrain triggered for ${symbol}`);
      await loadAll(symbol);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retrain request failed";
      toast.error("Retrain failed", { description: message });
      throw err;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-obsidian">
        <Toaster theme="dark" richColors position="bottom-right" />
        <Navbar activeSymbol={symbol} onSymbolChange={setSymbol} />
        <Dashboard
          symbol={symbol}
          chart={chart}
          prediction={prediction}
          sentiment={sentiment}
          diagnostics={diagnostics}
          loading={loading}
          onRetrain={handleRetrain}
        />
      </div>
    </ErrorBoundary>
  );
}
