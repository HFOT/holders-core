"""ADA の日次価格。約束された価値と、実際に受け取った価値を分けて読むために使う。

Catalyst は ADA 建てで採択し、マイルストーンの承認ごとに支払う。
採択から支払いまでの間に相場が動けば、同じ ADA 額でも受け取った価値は変わる。
その差は提案者の責任ではないし、成果とも関係がない。だが確かに起きたことである。

取得元は Binance の日足（ADAUSDT）。取引所の終値であり、公式の指標ではない。
2021-01-01 以降しか無い。それ以前の Fund は測らない。

換算した値は「その日の終値で計算するといくらか」であって、
実際にいくら換金したかではない。提案者がいつ換金したかは記録に無い。
"""
from __future__ import annotations

import json
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

URL = "https://api.binance.com/api/v3/klines"
SYMBOL = "ADAUSDT"
SOURCE = "Binance ADAUSDT 日足の終値"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"

# この日より前は取れない。それ以前の Fund は換算しない。
FIRST_DAY = date(2021, 1, 1)
LIMIT = 1000
DEFAULT_SLEEP = 0.3


def fetch_json(url: str, *, opener: Any = None) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def harvest(
    *,
    fetch: Callable[..., Any] = fetch_json,
    sleep: float = DEFAULT_SLEEP,
    start: date = FIRST_DAY,
    end: date | None = None,
) -> dict[str, float]:
    """日付 → 終値。取れた日だけを返す。無い日は作らない。"""
    end = end or date.today()
    out: dict[str, float] = {}
    cursor = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp() * 1000)
    stop = int(datetime(end.year, end.month, end.day, tzinfo=timezone.utc).timestamp() * 1000)

    while cursor <= stop:
        rows = fetch(f"{URL}?symbol={SYMBOL}&interval=1d&startTime={cursor}&limit={LIMIT}")
        if not rows:
            break
        for row in rows:
            day = datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc).date()
            out[day.isoformat()] = float(row[4])  # 終値
        last = rows[-1][0]
        if last <= cursor:
            break
        cursor = last + 86_400_000
        if sleep:
            time.sleep(sleep)
    return out


# 前後どこまで探すか。これを超えて離れた日の値では埋めない。
MAX_GAP_DAYS = 7


def price_on(prices: dict[str, float], day: str | None) -> float | None:
    """その日の終値。記録が無ければ前後の記録から直線で補間する。

    直前だけを見て遡ると、休みを挟んだとき古い側へ寄る。前後を見て按分する。
    前後どちらかしか無ければ、その値をそのまま使う。
    どちらも MAX_GAP_DAYS より遠ければ諦める。遠い日の値で埋めない。
    """
    if not day:
        return None
    try:
        d = date.fromisoformat(str(day)[:10])
    except ValueError:
        return None

    exact = prices.get(d.isoformat())
    if exact is not None:
        return exact

    before = after = None
    for back in range(1, MAX_GAP_DAYS + 1):
        got = prices.get((d - timedelta(days=back)).isoformat())
        if got is not None:
            before = (back, got)
            break
    for fwd in range(1, MAX_GAP_DAYS + 1):
        got = prices.get((d + timedelta(days=fwd)).isoformat())
        if got is not None:
            after = (fwd, got)
            break

    if before and after:
        span = before[0] + after[0]
        # 近いほうに重みが乗るよう、距離で按分する。
        return before[1] + (after[1] - before[1]) * (before[0] / span)
    if before:
        return before[1]
    if after:
        return after[1]
    return None
