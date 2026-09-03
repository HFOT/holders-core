import json

from catalyst import build


def write(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def make_tree(tmp_path):
    cache = tmp_path / "cache"
    data = tmp_path / "data"
    out = tmp_path / "out"
    for d in (cache, data, out):
        d.mkdir()
    write(
        cache / "proposals_raw.json",
        [
            {
                "id": "p1",
                "title": "Japanese Voter Survey",
                "users": [{"id": "u1", "username": "taro"}],
                "fund": {"label": "Fund 13"},
                "funding_status": "funded",
                "status": "complete",
                "amount_requested": 100,
                "amount_received": 100,
                "link": "https://x/p1",
            },
            {
                "id": "p2",
                "title": "Solar farm",
                "users": [{"id": "u9", "username": "bob"}],
                "fund": {"label": "Fund 13"},
                "funding_status": "not_approved",
                "status": "unfunded",
                "amount_requested": 50,
                "amount_received": 0,
                "link": "https://x/p2",
            },
        ],
    )
    write(cache / "funds_raw.json", [{"label": "Fund 15"}, {"label": "Fund 14"}, {"label": "Fund 13"}])
    write(data / "roster.json", {"user_ids": ["u1"], "usernames": [], "proposal_ids": []})
    write(data / "overlay.json", {"entries": {}})
    return cache, data, out


def test_build_keeps_only_roster_matches(tmp_path):
    cache, data, out = make_tree(tmp_path)
    result = build.build(cache, data, out)
    assert [p["id"] for p in result["proposals"]] == ["p1"]


def test_build_writes_three_files(tmp_path):
    cache, data, out = make_tree(tmp_path)
    build.build(cache, data, out)
    for name in ("proposals.json", "profiles.json", "meta.json"):
        assert (out / name).exists()


def test_meta_counts(tmp_path):
    cache, data, out = make_tree(tmp_path)
    meta = build.build(cache, data, out)["meta"]
    assert meta["total_proposals"] == 2
    assert meta["roster_proposals"] == 1
    assert meta["stage_counts"] == {"1": 0, "2": 0, "3": 1, "4": 0}
    assert meta["pending_used"] == 1
    assert meta["funds"] == ["Fund 15", "Fund 14", "Fund 13"]


def test_profiles_are_built(tmp_path):
    cache, data, out = make_tree(tmp_path)
    profs = build.build(cache, data, out)["profiles"]
    assert profs[0]["user_id"] == "u1"
    assert profs[0]["pattern"] == "delivering"


def test_proposal_without_sources_is_dropped(tmp_path):
    cache, data, out = make_tree(tmp_path)
    raw = json.loads((cache / "proposals_raw.json").read_text(encoding="utf-8"))
    raw[0]["link"] = None
    write(cache / "proposals_raw.json", raw)
    assert build.build(cache, data, out)["proposals"] == []


def test_candidates_excludes_already_rostered(tmp_path):
    cache, data, out = make_tree(tmp_path)
    got = build.candidates(cache, data)
    assert [c["id"] for c in got] == []


def test_build_unwraps_funds_envelope_from_cache(tmp_path):
    cache, data, out = make_tree(tmp_path)
    write(
        cache / "funds_raw.json",
        {
            "data": [{"label": "Fund 15"}, {"label": "Fund 14"}, {"label": "Fund 13"}],
            "links": {},
            "meta": {},
        },
    )
    meta = build.build(cache, data, out)["meta"]
    assert meta["funds"] == ["Fund 15", "Fund 14", "Fund 13"]
