import axios from "axios";

import type {
  ChartResponse,
  DiagnosticsResponse,
  PredictionResponse,
  SentimentResponse,
} from "@/types";

const client = axios.create({ baseURL: "/api/v1" });

export const api = {
  getChart: (symbol: string) =>
    client.get<ChartResponse>(`/ticker/${symbol}/chart`).then((r) => r.data),

  getPrediction: (symbol: string) =>
    client.get<PredictionResponse>(`/ticker/${symbol}/prediction`).then((r) => r.data),

  getSentiment: (symbol: string) =>
    client.get<SentimentResponse>(`/ticker/${symbol}/sentiment`).then((r) => r.data),

  getDiagnostics: () =>
    client.get<DiagnosticsResponse>(`/model/diagnostics`).then((r) => r.data),

  triggerRetrain: (symbol: string, horizons?: string[]) =>
    client.post(`/model/retrain`, { symbol, horizons }).then((r) => r.data),
};
