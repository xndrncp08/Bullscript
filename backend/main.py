from contextlib import asynccontextmanager

# Import torch before xgboost (transitively imported by app.api.v1.router) is
# ever loaded, if torch is installed at all. On macOS, XGBoost's bundled
# libomp initializing first and PyTorch's OpenMP runtime initializing
# afterward segfaults the process the first time a sentiment request lazily
# loads the FinBERT pipeline. Loading torch first avoids the conflict
# regardless of which endpoint is hit first. In lean environments without
# torch installed (e.g. CI's requirements-test.txt), sentiment.py's fallback
# to a mock scorer never loads torch either, so there's no conflict to avoid.
try:
    import torch  # noqa: F401
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.core.limiter import limiter
from app.core.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {"status": "ok", "service": settings.app_name}


@app.get("/health")
def health():
    return {"status": "healthy"}
