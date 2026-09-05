"""事前スコア。投票の前に、コミュニティのレビュアーが提案書に付けた点数。

三つの観点がある（Catalyst Explorer API の値をそのまま使う）:
  alignment    … その Fund の目的に合っているか
  feasibility  … 実際にできそうか
  auditability … 成果を検証できる形になっているか

ここでやるのは、この点数と「その後どうなったか」を並べることだけである。
点数が良い悪いとは言わない。当たっている外れているとも言わない。
並べた結果をどう読むかは、読む人の仕事。

突き合わせはタイトルの一致による。同名が複数あれば採らない。推測で選ばない。
"""
from __future__ import annotations

import statistics
from collections import defaultdict

FIELDS = ("alignment_score", "feasibility_score", "auditability_score")

LABELS = {
    "alignment_score": "整合性",
    "feasibility_score": "実現可能性",
    "auditability_score": "監査可能性",
}


def _norm(text: str | None) -> str:
    return "".join(ch for ch in (text or "").lower() if ch.isalnum())


def mean_score(row: dict) -> float | None:
    """三観点の平均。一つでも欠けていれば測らない。"""
    vals = [row.get(f) for f in FIELDS]
    if any(v is None for v in vals):
        return None
    return sum(vals) / len(vals)


def summarize(ledger: list[dict], projects: list[dict]) -> dict:
    """スコアの分布と、その後の結末との対応を出す。"""
    scored = [r for r in ledger if mean_score(r) is not None]
    values = [mean_score(r) for r in scored]
    if not values:
        return {}

    # 同名が複数ある提案は突き合わせに使わない。
    by_title: dict[str, list[dict]] = defaultdict(list)
    for row in scored:
        by_title[_norm(row.get("title"))].append(row)

    by_outcome: dict[str, list[float]] = defaultdict(list)
    for project in projects:
        hits = by_title.get(_norm(project.get("n")))
        if not hits or len(hits) != 1:
            continue
        by_outcome[project.get("st")].append(mean_score(hits[0]))

    outcomes = []
    for status, vals in sorted(by_outcome.items(), key=lambda kv: -len(kv[1])):
        if len(vals) < 5:
            continue
        outcomes.append(
            {
                "status": status,
                "n": len(vals),
                "mean": round(statistics.mean(vals), 2),
                "median": round(statistics.median(vals), 2),
            }
        )

    funded = [mean_score(r) for r in scored if r.get("funding_status") == "funded"]
    unfunded = [mean_score(r) for r in scored if r.get("funding_status") != "funded"]
    band = sum(1 for v in values if 3.3 <= v <= 4.0)

    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 2),
        "sd": round(statistics.pstdev(values), 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        # 5点満点のうち、実際に使われている幅
        "band": {"lo": 3.3, "hi": 4.0, "n": band, "pct": round(band * 100 / len(values))},
        "funded": {
            "n": len(funded),
            "mean": round(statistics.mean(funded), 2) if funded else None,
        },
        "unfunded": {
            "n": len(unfunded),
            "mean": round(statistics.mean(unfunded), 2) if unfunded else None,
        },
        "outcomes": outcomes,
        "matched": sum(len(v) for v in by_outcome.values()),
        "labels": LABELS,
        "note": "投票の前にコミュニティのレビュアーが提案書に付けた点数。5点満点の3観点の平均。",
    }
