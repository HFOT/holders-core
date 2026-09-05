"""マイルストーンと完了報告。projectcatalyst.io の個別ページから集める。

台帳（Catalyst Explorer）にも国別集計（global map）にも無い層である。
ここで初めて「金が動いたあと、何が起きたか」の記録に触れる。

集めるのは事実だけ:
  - いつ始まったか（startDate）
  - 何段のマイルストーンがあり、何段まで終わったか
  - 完了報告はあるか、その現物はどこか（reportUrl）
  - 最後に記録が動いてから何日経ったか（lastUpdated）

評価はしない。良し悪しを決めない。止まっている日数は判定ではなく、
記録が止まった日数という事実である。無いものは無いと書く。
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Iterable

USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"
DEFAULT_SLEEP = 0.5

_NEXT_DATA = re.compile(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)


def fetch_html(url: str, *, opener: Any = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def extract_project(html: str) -> dict:
    """個別ページの埋め込み JSON から project を取り出す。取れなければ例外。"""
    m = _NEXT_DATA.search(html)
    if not m:
        raise ValueError("__NEXT_DATA__ が見つからない")
    payload = json.loads(m.group(1))
    project = payload["props"]["pageProps"]["data"]["project"]
    if not isinstance(project, dict):
        raise ValueError("project が辞書ではない")
    return project


def _money(node: dict | None) -> dict | None:
    """{amount, code, exp} を最小単位のまま持つ。換算はしない。"""
    if not node or node.get("amount") in (None, ""):
        return None
    return {
        "v": int(node["amount"]),
        "code": (node.get("code") or "").lstrip("$") or None,
        "exp": node.get("exp", 0),
    }


def shape(project: dict) -> dict:
    """必要な事実だけを抜く。長文の本文は持たない。"""
    md = project.get("milestoneDetail") or {}
    done = project.get("completed") or {}

    milestones = []
    for m in md.get("milestones") or []:
        milestones.append(
            {
                "no": m.get("milestone"),
                "title": m.get("title"),
                "month": m.get("deliveryMonth"),
                "due": m.get("deliveryDate"),
                "status": m.get("status"),
                "cost": m.get("cost"),
            }
        )

    last = md.get("lastUpdated") or {}
    return {
        "slug": project.get("projectSlug"),
        "fund": project.get("fundId"),
        "status": project.get("projectStatus"),
        # いつ始まったか
        "start": md.get("startDate"),
        # 何段あり、何段終わったか
        "ms_total": len(milestones),
        "ms_done": md.get("complete"),
        "ms_active": md.get("inProgress"),
        "milestones": milestones,
        # 完了報告。無ければ null のまま置く
        "done_date": done.get("date") or None,
        "report": done.get("reportUrl") or None,
        "video": done.get("videoUrl") or None,
        # 最後に記録が動いてから
        "stale_days": last.get("days"),
        "last_date": last.get("date"),
        "budget": _money(md.get("budget")),
        "distributed": _money(md.get("fundsDistributed")),
    }


def harvest(
    urls: Iterable[str],
    *,
    fetch: Callable[..., str] = fetch_html,
    sleep: float = DEFAULT_SLEEP,
    on_progress: Callable[[int, int, int], None] | None = None,
) -> dict:
    """個別ページを順に取る。落ちたページは url を記録して先へ進む。

    止まらないことを優先する。取れなかったことも記録として残す。
    """
    urls = list(urls)
    rows: dict[str, dict] = {}
    failed: dict[str, str] = {}
    for i, url in enumerate(urls, 1):
        try:
            row = shape(extract_project(fetch(url)))
            row["url"] = url
            rows[url] = row
        except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as e:
            failed[url] = f"{type(e).__name__}: {e}"[:200]
        if on_progress:
            on_progress(i, len(rows), len(failed))
        if sleep and i < len(urls):
            time.sleep(sleep)
    return {"rows": rows, "failed": failed}
