"""状態フラグ。金が動いたあと、何が起きたかを形で記録する。

判定の考え方は Catalyst Japan（https://hfot.github.io/Catalyst-Japan/）の実装を引き継ぐ。
評価はしない。良し悪しを決めない。遅れている日数は判定ではなく、
計画と記録の差という事実である。

起点は Fund の結果発表日（採択が確定した日）。終点は三段構え:
  1. マイルストーンがあり完了 … 最後の承認日
  2. マイルストーンが無く完了 … 完了報告の日
  3. まだ完了していない       … 今日
マイルストーン制度は Fund 10 から始まったが、2 の道があるので期間そのものは Fund 2 から測れる。
ただし「長期化」のフラグは、マイルストーンの記録がある案件にだけ立てる。
記録が無ければ途中で何が起きたかを誰も追えておらず、期間の長さに意味を持たせられないため。

期間の起点は必ず Fund の採択結果発表日にする。モジュールの starting_date は使わない
（620件で初回承認より後に置かれており、実際の着手日ではない）。過去の Fund は資金を
一度に受領していたため、採択決定日が実質の資金受取日にあたる。

各マイルストーンの期限も、採択決定日 + 計画月数 で決める。超過はそこから数える。
測れないものは測らない。計画月数が無ければ超過率は出さない。
"""
from __future__ import annotations

import datetime as dt

# 月をおおよその日数に直す。月単位のしきい値を日で比べるためだけに使う。
DAYS_PER_MONTH = 30.44
DAYS_PER_YEAR = 365.25

DEFAULT_THRESHOLDS = {
    "overdue_months": 3,
    "active_gap_months": 6,
    "past_gap_months": 8,
    "late_completion_months": 6,
    "long_years": [2, 3, 4],
}

# フラグの意味。表示側と食い違わないよう、ここを唯一の定義とする。
LABELS = {
    "stopped": "停止（資金を受け取ったあとに終了）",
    "unfunded": "不発（採択されたが資金を受け取っていない）",
    "overdue": "期限超過（承認待ちのまま計画から遅れている）",
    "active_gap": "進行中ギャップ（承認の間が空いている）",
    "past_gap": "過去ギャップ（完了したが途中で空いていた）",
    "late_done": "期限超過で完了（計画から遅れて完了した）",
    "long": "長期化（採択から完了まで年単位）",
}


# マイルストーン制が始まった Fund。これより前は採択時に資金を一括で受け取っている。
FIRST_TRACKED_FUND = 10


def received_funds(row: dict) -> bool:
    """中止した案件が、資金を受け取っていたか。

    Fund 9 以前は採択時の一括払いなので、記録上の配分額が 0 でも受領済みとみなす。
    分割払いになったのは Fund 10 から。そこからは配分額で判断する。
    Catalyst Japan の `_dnfReceivedFunds` と同じ切り分け。
    """
    try:
        fund = int(str(row.get("f") or 0))
    except ValueError:
        fund = 0
    if fund and fund < FIRST_TRACKED_FUND:
        return True
    return ((row.get("dist") or {}).get("v") or 0) > 0


def _d(s: str | None) -> dt.date | None:
    if not s:
        return None
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def evaluate(
    row: dict,
    *,
    fund_dates: dict,
    thresholds: dict | None = None,
    today: dt.date | None = None,
) -> dict:
    """一件ぶんの状態を測る。

    row に期待するもの（無ければ無いなりに動く）:
      f            … Fund 番号
      st           … Completed / Active / Cancelled など
      dist         … 配分済み（{v, code}）
      done         … 完了報告の日
      signed       … 承認された日の並び（新しい順でなくてよい）
      planned      … 各マイルストーンの計画月（1 始まり）
      unsigned     … まだ承認されていないマイルストーンの計画月
      tracked      … マイルストーンの記録がある案件か（無ければ長期化は付けない）
    """
    t = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    today = today or dt.date.today()
    out: dict = {"flags": [], "years": None, "overrun": None, "gap_days": None}

    start = _d(fund_dates.get(str(row.get("f"))))
    signed = sorted(x for x in (_d(s) for s in row.get("signed") or []) if x)
    planned = [m for m in (row.get("planned") or []) if isinstance(m, (int, float))]
    planned_months = max(planned) if planned else 0
    st = row.get("st")
    done_date = _d(row.get("done"))
    # マイルストーンの記録があるか。無い案件には期間のフラグを立てない。
    tracked = bool(row.get("tracked") or planned or signed or row.get("unsigned"))

    # --- 期間 -------------------------------------------------------------
    if start:
        if st == "Completed":
            # 承認があればその最終日、無ければ完了報告の日。どちらも無ければ測らない。
            end = signed[-1] if signed else done_date
        else:
            end = today
        if end:
            days = (end - start).days
            out["years"] = round(days / DAYS_PER_YEAR, 2)
            # 計画の何倍かかったか。起点は採択決定日で統一する。
            if planned_months > 0:
                out["overrun"] = round((days / DAYS_PER_MONTH) / planned_months, 2)

    # --- 停止・不発 -------------------------------------------------------
    if st == "Cancelled":
        out["flags"].append("stopped" if received_funds(row) else "unfunded")
        # 止まったものに、遅れの旗は立てない。二重に責めない。
        return _finish(out, t, tracked=tracked)

    # --- 承認の間隔 -------------------------------------------------------
    gaps = [(b - a).days for a, b in zip(signed, signed[1:])]
    if gaps:
        out["gap_days"] = max(gaps)

    if st == "Completed":
        if out["gap_days"] and out["gap_days"] >= t["past_gap_months"] * DAYS_PER_MONTH:
            out["flags"].append("past_gap")
        # 計画から遅れて完了したか。Fund の結果発表日を起点にする（承認日より必ず前）。
        if start and planned_months and signed:
            late_days = (signed[-1] - start).days - planned_months * DAYS_PER_MONTH
            if late_days >= t["late_completion_months"] * DAYS_PER_MONTH:
                out["flags"].append("late_done")
    else:
        # 進行中。最後の承認から今日までも「空いている期間」に数える。
        since = (today - signed[-1]).days if signed else None
        if since is not None:
            out["gap_days"] = max(out["gap_days"] or 0, since)
        if out["gap_days"] and out["gap_days"] >= t["active_gap_months"] * DAYS_PER_MONTH:
            out["flags"].append("active_gap")
        # 未承認のマイルストーンが計画日から遅れているか。
        # ただしモジュールの soms には承認プロセスを通ったものしか登録されない
        # （5,039組のうち5,008が承認済み）。まだ提出されていないマイルストーンは
        # そもそも行が無いので、この旗はほとんど立たない。立たないことを
        # 「遅れていない」と読ませないよう、集計側で対象数を併記すること。
        if start:
            for month in row.get("unsigned") or []:
                if not isinstance(month, (int, float)):
                    continue
                due = start + dt.timedelta(days=month * DAYS_PER_MONTH)
                if (today - due).days >= t["overdue_months"] * DAYS_PER_MONTH:
                    out["flags"].append("overdue")
                    break

    return _finish(out, t, tracked=tracked)


def _finish(out: dict, t: dict, *, tracked: bool) -> dict:
    """長期化の段（2/3/4年）を最後に足す。何年かを添える。

    マイルストーンの記録がある案件にだけ付ける。記録が無ければ、途中で何が
    起きたかを誰も追えていないので、期間の長さに意味を持たせない。
    期間そのもの（years）は測って出す。フラグにしないだけである。
    """
    years = out.get("years")
    if tracked and years is not None:
        steps = [y for y in sorted(t["long_years"]) if years >= y]
        if steps:
            out["flags"].append("long")
            out["long_years"] = steps[-1]
    return out
