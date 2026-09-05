"""projectcatalyst.io の GraphQL から、採択プロジェクトの国つき一覧を取る。

公式 global map の国別集計は projectcatalyst.io の CMS が持つ project ごとの
country フィールドから作られている。その project 行そのものが GraphQL で公開
されているので、Fund × Challenge を全部回して集める。ここで初めて
「どの提案がどの国か」が一次情報として手に入る。

取るだけで加工はしない。台帳との突き合わせは build 側で行う。
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
from typing import Any, Callable

PAGE_URL = "https://projectcatalyst.io/global-map"
GRAPHQL_URL = "https://projectcatalyst.io/api/v1/graphql"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"
DEFAULT_SLEEP = 0.25

_NEXT_DATA = re.compile(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)

# フロントエンドが投げているものと同じクエリ。フィールドは足しても引いてもいない。
CHALLENGE_QUERY = """
query {
  challenge(input: {slug: "%s"}, fundId: "%s") {
    _id
    fundId
    name
    slug
    projects (includeUnfunded: true, excludeLeftovers: false) {
      _fundingId
      fundId
      projectName
      projectSlug
      projectStatus
      country
      continent
      horizonGroup
      tags
      completed { date videoUrl }
      updatedAt
      challenge { fundId slug }
      funding {
        distributedToDate { amount code exp }
        remaining { amount code exp }
        requested { amount code exp }
      }
      voting {
        status
        reasonForNotFundedStatus
        meetsApprovalThreshold
        votesCast
        yes { amount code exp }
        no { amount code exp }
        abstain { amount code exp }
      }
    }
  }
}
"""


def _http(url: str, data: bytes | None = None, *, opener: Any = None) -> str:
    headers = {"User-Agent": USER_AGENT}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=120) as resp:
        return resp.read().decode("utf-8")


def fetch_nav(*, fetch: Callable[..., str] = _http) -> list[dict]:
    """全 Fund と Challenge の一覧。どのページの __NEXT_DATA__ にも入っている。"""
    m = _NEXT_DATA.search(fetch(PAGE_URL))
    if not m:
        raise ValueError("__NEXT_DATA__ が見つからない。取得元の構造が変わった可能性がある")
    nav = json.loads(m.group(1))["props"]["pageProps"]["data"]["navData"]
    if not nav:
        raise ValueError("navData が空")
    return nav


def fetch_challenge(fund_id: str, slug: str, *, fetch: Callable[..., str] = _http) -> dict:
    body = json.dumps({"query": CHALLENGE_QUERY % (slug, fund_id)}).encode("utf-8")
    payload = json.loads(fetch(GRAPHQL_URL, body))
    if payload.get("errors"):
        raise ValueError(f"graphql error at fund {fund_id} / {slug}: {payload['errors']}")
    return payload["data"]["challenge"]


def harvest(
    *,
    fetch: Callable[..., str] = _http,
    sleep: float = DEFAULT_SLEEP,
    progress: Callable[[str], None] | None = None,
) -> dict:
    """全 Fund × Challenge を回して project 行を集める。失敗した Challenge は記録して続行。"""
    nav = fetch_nav(fetch=fetch)
    challenges: list[dict] = []
    failures: list[dict] = []
    for fund in nav:
        fund_id = fund["_id"]
        for ch in fund.get("challenges") or []:
            try:
                got = fetch_challenge(fund_id, ch["slug"], fetch=fetch)
                if got:
                    challenges.append(got)
            except Exception as e:  # 1つの失敗で全体を捨てない。ただし黙って落とさない。
                failures.append({"fundId": fund_id, "slug": ch["slug"], "error": str(e)})
            if progress:
                n = sum(len(c.get("projects") or []) for c in challenges)
                progress(f"fund {fund_id} / {ch['slug']} — projects {n}")
            if sleep:
                time.sleep(sleep)
    if not challenges:
        raise ValueError("challenge が1件も取れなかった")
    return {"nav": nav, "challenges": challenges, "failures": failures}
