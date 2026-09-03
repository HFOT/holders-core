from catalyst import profiles


def d(pid, user, fund, stage, outcome_type=None):
    return {
        "id": pid,
        "title": pid,
        "users": [{"id": user, "username": user}],
        "fund": {"label": fund},
        "stage": stage,
        "outcome_type": outcome_type,
        "amount_requested": 100,
        "amount_received": 100 if stage >= 2 else 0,
        "sources": ["https://x/" + pid],
    }


FUNDS = [{"label": "Fund 15"}, {"label": "Fund 14"}, {"label": "Fund 13"}, {"label": "Fund 12"}]


def test_fund_order_keeps_api_order():
    assert profiles.fund_order(FUNDS) == ["Fund 15", "Fund 14", "Fund 13", "Fund 12"]


def test_counts_per_user():
    rows = [d("a", "u1", "Fund 12", 1), d("b", "u1", "Fund 13", 2), d("c", "u1", "Fund 13", 3)]
    got = profiles.build_profiles(rows, profiles.fund_order(FUNDS))
    assert len(got) == 1
    p = got[0]
    assert p["user_id"] == "u1"
    assert p["proposed"] == 3
    assert p["funded"] == 2
    assert p["delivered"] == 1
    assert p["used"] == 0


def test_used_counts_stage_4():
    rows = [d("a", "u1", "Fund 13", 4)]
    p = profiles.build_profiles(rows, profiles.fund_order(FUNDS))[0]
    assert p["delivered"] == 1
    assert p["used"] == 1


def test_proposal_shared_by_two_users_counts_for_both():
    row = d("a", "u1", "Fund 13", 2)
    row["users"].append({"id": "u2", "username": "u2"})
    got = {p["user_id"]: p for p in profiles.build_profiles([row], profiles.fund_order(FUNDS))}
    assert got["u1"]["proposed"] == 1
    assert got["u2"]["proposed"] == 1


def test_funds_active_is_sorted_by_api_order():
    rows = [d("a", "u1", "Fund 12", 1), d("b", "u1", "Fund 15", 1)]
    p = profiles.build_profiles(rows, profiles.fund_order(FUNDS))[0]
    assert p["funds_active"] == ["Fund 15", "Fund 12"]


def test_classify_delivering():
    p = {"proposed": 3, "funded": 2, "delivered": 1, "funds_active": ["Fund 12"]}
    assert profiles.classify(p, {"Fund 15", "Fund 14"}) == "delivering"


def test_classify_fade_out():
    p = {"proposed": 2, "funded": 2, "delivered": 0, "funds_active": ["Fund 11"]}
    assert profiles.classify(p, {"Fund 15", "Fund 14"}) == "fade_out"


def test_classify_continuing_without_delivery():
    p = {"proposed": 4, "funded": 2, "delivered": 0, "funds_active": ["Fund 15", "Fund 11"]}
    assert profiles.classify(p, {"Fund 15", "Fund 14"}) == "continuing_without_delivery"


def test_classify_proposing():
    p = {"proposed": 5, "funded": 0, "delivered": 0, "funds_active": ["Fund 15"]}
    assert profiles.classify(p, {"Fund 15", "Fund 14"}) == "proposing"


def test_patterns_are_labelled():
    assert set(profiles.PATTERNS) == {
        "delivering",
        "fade_out",
        "continuing_without_delivery",
        "proposing",
    }
