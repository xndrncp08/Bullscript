from contextlib import asynccontextmanager

# Import torch before xgboost (transitively imported by app.api.v1.router) is
# ever loaded. On macOS, XGBoost's bundled libomp initializing first and
# PyTorch's OpenMP runtime initializing afterward segfaults the process the
# first time a sentiment request lazily loads the FinBERT pipeline. Loading
# torch first avoids the conflict regardless of which endpoint is hit first.
import torch  # noqa: F401

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.core.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

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
