import datetime as dt

from catalyst import flags

FUNDS = {"8": "2022-06-01", "11": "2024-02-08"}
TODAY = dt.date(2026, 9, 5)


def ev(**row):
    return flags.evaluate(row, fund_dates=FUNDS, today=TODAY)


def test_cancelled_after_receiving_funds_is_stopped():
    out = ev(f="11", st="Cancelled", dist={"v": 50000, "code": "ADA"})
    assert out["flags"] == ["stopped"] or out["flags"][0] == "stopped"


def test_cancelled_without_funds_is_unfunded():
    out = ev(f="11", st="Cancelled", dist={"v": 0, "code": "ADA"})
    assert "unfunded" in out["flags"]
    assert "stopped" not in out["flags"]


def test_pre_milestone_cancellation_counts_as_funded():
    # Fund 9 以前は採択時の一括払い。記録上 0 でも受け取っている。
    out = ev(f="8", st="Cancelled", dist={"v": 0, "code": "ADA"})
    assert "stopped" in out["flags"]
    assert "unfunded" not in out["flags"]


def test_received_funds_switches_at_fund_ten():
    assert flags.received_funds({"f": "9", "dist": {"v": 0}}) is True
    assert flags.received_funds({"f": "10", "dist": {"v": 0}}) is False
    assert flags.received_funds({"f": "10", "dist": {"v": 5}}) is True


def test_received_funds_survives_a_missing_fund():
    # Fund が読めないときは、配分額だけで判断する。作り話をしない。
    assert flags.received_funds({"dist": {"v": 0}}) is False
    assert flags.received_funds({"f": "x", "dist": {"v": 7}}) is True


def test_a_stopped_project_gets_no_delay_flags():
    # 止まったものに、遅れやギャップの旗を重ねない。
    # ただし期間の長さ（長期化）は状態と別の軸なので、条件を満たせば残る。
    out = ev(f="8", st="Cancelled", dist={"v": 1}, unsigned=[1], signed=["2022-07-01"])
    assert "stopped" in out["flags"]
    assert not {"overdue", "active_gap", "past_gap", "late_done"} & set(out["flags"])


def test_completed_before_milestones_existed_measures_years_but_stays_unflagged():
    # Fund 8 にマイルストーン制度は無い。完了報告の日を終点に期間は測るが、
    # 途中を誰も追えていないので長期化の旗は立てない。
    out = ev(f="8", st="Completed", done="2024-09-01")
    assert out["years"] == 2.25
    assert out["flags"] == []


def test_last_signoff_wins_over_the_close_out_date():
    out = ev(f="11", st="Completed", done="2030-01-01", signed=["2024-06-01", "2024-09-01"])
    # 承認があるならそちらを終点にする（2024-02-08 → 2024-09-01）
    assert out["years"] == 0.56


def test_long_flag_reports_the_widest_step_reached():
    out = ev(f="8", st="Completed", done="2026-07-01", signed=["2026-07-01"])
    assert out["long_years"] == 4


def test_long_flag_needs_milestone_records():
    tracked = ev(f="8", st="Completed", signed=["2025-01-01"])
    untracked = ev(f="8", st="Completed", done="2025-01-01")
    assert "long" in tracked["flags"]
    assert "long" not in untracked["flags"]
    # 期間そのものはどちらでも測れている
    assert tracked["years"] == untracked["years"]


def test_no_fund_date_means_no_duration_measured():
    out = ev(f="99", st="Completed", done="2024-01-01")
    assert out["years"] is None
    assert "long" not in out["flags"]


def test_completed_with_a_long_hole_between_signoffs():
    out = ev(f="11", st="Completed", signed=["2024-03-01", "2025-03-01"])
    assert "past_gap" in out["flags"]
    assert out["gap_days"] == 365


def test_completed_without_a_long_hole_is_not_flagged():
    out = ev(f="11", st="Completed", signed=["2024-03-01", "2024-06-01"])
    assert "past_gap" not in out["flags"]


def test_active_project_gone_quiet_is_an_active_gap():
    # 最後の承認から今日までの沈黙も、空白として数える。
    out = ev(f="11", st="Active", signed=["2024-06-01"])
    assert "active_gap" in out["flags"]
    assert out["gap_days"] == (TODAY - dt.date(2024, 6, 1)).days


def test_active_project_recently_signed_is_not_flagged():
    out = ev(f="11", st="Active", signed=[str(TODAY - dt.timedelta(days=30))])
    assert "active_gap" not in out["flags"]


def test_unsigned_milestone_past_its_plan_is_overdue():
    # Fund11 は 2024-02-08 開始。3ヶ月目の予定が今日から見て大幅に過ぎている。
    out = ev(f="11", st="Active", unsigned=[3], signed=[str(TODAY - dt.timedelta(days=10))])
    assert "overdue" in out["flags"]


def test_unsigned_milestone_still_within_grace_is_not_overdue():
    start = dt.date(2024, 2, 8)
    month = ((TODAY - start).days / flags.DAYS_PER_MONTH) - 1
    out = ev(f="11", st="Active", unsigned=[month], signed=[str(TODAY - dt.timedelta(days=5))])
    assert "overdue" not in out["flags"]


def test_completing_far_past_the_plan_is_late_completion():
    # 計画3ヶ月に対し、承認は約1年後。
    out = ev(f="11", st="Completed", planned=[1, 2, 3], signed=["2025-02-01"])
    assert "late_done" in out["flags"]


def test_completing_close_to_the_plan_is_not_late():
    out = ev(f="11", st="Completed", planned=[1, 2, 3], signed=["2024-05-01"])
    assert "late_done" not in out["flags"]


def test_overrun_measures_against_the_plan_from_the_adoption_date():
    # Fund11 の採択決定は 2024-02-08。計画3ヶ月に対し承認は約6ヶ月後 → 約2倍。
    out = ev(f="11", st="Completed", planned=[1, 2, 3], signed=["2024-08-08"])
    assert 1.9 <= out["overrun"] <= 2.1


def test_overrun_needs_a_planned_duration():
    out = ev(f="11", st="Completed", signed=["2024-08-08"])
    assert out["overrun"] is None


def test_labels_cover_every_flag_the_evaluator_can_emit():
    emitted = {"stopped", "unfunded", "overdue", "active_gap", "past_gap", "late_done", "long"}
    assert emitted <= set(flags.LABELS)
