from catalyst import stages


def p(**kw):
    base = {"funding_status": "not_approved", "status": "unfunded"}
    base.update(kw)
    return base


def test_unfunded_is_stage_1():
    assert stages.stage_of(p()) == 1


def test_over_budget_is_stage_1():
    assert stages.stage_of(p(funding_status="over_budget")) == 1


def test_pending_is_stage_1_and_flagged():
    prop = p(funding_status="pending", status="pending")
    assert stages.stage_of(prop) == 1
    assert stages.is_pending(prop) is True


def test_not_approved_is_not_pending():
    assert stages.is_pending(p()) is False


def test_funded_is_stage_2():
    assert stages.stage_of(p(funding_status="funded", status="in_progress")) == 2


def test_complete_is_stage_3():
    assert stages.stage_of(p(funding_status="funded", status="complete")) == 3


def test_used_overlay_is_stage_4():
    assert stages.stage_of(p(funding_status="funded", status="complete"), used=True) == 4


def test_used_overlay_cannot_skip_delivery():
    # 納品されていないものを④にはしない。overlay の誤記に引きずられない
    assert stages.stage_of(p(funding_status="funded", status="in_progress"), used=True) == 2


def test_labels_cover_all_stages():
    assert set(stages.STAGE_LABELS) == {1, 2, 3, 4}


def test_leftover_is_stage_2():
    assert stages.stage_of(p(funding_status="leftover", status="in_progress")) == 2


def test_leftover_complete_is_stage_3():
    assert stages.stage_of(p(funding_status="leftover", status="complete")) == 3


def test_outcome_none_by_default():
    assert stages.outcome_of(p()) is None


def test_outcome_withdrawn_from_funding_status():
    assert stages.outcome_of(p(funding_status="withdrawn")) == "withdrawn"


def test_outcome_withdrawn_from_status():
    assert stages.outcome_of(p(status="withdrawn")) == "withdrawn"


def test_outcome_terminated():
    assert stages.outcome_of(p(funding_status="funded", status="terminated")) == "terminated"


def test_outcome_paused():
    assert stages.outcome_of(p(funding_status="funded", status="paused")) == "paused"


def test_terminated_keeps_stage_2():
    # outcome は段階を上書きしない。②に到達した事実を消さない
    prop = p(funding_status="funded", status="terminated")
    assert stages.stage_of(prop) == 2
    assert stages.outcome_of(prop) == "terminated"


def test_outcome_labels_cover_all_values():
    assert set(stages.OUTCOME_LABELS) == {"withdrawn", "terminated", "paused"}
