from datetime import date

import pandas as pd
import pytest

from app.ml import forecaster
from app.ml.trading_calendar import is_trading_day, next_trading_days, nyse_holidays

# Published NYSE full-day closures.
NYSE_2026 = {
    date(2026, 1, 1),
    date(2026, 1, 19),
    date(2026, 2, 16),
    date(2026, 4, 3),
    date(2026, 5, 25),
    date(2026, 6, 19),
    date(2026, 7, 3),  # July 4th falls on a Saturday
    date(2026, 9, 7),
    date(2026, 11, 26),
    date(2026, 12, 25),
}
NYSE_2027 = {
    date(2027, 1, 1),
    date(2027, 1, 18),
    date(2027, 2, 15),
    date(2027, 3, 26),
    date(2027, 5, 31),
    date(2027, 6, 18),  # Juneteenth falls on a Saturday
    date(2027, 7, 5),  # July 4th falls on a Sunday
    date(2027, 9, 6),
    date(2027, 11, 25),
    date(2027, 12, 24),  # Christmas falls on a Saturday
}


@pytest.mark.parametrize(("year", "expected"), [(2026, NYSE_2026), (2027, NYSE_2027)])
def test_holidays_match_the_published_schedule(year, expected):
    assert nyse_holidays(year) == expected


def test_saturday_new_year_is_not_observed_on_the_friday_before():
    # Jan 1 2022 was a Saturday; the exchange traded on Dec 31 2021.
    assert date(2021, 12, 31) not in nyse_holidays(2021)
    assert date(2022, 1, 1) not in nyse_holidays(2022)
    assert is_trading_day(date(2021, 12, 31))


def test_juneteenth_starts_in_2022():
    assert date(2021, 6, 18) not in nyse_holidays(2021)
    assert date(2022, 6, 20) in nyse_holidays(2022)


def test_next_trading_days_skip_weekends_and_holidays_across_a_year_end():
    days = next_trading_days(pd.Timestamp("2026-12-23"), 4)
    assert [d.date() for d in days] == [date(2026, 12, 24), date(2026, 12, 28), date(2026, 12, 29), date(2026, 12, 30)]

    days = next_trading_days(pd.Timestamp("2026-12-30"), 3)
    assert [d.date() for d in days] == [date(2026, 12, 31), date(2027, 1, 4), date(2027, 1, 5)]


def test_forecast_path_skips_thanksgiving():
    points = forecaster.build_path(100.0, pd.Timestamp("2026-11-24"), 0.0, 0.05, horizon_days=3, interval=0.8)
    assert [p["date"] for p in points] == [date(2026, 11, 25), date(2026, 11, 27), date(2026, 11, 30)]


def test_long_horizons_stay_on_trading_days():
    days = next_trading_days(pd.Timestamp("2026-01-02"), 300)
    assert len(days) == 300
    assert all(is_trading_day(d.date()) for d in days)
