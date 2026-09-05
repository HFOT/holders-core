"""地域の層。projectcatalyst.io 公式 global map の埋め込みデータを取得し、整形する。

このモジュールが扱うのは Catalyst Explorer API ではない。
台帳（LEDGER）とは別の情報源であり、粒度も対象も違う。混ぜない。

- 公式マップが持つのは「国ごとの集計」だけである。提案ごとの位置情報は存在しない。
- 対象は採択済みの提案のみ。台帳 11,385 件のうちごく一部にしか対応しない。
- 公式データには重複・表記ゆれ・国でない項目が含まれる。ここでは直さない。印を付けるだけ。

推測で埋めない。名寄せもしない。壊れているものは壊れたまま出す。
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Any, Callable

SOURCE_URL = "https://projectcatalyst.io/global-map"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"

_NEXT_DATA = re.compile(
    r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL
)

CONTINENT_JA = {
    "Africa": "アフリカ",
    "Asia": "アジア",
    "Europe": "ヨーロッパ",
    "North America": "北アメリカ",
    "Oceania": "オセアニア",
    "South America": "南アメリカ",
}

COUNT_KEYS = {
    "funded": "totalProjectsFunded",
    "completed": "totalProjectsCompleted",
    "in_progress": "totalProjectsInProgress",
    "cancelled": "totalProjectsCancelled",
    "onboarding": "totalProjectsOnboarding",
}


def fetch_html(url: str = SOURCE_URL, *, opener: Any = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def extract(html: str) -> list[dict]:
    """埋め込み JSON から continents を取り出す。取れなければ例外。推測で補わない。"""
    m = _NEXT_DATA.search(html)
    if not m:
        raise ValueError("__NEXT_DATA__ が見つからない。公式マップの構造が変わった可能性がある")
    payload = json.loads(m.group(1))
    continents = payload["props"]["pageProps"]["data"]["continents"]
    if not isinstance(continents, list) or not continents:
        raise ValueError("continents が空。公式マップの構造が変わった可能性がある")
    return continents


def harvest(*, fetch: Callable[..., str] = fetch_html) -> list[dict]:
    return extract(fetch())


# --- 整形 ------------------------------------------------------------------


def _money(funding: dict | None, key: str) -> int:
    """USD の最小単位を整数で返す。通貨が USD 以外なら例外。換算はしない。"""
    total = 0
    for entry in (funding or {}).get(key) or []:
        if entry.get("code") != "USD":
            raise ValueError(f"USD 以外の通貨が現れた: {entry.get('code')}")
        total += int(entry["amount"])
    return total


def _counts(node: dict) -> dict:
    src = node.get("counts") or {}
    return {k: int(src.get(v) or 0) for k, v in COUNT_KEYS.items()}


def _funding(node: dict) -> dict:
    return {
        "distributed": _money(node.get("funding"), "totalDistributedToDate"),
        "requested": _money(node.get("funding"), "totalRequested"),
        "remaining": _money(node.get("funding"), "totalRemaining"),
    }


def _notes_for(name: str, notes: dict) -> list[str]:
    return list(notes.get(name.strip().lower()) or [])


def shape(
    continents: list[dict],
    notes: dict | None = None,
    aliases: dict | None = None,
) -> dict:
    """公式データを、欠陥に印を付けた形へ整える。値そのものは書き換えない。

    `aliases` は公式の国名から地図データ側の国名への対応表。名前は書き換えず、
    照合先を `map` として並記するだけにする。対応が無ければ元の名前をそのまま置く。
    """
    notes = notes or {}
    aliases = aliases or {}
    conts: list[dict] = []
    countries: list[dict] = []
    seen: dict[str, list[str]] = {}
    folded: dict[str, set[str]] = {}

    for c in continents:
        rows = c.get("countries") or []
        for k in rows:
            name = k["name"]
            seen.setdefault(name, []).append(c["name"])
            folded.setdefault(name.strip().lower(), set()).add(name)
        conts.append(
            {
                "name": c["name"],
                "name_ja": CONTINENT_JA.get(c["name"], c["name"]),
                "slug": c.get("slug"),
                "counts": _counts(c),
                "funding": _funding(c),
                "rows_listed": len(rows),
                "rows_sum_funded": sum(_counts(k)["funded"] for k in rows),
                "rows_sum_distributed": sum(
                    _money(k.get("funding"), "totalDistributedToDate") for k in rows
                ),
            }
        )

    continent_names = {c["name"] for c in continents}

    for c in continents:
        for k in c.get("countries") or []:
            name = k["name"]
            flags = _notes_for(name, notes)
            if len(seen[name]) > 1:
                flags.append("duplicate")
            if len(folded[name.strip().lower()]) > 1:
                flags.append("case_variant")
            if name in continent_names:
                flags.append("continent_as_country")
            countries.append(
                {
                    "name": name,
                    "map": aliases.get(name, name),
                    "continent": c["name"],
                    "slug": k.get("slug"),
                    "counts": _counts(k),
                    "funding": _funding(k),
                    "flags": sorted(set(flags)),
                }
            )

    def _sum(rows, path):
        return sum(r[path[0]][path[1]] for r in rows)

    totals = {
        "continent_funded": _sum(conts, ("counts", "funded")),
        "country_funded": _sum(countries, ("counts", "funded")),
        "continent_distributed": _sum(conts, ("funding", "distributed")),
        "country_distributed": _sum(countries, ("funding", "distributed")),
        "rows": len(countries),
        "distinct_names": len(seen),
    }

    return {"continents": conts, "countries": countries, "totals": totals}
