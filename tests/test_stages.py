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
