"""約束された価値と、受け取った価値。

Catalyst は ADA 建てで採択し、マイルストーンの承認ごとに支払う。
採択から支払いまでの間に相場が動けば、同じ ADA 額でも価値は変わる。
その差は提案者の成果とも、審査の判断とも関係がない。だが確かに起きたことである。

測るのはマイルストーン制の Fund だけ（Fund 10 以降）。
それ以前は受取日が記録に無く、いつの時価で測ればよいか決められない。
「分からない」を「変化なし」にしない。

さらに、すべてのマイルストーンが承認済みの案件だけを測る。
途中の案件は、残りをいつ受け取るか分からないため。

出す値は「その日の終値で計算するといくらか」であって、実際の換金額ではない。
提案者がいつ換金したか（今も持っているか）は記録に無い。
"""
from __future__ import annotations

from collections import defaultdict

from . import prices

# マイルストーン制が始まった Fund。これより前は測らない。
FIRST_TRACKED_FUND = 10

NOTE = (
    "採択時の終値と、各マイルストーンの承認日の終値で計算した値。"
    "実際に換金した額ではない。いつ換金したかは記録に無い。"
)
SCOPE = (
    "マイルストーン制の Fund（10 以降）で、すべてのマイルストーンが承認済みの案件だけを測る。"
    "それ以前は受取日が記録に無く、いつの時価で測ればよいか決められない。"
)


def _fund_of(project_id) -> str | None:
    """project_id の頭2桁が Fund 番号。1400119 なら Fund 14。"""
    pid = str(project_id or "")
    if len(pid) != 7:
        return None
    try:
        return str(int(pid[:2]))
    except ValueError:
        return None


def measure(row: dict, day_prices: dict, fund_dates: dict) -> dict | None:
    """一件ぶんの約束と受取を測る。測れなければ None。

    None は「差が無い」ではなく「測れない」である。呼ぶ側で区別すること。
    """
    if (row.get("currency") or "").lower() != "ada":
        return None

    fund = _fund_of(row.get("pid"))
    if fund is None or int(fund) < FIRST_TRACKED_FUND:
        return None

    at_adoption = prices.price_on(day_prices, fund_dates.get(fund))
    if not at_adoption:
        return None

    milestones = [m for m in row.get("ms") or [] if (m.get("cost") or 0) > 0]
    if not milestones:
        return None
    # 途中の案件は測らない。残りをいつ受け取るか分からない。
    if any(not m.get("signed") for m in milestones):
        return None

    promised = received = 0.0
    for m in milestones:
        at_signoff = prices.price_on(day_prices, m["signed"])
        if not at_signoff:
            return None
        promised += m["cost"] * at_adoption
        received += m["cost"] * at_signoff

    if promised <= 0:
        return None
    return {
        "fund": fund,
        "promised": round(promised),
        "received": round(received),
        "ratio": round(received / promised, 3),
    }


def summarize(rows: list[dict], day_prices: dict, fund_dates: dict) -> dict:
    """Fund ごとにまとめる。全体の平均だけでは、逆向きの動きが打ち消し合って消える。"""
    by_fund: dict[str, dict] = defaultdict(lambda: {"n": 0, "promised": 0.0, "received": 0.0})
    measured: dict[int, dict] = {}

    for row in rows:
        got = measure(row, day_prices, fund_dates)
        if got is None:
            continue
        measured[row.get("pid")] = got
        bucket = by_fund[got["fund"]]
        bucket["n"] += 1
        bucket["promised"] += got["promised"]
        bucket["received"] += got["received"]

    funds = []
    for fund in sorted(by_fund, key=lambda f: int(f)):
        b = by_fund[fund]
        funds.append(
            {
                "fund": fund,
                "n": b["n"],
                "promised": round(b["promised"]),
                "received": round(b["received"]),
                "ratio": round(b["received"] / b["promised"], 3) if b["promised"] else None,
            }
        )

    total_p = sum(f["promised"] for f in funds)
    total_r = sum(f["received"] for f in funds)
    return {
        "funds": funds,
        "n": sum(f["n"] for f in funds),
        "promised": total_p,
        "received": total_r,
        "ratio": round(total_r / total_p, 3) if total_p else None,
        "note": NOTE,
        "scope": SCOPE,
        "source": prices.SOURCE,
        "by_project": measured,
    }
