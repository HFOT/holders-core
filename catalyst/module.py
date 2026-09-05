"""マイルストーンモジュールの公開データ。

projectcatalyst.io のマイルストーンモジュール（milestones.projectcatalyst.io）は
公開ページが読み取り専用の匿名キーを配っており、その先の公開データを読める。
ここで初めて「金が動いたあと、実際にいつ何が承認されたか」に触れる。

読むもの:
  proposals   … 予算・配分額・開始日・マイルストーン数・状態
  soms        … 各マイルストーンの成果物・成功基準・証拠の定義・計画日
  signoffs    … 承認の記録。created_at が実際の承認日
  poas        … Proof of Achievement（達成の証拠の現物）
  change_request … 計画変更の申請

読まないもの:
  users / challenges_users は公開されていない（0件）。誰が承認したかは追わない。
  個人が保護されている境界であり、越えない。

これは公式に案内された API ではない。公開ページが使っている経路をそのまま辿るだけである。
負荷をかけないよう間隔を空け、一度取ったら取り直さない。出典は必ず明記する。
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Any, Callable

BASE = "https://hutbpqoulajxnzwykvrf.supabase.co/rest/v1"
# 公開ページ（milestones.projectcatalyst.io/env.js）が配っている読み取り専用キー。
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1dGJwcW91bGFqeG56d3lrdnJmIiwicm9sZSI6ImFub24i"
    "LCJpYXQiOjE2ODI0NTU5NTAsImV4cCI6MTk5ODAzMTk1MH0."
    "ecs2bfAZzT0KwdsqrkAMpPWf0K1_pRvV1_4vK1_lCzI"
)
SOURCE = "https://milestones.projectcatalyst.io/ （マイルストーンモジュールの公開データ）"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"

PAGE = 1000
DEFAULT_SLEEP = 0.4

# 取る列だけを指定する。長文は必要なものに絞り、無関係な内部列は持ち帰らない。
TABLES = {
    "proposals": "id,title,url,project_id,challenge_id,budget,milestones_qty,"
    "funds_distributed,starting_date,currency,status,created_at",
    "soms": "id,proposal_id,milestone,month,cost,outputs,success_criteria,evidence,created_at",
    "signoffs": "id,som_id,poa_id,created_at",
    "poas": "id,som_id,proposal_id,content,created_at",
    "change_request": "id,proposal_id,created_at",
}


def fetch_json(url: str, *, opener: Any = None) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_table(
    table: str,
    select: str,
    *,
    fetch: Callable[..., Any] = fetch_json,
    sleep: float = DEFAULT_SLEEP,
    page: int = PAGE,
) -> list[dict]:
    """id 順に頁を送って全件取る。列は select で絞る。"""
    rows: list[dict] = []
    last = -1
    while True:
        q = urllib.parse.urlencode(
            {"select": select, "order": "id.asc", "limit": page, "id": f"gt.{last}"}
        )
        batch = fetch(f"{BASE}/{table}?{q}")
        if not batch:
            return rows
        rows.extend(batch)
        if len(batch) < page:
            return rows
        last = batch[-1]["id"]
        if sleep:
            time.sleep(sleep)


def harvest(
    *,
    fetch: Callable[..., Any] = fetch_json,
    sleep: float = DEFAULT_SLEEP,
    on_progress: Callable[[str, int], None] | None = None,
) -> dict:
    out: dict[str, Any] = {"source": SOURCE}
    for table, select in TABLES.items():
        rows = fetch_table(table, select, fetch=fetch, sleep=sleep)
        out[table] = rows
        if on_progress:
            on_progress(table, len(rows))
    return out


# --- 整形 ------------------------------------------------------------------


def _by(rows: list[dict], key: str) -> dict:
    out: dict[Any, list[dict]] = {}
    for r in rows:
        out.setdefault(r.get(key), []).append(r)
    return out


def shape(raw: dict) -> dict:
    """プロジェクトごとに、計画と実際を並べた形へ畳む。

    som_id を介して signoffs（実際の承認日）を各マイルストーンに結び直す。
    承認が無いマイルストーンは、無いまま置く。推測で日付を作らない。
    """
    # soms は改訂履歴である。同じ (proposal_id, milestone) に何版も積まれるので、
    # id が最大のもの＝最後に出された版だけを採る。古い版の計画月を混ぜない。
    latest: dict[tuple, dict] = {}
    for som in raw.get("soms") or []:
        key = (som.get("proposal_id"), som.get("milestone"))
        cur = latest.get(key)
        if cur is None or (som.get("id") or 0) > (cur.get("id") or 0):
            latest[key] = som
    soms_by_prop = _by(list(latest.values()), "proposal_id")
    signoff_by_som = _by(raw.get("signoffs") or [], "som_id")
    poa_by_som = _by(raw.get("poas") or [], "som_id")
    cr_by_prop = _by(raw.get("change_request") or [], "proposal_id")

    rows = []
    for p in raw.get("proposals") or []:
        ms = []
        # 承認は版ごとに付く。採用した最新版に付いた承認だけを見る。
        # 全版を束ねると、古い版の承認で最新版まで承認済みに見えてしまう。
        for som in sorted(soms_by_prop.get(p["id"], []), key=lambda s: (s.get("milestone") or 0)):
            signs = sorted(
                x.get("created_at")
                for x in signoff_by_som.get(som["id"], [])
                if x.get("created_at")
            )
            ms.append(
                {
                    "no": som.get("milestone"),
                    "month": som.get("month"),
                    "cost": som.get("cost"),
                    # 承認された実際の日。無ければ null のまま。
                    "signed": signs[0][:10] if signs else None,
                    # 達成の証拠が提出されているか
                    "poa": bool(poa_by_som.get(som["id"])),
                    "outputs": som.get("outputs"),
                    "criteria": som.get("success_criteria"),
                }
            )
        rows.append(
            {
                "pid": p.get("project_id"),
                "title": p.get("title"),
                "url": p.get("url"),
                "start": (p.get("starting_date") or "")[:10] or None,
                "budget": p.get("budget"),
                "distributed": p.get("funds_distributed"),
                "currency": p.get("currency"),
                "status": p.get("status"),
                "ms_qty": p.get("milestones_qty"),
                "ms": ms,
                "changes": len(cr_by_prop.get(p["id"], [])),
            }
        )
    return {"source": SOURCE, "rows": rows}
