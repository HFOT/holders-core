"""提案者ごとの集計。分類は件数から機械的に決まる記述子であって評価ではない。"""
from __future__ import annotations

from .roster import display_name

PATTERNS = {
    "delivering": "納品あり",
    "fade_out": "採択後に静止",
    "continuing_without_delivery": "納品なしで継続",
    "proposing": "採択なし",
}

RECENT_FUND_COUNT = 2


def fund_order(funds: list[dict]) -> list[str]:
    return [f["label"] for f in funds]


def build_profiles(decorated: list[dict], fund_labels: list[str]) -> list[dict]:
    rank = {label: i for i, label in enumerate(fund_labels)}
    acc: dict[str, dict] = {}
    for row in decorated:
        for user in row.get("users") or []:
            uid = user.get("id")
            if not uid:
                continue
            prof = acc.setdefault(
                uid,
                {
                    "user_id": uid,
                    "username": display_name(user),
                    "proposed": 0,
                    "funded": 0,
                    "delivered": 0,
                    "used": 0,
                    "amount_received": 0,
                    "funds_active": set(),
                    "proposal_ids": [],
                },
            )
            prof["proposed"] += 1
            stage = row.get("stage", 1)
            if stage >= 2:
                prof["funded"] += 1
                prof["amount_received"] += row.get("amount_received") or 0
            if stage >= 3:
                prof["delivered"] += 1
            if stage >= 4:
                prof["used"] += 1
            label = (row.get("fund") or {}).get("label")
            if label:
                prof["funds_active"].add(label)
            prof["proposal_ids"].append(row["id"])

    latest = set(fund_labels[:RECENT_FUND_COUNT])
    out = []
    for prof in acc.values():
        prof["funds_active"] = sorted(
            prof["funds_active"], key=lambda l: rank.get(l, len(rank))
        )
        prof["pattern"] = classify(prof, latest)
        out.append(prof)
    out.sort(key=lambda p: (-p["proposed"], p["user_id"]))
    return out


def classify(profile: dict, latest_funds: set[str]) -> str:
    if profile["delivered"] >= 1:
        return "delivering"
    if profile["funded"] == 0:
        return "proposing"
    active_recently = bool(set(profile["funds_active"]) & latest_funds)
    return "continuing_without_delivery" if active_recently else "fade_out"
