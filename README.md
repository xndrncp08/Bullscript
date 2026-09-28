# BullScript

Real-time stock market analytics platform with a self-training ML forecasting
engine and Hugging Face FinBERT news sentiment analysis.

![BullScript](frontend/public/brand/bullscript-logo.png)

## Architecture

```
bullscript/
├── backend/          FastAPI + ML engine (Python 3.10+)
│   ├── app/
│   │   ├── api/v1/       REST endpoints
│   │   ├── ml/           features, sentiment, self-training pipeline, forecaster
│   │   ├── services/     market data fetching (yfinance)
│   │   ├── core/         background scheduler
│   │   └── models/       Pydantic schemas
│   ├── data/models/      persisted model binaries + retrain logs (gitignored)
│   └── main.py
└── frontend/         React + TypeScript + Tailwind (Vite)
    └── src/
        ├── components/   Navbar, Dashboard, PredictionChart, ModelDiagnostics, SentimentCard
        ├── api/          typed API client
        └── types/        shared TS types
```

## Backend setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

First request to `/prediction` or `/model/retrain` for a symbol will lazily
train and persist that symbol's models under `backend/data/models/`.

### API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/ticker/{symbol}/chart` | OHLCV history + technical indicators |
| GET | `/api/v1/ticker/{symbol}/prediction` | 5d/14d/30d forecast paths with 80% intervals, skill, hit rate |
| GET | `/api/v1/ticker/{symbol}/sentiment` | FinBERT news sentiment breakdown |
| GET | `/api/v1/model/diagnostics?symbol=` | Model versions, holdout metrics, drift checks, retrain history |
| POST | `/api/v1/model/retrain` | Manually trigger a retrain for a symbol |

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api/*` to `http://localhost:8000` (see `vite.config.ts`).

## Forecast engine

Each `(symbol, horizon)` pair gets its own XGBoost model predicting the **log
return** over the horizon from 16 **scale-free** features (RSI, MACD / price,
Bollinger %B and width, distance from EMA 20/50/200, ATR %, realised
volatility, trailing returns, volume ratio). Training on returns rather than
price levels matters: tree ensembles can't extrapolate, so a model fed raw
prices forecasts a collapse whenever a stock trades at new highs.

History is split chronologically into **train | calibration | holdout**, with
a horizon-sized purge before each boundary so no segment's targets overlap the
next. The model early-stops on the calibration window, which also fits a
**shrinkage weight** `w ∈ [0, 1]`: a model with no out-of-sample signal gets
`w → 0` and forecasts "no change" instead of a confident wrong call. The
holdout is scored once, in price space:

| Metric | Meaning |
|---|---|
| `skill` | `1 − RMSE / RMSE(random walk)`. > 0 beats "price stays put". The honest headline — most equities sit near 0. |
| `hit_rate` | Share of holdout calls with the right direction |
| `rmse`, `mape`, `r2` | Price-space errors (R² is flattering for any persistent series; read it next to skill) |

Forecast paths are geometric to the target on business days, with an 80%
interval from the model's own holdout residual spread, widening with `√(k/h)`.

## Self-training loop

`backend/app/core/scheduler.py` runs every
`BULLSCRIPT_RETRAIN_CHECK_INTERVAL_MINUTES` (default 60) and re-checks each
tracked model against fresh data. A challenger is trained when:

- **performance drift** — holdout skill falls below `BULLSCRIPT_DRIFT_SKILL_FLOOR` (default −0.10)
- **data drift** — mean PSI of the recent 60-bar feature window against the
  training distribution exceeds `BULLSCRIPT_DRIFT_PSI_THRESHOLD` (default 0.2)
- **schema upgrade** — the persisted model was trained on a retired feature set

The challenger is promoted only if it matches or beats the incumbent on the
same holdout, so a retrain can never make the live model worse. Every cycle —
promotion, kept incumbent, or no-op — is appended to
`backend/data/models/retrain_log.jsonl` and surfaced via
`GET /api/v1/model/diagnostics`.

## Design system

| Token | Value |
|---|---|
| Background | `#0B0E11` / `#0D0F12` |
| Card | `#161A22`, border `#1E262C` |
| Bullish accent | `#00E676` → `#00C853` |
| Bearish accent | `#FF3B30` / `#FF5252` |
| Text | `#FFFFFF` primary, `#8A99AD` secondary |
