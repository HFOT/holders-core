"""段階①〜④の導出。純関数のみ。"""
from __future__ import annotations

STAGE_LABELS = {
    1: "① 提案",
    2: "② 採択",
    3: "③ 納品",
    4: "④ 使用",
}

FUNDED = "funded"
PENDING = "pending"
COMPLETE = "complete"

FUNDED_STATUSES = frozenset({"funded", "leftover"})

WITHDRAWN = "withdrawn"
TERMINATED = "terminated"
PAUSED = "paused"

OUTCOME_LABELS = {
    "withdrawn": "取り下げ",
    "terminated": "打ち切り",
    "paused": "中断",
}


def is_pending(proposal: dict) -> bool:
    return proposal.get("funding_status") == PENDING


def stage_of(proposal: dict, *, used: bool = False) -> int:
    if proposal.get("funding_status") not in FUNDED_STATUSES:
        return 1
    if proposal.get("status") != COMPLETE:
        return 2
    return 4 if used else 3


def outcome_of(proposal: dict) -> str | None:
    """段階とは別の軸。該当しなければ None（＝特筆すべき転帰なし）。"""
    if proposal.get("funding_status") == WITHDRAWN or proposal.get("status") == WITHDRAWN:
        return WITHDRAWN
    status = proposal.get("status")
    if status == TERMINATED:
        return TERMINATED
    if status == PAUSED:
        return PAUSED
    return None
