"""段階①〜④の導出。純関数のみ。"""
from __future__ import annotations

STAGE_LABELS = {
    1: "① 提案",
    2: "② 採択",
    3: "③ 納品",
    4: "④ 使用",
}

PENDING = "pending"
COMPLETE = "complete"

FUNDED_STATUSES = frozenset({"funded", "leftover"})
# 資金が出た証拠。ラベルだけでは足りない（not_approved でも入金・納品済みの実例が95件ある）
FUNDED_EVIDENCE_STATUSES = frozenset(
    {"in_progress", "complete", "onboarding", "terminated", "paused"}
)

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


def was_funded(proposal: dict) -> bool:
    """②に到達したか。ラベル・進捗・入金のいずれかが資金の証拠になる。"""
    if proposal.get("funding_status") in FUNDED_STATUSES:
        return True
    if proposal.get("status") in FUNDED_EVIDENCE_STATUSES:
        return True
    try:
        return (proposal.get("amount_received") or 0) > 0
    except TypeError:
        return False


def stage_of(proposal: dict, *, used: bool = False) -> int:
    if not was_funded(proposal):
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
