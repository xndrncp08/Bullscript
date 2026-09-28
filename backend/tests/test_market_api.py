from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import market as market_route
from main import app

client = TestClient(app)


@pytest.fixture
def served_quotes(monkeypatch):
    requested = []

    def fake_fetch_quotes(symbols):
        requested.append(symbols)
        return [
            {
                "symbol": s,
                "price": 100.0,
                "previous_close": 99.0,
                "change": 1.0,
                "change_pct": 0.0101,
                "volume": 1_000,
                "as_of": date(2024, 1, 4),
                "sparkline": [98.0, 99.0, 100.0],
            }
            for s in symbols
        ]

    monkeypatch.setattr(market_route, "fetch_quotes", fake_fetch_quotes)
    return requested


def test_quotes_endpoint_returns_quotes_in_request_order(served_quotes):
    response = client.get("/api/v1/market/quotes", params={"symbols": "msft, aapl"})

    assert response.status_code == 200
    body = response.json()
    assert [q["symbol"] for q in body["quotes"]] == ["MSFT", "AAPL"]
    assert body["quotes"][0]["sparkline"] == [98.0, 99.0, 100.0]


def test_duplicate_and_blank_symbols_are_collapsed(served_quotes):
    client.get("/api/v1/market/quotes", params={"symbols": "AAPL,,aapl, MSFT,"})
    assert served_quotes == [["AAPL", "MSFT"]]


@pytest.mark.parametrize(
    "symbols",
    ["", " , ", "AAPL,../etc", "AAPL;MSFT", ",".join(f"S{i}" for i in range(26))],
)
def test_invalid_symbol_lists_are_rejected(served_quotes, symbols):
    response = client.get("/api/v1/market/quotes", params={"symbols": symbols})
    assert response.status_code == 422
    assert served_quotes == []


def test_symbols_parameter_is_required():
    assert client.get("/api/v1/market/quotes").status_code == 422
