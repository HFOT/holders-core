"""Fund ごとの規模。いくら用意され、いくつ応募があり、いくつ採択されたか。

Catalyst は6年で形を変えてきた。USD で払っていた時期、ADA に移った時期、
マイルストーン制が入った時期、そして 2026 年に運営が移り作り直しに入った時期。
その変化は、Fund ごとの規模を並べると形として見える。

取得元は projectcatalyst.io の各 Fund ページ（`__NEXT_DATA__`）。
公式が出している数をそのまま使う。こちらで数え直さない。

金額は最小単位のまま持つ（exp が桁を表す）。通貨は換算しない。
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any, Callable

BASE = "https://projectcatalyst.io/funds"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"
DEFAULT_SLEEP = 0.4

_NEXT_DATA = re.compile(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)

# 公式ページが持つ数のうち、規模を語るのに要るものだけ。
COUNTS = (
    "numChallenges",
    "numProposals",
    "numProposalsApproved",
    "numProposalsFunded",
    "numProposalsCompleted",
    "numProposalsActive",
    "numProposalsCancelled",
    "numProposalsOnboarding",
)

DATES = (
    "launchDate",
    "proposalSubmissionStart",
    "publicSubmissionEnd",
    "communityVotingStart",
    "communityVotingEnd",
    "votingResultsLaunch",
    "projectOnboarding",
)


def fetch_html(url: str, *, opener: Any = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def extract_fund(html: str) -> dict:
    m = _NEXT_DATA.search(html)
    if not m:
        raise ValueError("__NEXT_DATA__ が見つからない")
    fund = json.loads(m.group(1))["props"]["pageProps"]["data"]["fund"]
    if not isinstance(fund, dict):
        raise ValueError("fund が辞書ではない")
    return fund


def _money(entries) -> list[dict]:
    """通貨ごとに、最小単位のまま持つ。換算しない。"""
    out = []
    for e in entries or []:
        if e.get("amount") in (None, ""):
            continue
        out.append(
            {
                "v": int(e["amount"]),
                "exp": e.get("exp", 0),
                "code": (e.get("code") or "").lstrip("$") or None,
            }
        )
    return out


def shape(fund: dict) -> dict:
    """規模を語る数だけを抜く。長文や設問は持たない。"""
    row = {
        "id": fund.get("_id"),
        "name": fund.get("fundName"),
        "phase": fund.get("phase"),
        "active": fund.get("active"),
        # 用意された額。採択の上限にあたる。
        "available": _money(fund.get("fundsAvailable")),
        "distributed": _money((fund.get("funding") or {}).get("totalDistributedToDate")),
        "remaining": _money((fund.get("funding") or {}).get("totalRemaining")),
        "results_url": fund.get("votingResultsUrl"),
    }
    for key in COUNTS:
        row[key.replace("numProposals", "n").replace("num", "n")] = fund.get(key)
    for key in DATES:
        v = fund.get(key)
        row[key] = v[:10] if isinstance(v, str) else None

    voting = fund.get("voting") or {}
    row["votes"] = voting.get("totalVotesCast")
    yes = voting.get("totalYes") or {}
    if yes.get("amount"):
        row["yes"] = {"v": int(yes["amount"]), "exp": yes.get("exp", 0), "code": (yes.get("code") or "").lstrip("$")}
    return row


def harvest(
    ids: list[str],
    *,
    fetch: Callable[..., str] = fetch_html,
    sleep: float = DEFAULT_SLEEP,
) -> dict:
    """各 Fund のページを順に取る。取れなかった Fund は記録して先へ進む。"""
    rows, failed = [], {}
    for i, fid in enumerate(ids, 1):
        try:
            rows.append(shape(extract_fund(fetch(f"{BASE}/{fid}"))))
        except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as e:
            failed[str(fid)] = f"{type(e).__name__}: {e}"[:200]
        if sleep and i < len(ids):
            time.sleep(sleep)
    rows.sort(key=lambda r: int(r.get("id") or 0))
    return {"rows": rows, "failed": failed}
