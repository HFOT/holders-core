"""Catalyst Explorer API クライアント。取得のみ。加工はしない。"""
from __future__ import annotations

import json
import time
import urllib.request
from typing import Any, Callable, Iterator

BASE = "https://www.catalystexplorer.com/api"
PROPOSALS_URL = f"{BASE}/proposals"
FUNDS_URL = f"{BASE}/funds"

USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"
DEFAULT_SLEEP = 0.3


def fetch_json(url: str, *, opener: Any = None) -> Any:
    req = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def iter_proposal_pages(
    *,
    fetch: Callable[..., Any] = fetch_json,
    sleep: float = DEFAULT_SLEEP,
    max_pages: int | None = None,
) -> Iterator[dict]:
    page = 1
    while True:
        payload = fetch(f"{PROPOSALS_URL}?page={page}")
        yield payload
        last = payload.get("last_page", page)
        if max_pages is not None and page >= max_pages:
            return
        if page >= last:
            return
        page += 1
        if sleep:
            time.sleep(sleep)


def fetch_all_proposals(**kw: Any) -> list[dict]:
    out: list[dict] = []
    for payload in iter_proposal_pages(**kw):
        out.extend(payload.get("data", []))
    return out


def fetch_funds(*, fetch: Callable[..., Any] = fetch_json) -> list[dict]:
    return fetch(FUNDS_URL)
