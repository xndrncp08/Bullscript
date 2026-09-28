from app.services.cache import TTLCache


class FakeClock:
    def __init__(self):
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


def test_value_is_served_until_it_expires():
    clock = FakeClock()
    cache = TTLCache(ttl_seconds=60, clock=clock)
    cache.set("AAPL", 1)

    clock.now += 59.9
    assert cache.get("AAPL") == 1

    clock.now += 0.1
    assert cache.get("AAPL") is None
    assert len(cache) == 0


def test_missing_key_returns_the_default():
    cache = TTLCache(ttl_seconds=60)
    assert cache.get("nope", default="fallback") == "fallback"


def test_falsy_values_are_cached():
    cache = TTLCache(ttl_seconds=60)
    cache.set("empty", [])
    assert cache.get("empty", default="missing") == []


def test_least_recently_used_entry_is_evicted_at_capacity():
    cache = TTLCache(ttl_seconds=60, max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # touch "a" so "b" is now the oldest
    cache.set("c", 3)

    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("c") == 3


def test_setting_again_refreshes_the_expiry():
    clock = FakeClock()
    cache = TTLCache(ttl_seconds=10, clock=clock)
    cache.set("k", "old")
    clock.now += 8
    cache.set("k", "new")
    clock.now += 8
    assert cache.get("k") == "new"


def test_clear_empties_the_cache():
    cache = TTLCache(ttl_seconds=60)
    cache.set("a", 1)
    cache.clear()
    assert len(cache) == 0
