import { useCallback, useEffect, useState } from "react";

import { api } from "@/api/client";
import Dashboard from "@/components/Dashboard";
import Navbar from "@/components/Navbar";
import type { ChartResponse, DiagnosticsResponse, PredictionResponse, SentimentResponse } from "@/types";

export default function App() {
  const [symbol, setSymbol] = useState("AAPL");
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [sentiment, setSentiment] = useState<SentimentResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (targetSymbol: string) => {
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Failed to load ticker data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(symbol);
  }, [symbol, loadAll]);

  const handleRetrain = async () => {
    await api.triggerRetrain(symbol);
    await loadAll(symbol);
  };

  return (
    <div className="min-h-screen bg-obsidian">
      <Navbar activeSymbol={symbol} onSymbolChange={setSymbol} />

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-bear/40 bg-bear/10 px-4 py-2 text-sm text-bear">
          {error}
        </div>
      )}

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
  );
}
