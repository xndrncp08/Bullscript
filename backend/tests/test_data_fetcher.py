import numpy as np
import pandas as pd
import pytest

from app.services import data_fetcher


class FakeTicker:
    history_calls = 0

    def __init__(self, symbol):
        self.symbol = symbol

    def history(self, **kwargs):
        FakeTicker.history_calls += 1
        index = pd.date_range("2024-01-01", periods=5, freq="B", tz="America/New_York")
        return pd.DataFrame(
            {
                "Open": [1.0, 2.0, np.nan, 4.0, 5.0],
                "High": [1.5, 2.5, 3.5, 4.5, 5.5],
                "Low": [0.5, 1.5, 2.5, 3.5, 4.5],
                "Close": [1.2, 2.2, 3.2, 4.2, 5.2],
                "Volume": [10, 20, 30, 40, 50],
                "Dividends": 0.0,
            },
            index=index,
        )


@pytest.fixture
def fake_yahoo(monkeypatch):
    FakeTicker.history_calls = 0
    monkeypatch.setattr(data_fetcher.yf, "Ticker", FakeTicker)
    return FakeTicker


def test_history_is_normalised(fake_yahoo):
    df = data_fetcher.fetch_price_history("aapl")

    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert df.index.tz is None
    assert df.index.name == "date"
    # the session with a missing open is dropped rather than poisoning indicators
    assert len(df) == 4


def test_history_is_cached_across_calls_and_case(fake_yahoo):
    data_fetcher.fetch_price_history("AAPL")
    data_fetcher.fetch_price_history("aapl")
    assert fake_yahoo.history_calls == 1


def test_cached_history_cannot_be_mutated_by_a_caller(fake_yahoo):
    first = data_fetcher.fetch_price_history("AAPL")
    first["close"] = 0.0

    second = data_fetcher.fetch_price_history("AAPL")
    assert second["close"].iloc[-1] == pytest.approx(5.2)


def _batch_frame(symbols_with_closes: dict[str, list[float]], swap_levels: bool = False):
    index = pd.date_range("2024-01-01", periods=4, freq="B")
    columns = {}
    for symbol, closes in symbols_with_closes.items():
        columns[(symbol, "Close")] = closes
        columns[(symbol, "Volume")] = [100, 200, 300, 400]
    frame = pd.DataFrame(columns, index=index)
    if swap_levels:
        frame.columns = frame.columns.swaplevel(0, 1)
    return frame


@pytest.mark.parametrize("swap_levels", [False, True])
def test_build_quotes_summarises_each_symbol(swap_levels):
    frame = _batch_frame({"AAPL": [100.0, 101.0, 102.0, 104.0]}, swap_levels)

    quote = data_fetcher.build_quotes(frame, ["AAPL"])["AAPL"]

    assert quote["price"] == 104.0
    assert quote["previous_close"] == 102.0
    assert quote["change"] == 2.0
    assert quote["change_pct"] == pytest.approx(2 / 102, rel=1e-5)
    assert quote["volume"] == 400
    assert quote["sparkline"] == [100.0, 101.0, 102.0, 104.0]
    assert quote["as_of"].isoformat() == "2024-01-04"


def test_build_quotes_skips_unknown_symbols():
    frame = _batch_frame(
        {"AAPL": [1.0, 2.0, 3.0, 4.0], "ZZZZ": [np.nan, np.nan, np.nan, np.nan]}
    )
    assert set(data_fetcher.build_quotes(frame, ["AAPL", "ZZZZ", "NOPE"])) == {"AAPL"}


def test_fetch_quotes_only_downloads_symbols_missing_from_the_cache(monkeypatch):
    requested = []

    def fake_download(tickers, **kwargs):
        requested.append(list(tickers))
        return _batch_frame({t: [10.0, 11.0, 12.0, 13.0] for t in tickers})

    monkeypatch.setattr(data_fetcher.yf, "download", fake_download)

    data_fetcher.fetch_quotes(["AAPL"])
    quotes = data_fetcher.fetch_quotes(["msft", "AAPL"])

    assert requested == [["AAPL"], ["MSFT"]]
    assert [q["symbol"] for q in quotes] == ["MSFT", "AAPL"]


def test_unknown_symbols_are_negatively_cached(monkeypatch):
    requested = []

    def fake_download(tickers, **kwargs):
        requested.append(list(tickers))
        return _batch_frame({"AAPL": [10.0, 11.0, 12.0, 13.0]})

    monkeypatch.setattr(data_fetcher.yf, "download", fake_download)

    first = data_fetcher.fetch_quotes(["AAPL", "ZZZZ"])
    second = data_fetcher.fetch_quotes(["AAPL", "ZZZZ"])

    assert requested == [["AAPL", "ZZZZ"]]
    assert [q["symbol"] for q in first] == [q["symbol"] for q in second] == ["AAPL"]
