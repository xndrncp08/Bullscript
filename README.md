# BullScript

A market intelligence terminal: live quotes and candlestick charts, per-horizon
price forecasts from a self-monitoring, self-retraining ML engine, and FinBERT
news sentiment — in a dense, keyboard-first, dark workspace.

![BullScript](frontend/public/brand/bullscript-logo.png)

> Forecasts are statistical estimates scored against a random walk, not
> investment advice. Most equities are close to unpredictable over days to
> weeks; the terminal shows that honestly rather than hiding it.

## Quick start

```bash
# backend — Python 3.10+
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000

# frontend — Node 22.12+
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api to :8000
```

A symbol's first forecast trains and persists its models under
`backend/data/models/` (a few seconds); after that they're served from disk and
kept current by the scheduler.

## Architecture

```
backend/                     FastAPI + ML engine
├── main.py                  app, CORS, rate limiting, scheduler lifecycle
└── app/
    ├── api/v1/              ticker · model · market routers
    ├── ml/
    │   ├── features.py      indicators + 16 scale-free model features
    │   ├── evaluation.py    purged train | calibration | holdout split, scoring
    │   ├── estimators.py    calibrated shrinkage wrapper
    │   ├── pipeline.py      monitor → retrain → promote cycle, training locks
    │   ├── drift.py         out-of-range drift reference and score
    │   ├── forecaster.py    forecast paths and intervals
    │   ├── model_store.py   versioned, atomically written models + logs
    │   └── sentiment.py     FinBERT with an offline fallback
    ├── services/            yfinance fetcher + TTL cache
    ├── core/                scheduler, rate limiter
    └── models/schemas.py    API contract
frontend/src/
├── app/                     App shell, boot sequence, ambient backdrop
├── features/
│   ├── chart/               SVG candlestick chart over a pure geometry model
│   ├── command/             command bar, ⌘K palette, market clock
│   ├── market/              ticker tape, watchlist, instrument header
│   ├── intel/               forecast and sentiment panels
│   └── telemetry/           model health, retrain console, network log
├── components/primitives/   Panel, SegmentedControl, Delta, Sparkline, loaders
├── hooks/                   race-safe data loading, quotes polling, retrain
├── lib/                     API client, telemetry store, chart math, formatting
└── motion/tokens.ts         spring presets
```

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/ticker/{symbol}/chart` | ~3 years of daily OHLCV + indicators |
| GET | `/api/v1/ticker/{symbol}/prediction` | 5d/14d/30d paths, 80% intervals, hit rate, skill, signal weight |
| GET | `/api/v1/ticker/{symbol}/sentiment` | FinBERT-scored headlines + recency-weighted index |
| GET | `/api/v1/model/diagnostics?symbol=` | holdout metrics, live monitoring, drift checks, retrain log |
| POST | `/api/v1/model/retrain` | retrain a symbol's horizons now |
| GET | `/api/v1/market/quotes?symbols=` | batch quotes with 1-month sparklines (≤25 symbols) |

Symbols are validated (`^[A-Za-z0-9.^=-]{1,12}$`), requests are rate limited
per client, and upstream data is cached (history/news 5 min, quotes 1 min).

## Forecast engine

Each `(symbol, horizon)` gets an XGBoost model predicting the **log return**
over the horizon from 16 **scale-free** features — RSI, MACD / price,
Bollinger %B and width, distance from EMA 20/50/200, ATR %, realised
volatility, trailing returns, volume ratio. Tree ensembles can't extrapolate,
so a model fed raw prices forecasts a collapse whenever a stock makes new
highs; a property test asserts the features are identical at 10× the price.

**Evaluate the procedure, deploy a refit.**

1. History is split chronologically into **train | calibration | holdout**
   with a horizon-sized purge before each boundary, so no segment's targets
   overlap the next.
2. The model early-stops on calibration, which also fits a **shrinkage
   weight** `w ∈ [0, 1]` (realised ≈ w · predicted). No out-of-sample signal
   means `w → 0`: the forecast degrades to "no change" rather than a confident
   wrong call.
3. The holdout is scored once. These are the reported metrics.
4. The deployed model is then refit on **all** labelled history with the
   early-stopped tree count and calibrated weight, so it has seen the current
   regime.

| Metric | Meaning |
|---|---|
| `skill` | `1 − RMSE / RMSE(random walk)`. Above 0 beats "price stays put" — the honest headline. |
| `hit_rate` | Share of calls with the right direction |
| `rmse`, `mape`, `r2` | Price-space errors; price-level R² flatters any persistent series, so read it next to skill |

Paths are geometric to the target on NYSE trading days; the 80% interval comes
from the holdout residual spread, widening with `√(k/h)`.

## Self-training loop

The scheduler (`BULLSCRIPT_RETRAIN_CHECK_INTERVAL_MINUTES`, default 60)
monitors every deployed model and retrains on:

- **performance drift** — skill on bars that arrived *after* the model's
  training window (purged by one horizon, once ≥ 20 exist) falls below
  `BULLSCRIPT_DRIFT_SKILL_FLOOR` (default −0.10). True live monitoring, not a
  re-score of data it has seen.
- **data drift** — more than `BULLSCRIPT_DRIFT_OOD_THRESHOLD` (default 10%) of
  recent feature values fall outside the central 99% of what the model was
  fit on. Trees fail on extrapolation, so that's the risk measured. PSI isn't
  used: on these slow, autocorrelated features, 60-bar windows drawn from the
  training data *itself* score a median PSI of ~1, so its usual 0.2 threshold
  fires permanently.
- **schema upgrade** — the model was persisted under an older contract.

A challenger is promoted unless its skill trails the incumbent's best evidence
(live skill, else holdout skill) by more than 5 points. Training is serialised
per model, files are written atomically, and every cycle — promotion, kept
incumbent, or no-op — is logged and shown in the terminal's retrain console.

## The terminal

- **⌘K / Ctrl-K** or **/** opens the command palette: symbols by ticker or
  company name (with live quotes), any valid Yahoo symbol, and commands —
  retrain, horizon, range, chart type, watchlist, theme, colorblind palette.
- **Chart**: candles/line/table; ranges 1M–3Y; EMA 20/50 and Bollinger
  overlays; stacked price, volume and RSI panes; the forecast path and band to
  the right of NOW. Focus it and use **← →** to inspect bars, **Esc** to clear.
- **Telemetry dock**: model health, feature importance, a live retrain
  console, and a NETWORK tab of the client's own API traffic.
- Workspace state (symbol, horizon, range, overlays, watchlist) persists.

### Design system

Tokens are CSS variables (`frontend/src/index.css`) with dark and light themes.
Chart series colors were chosen by running palette checks — lightness band,
chroma floor, colorblind and normal-vision separation, contrast — in both
themes. Red/green up/down fails deuteranopia outright (ΔE 3.4), so direction is
also carried by hollow (up) vs solid (down) candles and ▲/▼ on every signed
number, and a blue/orange palette is one command away.

### Motion

| What | How | Why |
|---|---|---|
| Candle rise, forecast reveal | CSS keyframes, once per dataset | State change; stays smooth while the main thread parses data |
| Symbol switch | previous chart held dimmed + scan bar | No skeleton flash on refetch |
| First load | kinetic loader listing the real requests | Shows actual progress |
| Boot (once per session) | emblem morphs into the command bar | Spatial continuity |
| Tabs, segments, gauge needle | springs | Interruptible / physical |
| ⌘K palette | none | Summoned constantly; animation would be latency |

Reduced motion keeps fades and drops movement.

## Testing

```bash
cd backend && ruff check . && python -m pytest          # 123 tests
cd frontend && npm run lint && npx tsc -b && npm run test && npx vite build   # 152 tests
```

CI (`.github/workflows/ci.yml`) runs both on pushes to `main`, `feature/**`
and `fix/**` and on pull requests. The backend job uses the lean
`requirements-test.txt` — FinBERT is mocked, and the offline fallback means
torch isn't needed.

## Configuration

| Variable | Default | |
|---|---|---|
| `BULLSCRIPT_RETRAIN_CHECK_INTERVAL_MINUTES` | 60 | scheduler cadence |
| `BULLSCRIPT_DRIFT_SKILL_FLOOR` | −0.10 | live-skill drift floor |
| `BULLSCRIPT_DRIFT_OOD_THRESHOLD` | 0.1 | out-of-range drift threshold |
| `BULLSCRIPT_FORECAST_INTERVAL` | 0.8 | forecast interval coverage |

Market data comes from Yahoo Finance via `yfinance` (unofficial, may be
delayed). Session status and forecast dates follow the NYSE holiday calendar;
early closes aren't modelled.
