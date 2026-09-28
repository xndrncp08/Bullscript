import re
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.limiter import limiter
from app.models.schemas import SYMBOL_PATTERN, QuotesResponse
from app.services.data_fetcher import fetch_quotes

router = APIRouter(prefix="/market", tags=["market"])

MAX_SYMBOLS = 25
_SYMBOL_RE = re.compile(SYMBOL_PATTERN)


def _parse_symbols(raw: str) -> list[str]:
    symbols: list[str] = []
    for part in raw.split(","):
        symbol = part.strip().upper()
        if not symbol:
            continue
        if not _SYMBOL_RE.match(symbol):
            raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol!r}")
        if symbol not in symbols:
            symbols.append(symbol)

    if not symbols:
        raise HTTPException(status_code=422, detail="At least one symbol is required")
    if len(symbols) > MAX_SYMBOLS:
        raise HTTPException(
            status_code=422, detail=f"At most {MAX_SYMBOLS} symbols per request"
        )
    return symbols


@router.get("/quotes", response_model=QuotesResponse)
@limiter.limit("30/minute")
def get_quotes(
    request: Request,
    symbols: Annotated[str, Query(description="Comma-separated symbols", max_length=400)],
):
    return QuotesResponse(
        generated_at=datetime.now(timezone.utc),
        quotes=fetch_quotes(_parse_symbols(symbols)),
    )
