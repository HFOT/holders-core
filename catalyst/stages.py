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


def is_pending(proposal: dict) -> bool:
    return proposal.get("funding_status") == PENDING


def stage_of(proposal: dict, *, used: bool = False) -> int:
    if proposal.get("funding_status") != FUNDED:
        return 1
    if proposal.get("status") != COMPLETE:
        return 2
    return 4 if used else 3
