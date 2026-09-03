import json

from catalyst import roster


def prop(pid="p1", users=None, title="T", problem="", solution=""):
    return {
        "id": pid,
        "title": title,
        "problem": problem,
        "solution": solution,
        "users": users or [],
    }


def test_match_by_user_id():
    r = roster.Roster(user_ids={"u1"}, usernames=set(), proposal_ids=set())
    assert r.match(prop(users=[{"id": "u1", "username": "taro"}])) is True
    assert r.match(prop(users=[{"id": "u2", "username": "bob"}])) is False


def test_match_by_username_is_case_insensitive():
    r = roster.Roster(user_ids=set(), usernames={"taro"}, proposal_ids=set())
    assert r.match(prop(users=[{"id": "u9", "username": "TARO"}])) is True


def test_match_by_name_field():
    r = roster.Roster(user_ids=set(), usernames={"taro yamada"}, proposal_ids=set())
    assert r.match(prop(users=[{"id": "u9", "name": "Taro Yamada"}])) is True


def test_match_by_username_field_still_works_when_name_absent():
    r = roster.Roster(user_ids=set(), usernames={"taro"}, proposal_ids=set())
    assert r.match(prop(users=[{"id": "u9", "username": "taro"}])) is True


def test_display_name_prefers_name_over_username():
    assert roster.display_name({"name": "Taro Yamada", "username": "taro"}) == "Taro Yamada"


def test_display_name_falls_back_to_username():
    assert roster.display_name({"username": "taro"}) == "taro"


def test_display_name_empty_for_neither():
    assert roster.display_name({}) == ""


def test_match_by_explicit_proposal_id():
    r = roster.Roster(user_ids=set(), usernames=set(), proposal_ids={"p42"})
    assert r.match(prop(pid="p42")) is True


def test_no_users_key_does_not_crash():
    r = roster.Roster(user_ids={"u1"}, usernames=set(), proposal_ids=set())
    assert r.match({"id": "x"}) is False


def test_load_roster(tmp_path):
    path = tmp_path / "roster.json"
    path.write_text(
        json.dumps({"user_ids": ["u1"], "usernames": ["Taro"], "proposal_ids": ["p1"]}),
        encoding="utf-8",
    )
    r = roster.load_roster(path)
    assert r.user_ids == {"u1"}
    assert r.usernames == {"taro"}
    assert r.proposal_ids == {"p1"}


def test_find_candidates_matches_keyword_in_title():
    ps = [
        prop(pid="a", title="Japanese Voter Survey"),
        prop(pid="b", title="Solar farm in Kenya"),
        prop(pid="c", title="Community hub", problem="for the Tokyo meetup"),
    ]
    got = roster.find_candidates(ps, ["japanese", "tokyo"])
    assert [g["id"] for g in got] == ["a", "c"]


def test_find_candidates_uses_default_keywords():
    ps = [prop(pid="a", title="Cardano Japan Ambassadors")]
    assert [g["id"] for g in roster.find_candidates(ps, roster.DEFAULT_KEYWORDS)] == ["a"]
