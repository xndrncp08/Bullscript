"""NYSE full-day holidays, computed from the exchange's rules.

Weekend holidays move to the adjacent weekday (Saturday -> Friday, Sunday ->
Monday), except New Year's Day on a Saturday, which isn't observed at all
because the Friday before closes a fiscal year. Early closes and one-off
closures (national days of mourning) aren't modelled.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

import pandas as pd


def _easter(year: int) -> date:
    """Gregorian Easter Sunday (anonymous Gregorian algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month, day = divmod(h + ell - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    last = date(year + month // 12, month % 12 + 1, 1) - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(day: date) -> date:
    if day.weekday() == 5:
        return day - timedelta(days=1)
    if day.weekday() == 6:
        return day + timedelta(days=1)
    return day


MON, THU = 0, 3


@lru_cache(maxsize=64)
def nyse_holidays(year: int) -> frozenset[date]:
    days = {
        _nth_weekday(year, 1, MON, 3),  # Martin Luther King Jr. Day
        _nth_weekday(year, 2, MON, 3),  # Washington's Birthday
        _easter(year) - timedelta(days=2),  # Good Friday
        _last_weekday(year, 5, MON),  # Memorial Day
        _observed(date(year, 7, 4)),  # Independence Day
        _nth_weekday(year, 9, MON, 1),  # Labor Day
        _nth_weekday(year, 11, THU, 4),  # Thanksgiving
        _observed(date(year, 12, 25)),  # Christmas
    }
    new_year = date(year, 1, 1)
    if new_year.weekday() != 5:
        days.add(_observed(new_year))
    if year >= 2022:
        days.add(_observed(date(year, 6, 19)))  # Juneteenth
    return frozenset(days)


def is_trading_day(day: date) -> bool:
    return day.weekday() < 5 and day not in nyse_holidays(day.year)


def next_trading_days(after: pd.Timestamp, count: int) -> pd.DatetimeIndex:
    """The `count` NYSE sessions following `after`."""
    start = pd.Timestamp(after).normalize()
    # a year of headroom covers any horizon this app forecasts
    years = range(start.year, start.year + count // 250 + 2)
    holidays = sorted(d for y in years for d in nyse_holidays(y))
    offset = pd.offsets.CustomBusinessDay(holidays=holidays)
    return pd.date_range(start + offset, periods=count, freq=offset)
