"""Fund の時系列。募集から着手までを一本の帯にする。

Catalyst は6年で形を変えてきた。Fund ごとの期間を横に並べると、
規模がいつ膨らみ、いつ縮んだか、どこで止まったかが形として見える。

日付の出どころは二つある:
  1. projectcatalyst.io の各 Fund ページ（F12 以降は各段階が揃っている）
  2. `data/fund_dates.json`（Catalyst Japan から引き継いだ手動記録。F2〜F14）

公式にある日を優先し、無いところだけ手動記録で補う。どちらから来た日かは残す。
埋められない段階は埋めない。「分からない」を線で描かない。
"""
from __future__ import annotations

# 帯にする段階。順序がそのまま時間の順序になる。
STAGES = (
    ("submit", "募集"),
    ("review", "レビュー"),
    ("vote", "投票"),
    ("result", "結果発表"),
    ("onboard", "着手"),
)

# 公式ページの項目名との対応。
OFFICIAL = {
    "submit": ("proposalSubmissionStart", "publicSubmissionEnd"),
    "review": ("communityReviewStart", "communityReviewEnd"),
    "vote": ("communityVotingStart", "communityVotingEnd"),
}


def _pick(*values):
    for v in values:
        if v:
            return v
    return None


def build(rows: list[dict], manual: dict) -> dict:
    """Fund ごとの節目を並べる。日付の出どころも添える。"""
    submit = manual.get("submit_dates") or {}
    vote = manual.get("vote_dates") or {}
    result = manual.get("result_dates") or {}

    out = []
    for row in rows:
        fid = str(row.get("id") or "")
        marks: dict[str, dict] = {}

        # 募集・レビュー・投票は期間。公式に無ければ手動記録で補う。
        for key, (start_key, end_key) in OFFICIAL.items():
            start = row.get(start_key)
            end = row.get(end_key)
            src = "official"
            if key == "submit" and not start:
                start, src = submit.get(fid), "manual"
            if key == "vote" and not (start and end):
                v = vote.get(fid) or {}
                start = _pick(start, v.get("vs"))
                end = _pick(end, v.get("ve"))
                src = "official" if row.get(start_key) else "manual"
            if start or end:
                marks[key] = {"from": start, "to": end, "src": src}

        # 結果発表と着手は時点。
        r = _pick(row.get("votingResultsLaunch"), result.get(fid))
        if r:
            marks["result"] = {
                "at": r,
                "src": "official" if row.get("votingResultsLaunch") else "manual",
            }
        if row.get("projectOnboarding"):
            marks["onboard"] = {"at": row["projectOnboarding"], "src": "official"}

        out.append(
            {
                "id": fid,
                "name": row.get("name"),
                "launch": row.get("launchDate"),
                "phase": row.get("phase"),
                "active": row.get("active"),
                "marks": marks,
                # 規模。帯の太さや脇の数字に使う。
                "available": row.get("available"),
                "distributed": row.get("distributed"),
                "proposals": row.get("n"),
                "funded": row.get("nFunded"),
                "completed": row.get("nCompleted"),
                "cancelled": row.get("nCancelled"),
            }
        )

    out.sort(key=lambda r: int(r["id"] or 0))
    span = [d for r in out for m in r["marks"].values() for d in (m.get("from"), m.get("to"), m.get("at")) if d]
    span += [r["launch"] for r in out if r.get("launch")]
    return {
        "stages": [{"key": k, "label": v} for k, v in STAGES],
        "funds": out,
        "from": min(span) if span else None,
        "to": max(span) if span else None,
        "note": "公式ページの日付を優先し、無いところだけ手動記録（Catalyst Japan 由来）で補っている。埋められない段階は空のまま。",
    }
