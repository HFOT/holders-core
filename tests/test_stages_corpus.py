"""実データ全件に対する回帰テスト。2行フィクスチャでは捕まえられない欠陥を止める。"""
import json
from pathlib import Path

import pytest

from catalyst import stages

CACHE = Path(__file__).resolve().parent.parent / "data" / "cache" / "proposals_raw.json"


@pytest.fixture(scope="module")
def corpus():
    if not CACHE.exists():
        pytest.skip("harvest cache not present")
    return json.loads(CACHE.read_text(encoding="utf-8"))


def test_no_funded_proposal_is_staged_as_mere_proposal(corpus):
    """入金済み・または進行中/納品済みのものが①に落ちていないこと。"""
    bad = [
        p
        for p in corpus
        if stages.stage_of(p) == 1
        and ((p.get("amount_received") or 0) > 0 or p.get("status") in stages.FUNDED_EVIDENCE_STATUSES)
    ]
    assert bad == [], f"{len(bad)} funded/in-progress proposals staged as ①"


def test_completed_proposals_reach_stage_3(corpus):
    bad = [p for p in corpus if p.get("status") == "complete" and stages.stage_of(p) < 3]
    assert bad == [], f"{len(bad)} completed proposals below ③"


def test_outcome_never_lowers_stage(corpus):
    for p in corpus:
        if stages.outcome_of(p) in ("terminated", "paused"):
            assert stages.stage_of(p) >= 2


def test_every_proposal_gets_a_valid_stage(corpus):
    assert {stages.stage_of(p) for p in corpus} <= {1, 2, 3, 4}
