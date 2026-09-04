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


def test_build_keeps_all_proposals_not_just_roster(tmp_path):
    cache, data, out = make_tree(tmp_path)
    result = build.build(cache, data, out)
    assert sorted(p["id"] for p in result["proposals"]) == ["p1", "p2"]


def test_roster_match_becomes_a_tag(tmp_path):
    cache, data, out = make_tree(tmp_path)
    rows = {p["id"]: p for p in build.build(cache, data, out)["proposals"]}
    assert rows["p1"]["jp"] is True
    assert rows["p2"]["jp"] is False


def test_proposals_are_sharded_by_fund(tmp_path):
    cache, data, out = make_tree(tmp_path)
    build.build(cache, data, out)
    index = json.loads((out / "proposals" / "index.json").read_text(encoding="utf-8"))
    by_fund = {e["fund"]: e for e in index}
    assert by_fund["Fund 13"]["count"] == 2
    assert by_fund["Fund 15"]["count"] == 0
    rows = json.loads(
        (out / "proposals" / by_fund["Fund 13"]["file"]).read_text(encoding="utf-8")
    )
    assert sorted(r["id"] for r in rows) == ["p1", "p2"]


def test_shards_carry_display_records_not_raw(tmp_path):
    cache, data, out = make_tree(tmp_path)
    raw = json.loads((cache / "proposals_raw.json").read_text(encoding="utf-8"))
    raw[0]["content"] = "x" * 5000
    raw[0]["problem"] = "y" * 5000
    write(cache / "proposals_raw.json", raw)
    build.build(cache, data, out)
    index = json.loads((out / "proposals" / "index.json").read_text(encoding="utf-8"))
    f13 = next(e for e in index if e["fund"] == "Fund 13")
    rows = json.loads((out / "proposals" / f13["file"]).read_text(encoding="utf-8"))
    row = next(r for r in rows if r["id"] == "p1")
    assert "content" not in row
    assert "problem" not in row
    assert row["title"] == "Japanese Voter Survey"
    assert row["fund"] == {"label": "Fund 13"}
    assert row["users"] == [{"id": "u1", "name": "taro"}]
    assert row["sources"] == ["https://x/p1"]


def test_build_writes_index_and_profiles_and_meta(tmp_path):
    cache, data, out = make_tree(tmp_path)
    build.build(cache, data, out)
    assert (out / "proposals" / "index.json").exists()
    assert (out / "profiles.json").exists()
    assert (out / "meta.json").exists()
    assert not (out / "proposals.json").exists()


def test_meta_reports_jp_and_outcomes(tmp_path):
    cache, data, out = make_tree(tmp_path)
    meta = build.build(cache, data, out)["meta"]
    assert meta["jp_proposals"] == 1
    assert meta["proposers"] == 2
    assert meta["outcome_counts"] == {"withdrawn": 0, "terminated": 0, "paused": 0}
    assert "roster_proposals" not in meta


def test_meta_counts(tmp_path):
    cache, data, out = make_tree(tmp_path)
    meta = build.build(cache, data, out)["meta"]
    assert meta["total_proposals"] == 2
    assert meta["jp_proposals"] == 1
    assert meta["stage_counts"] == {"1": 1, "2": 0, "3": 1, "4": 0}
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
    ids = [p["id"] for p in build.build(cache, data, out)["proposals"]]
    assert "p1" not in ids
    assert ids == ["p2"]


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


def test_profiles_file_drops_proposal_ids_and_tags_jp(tmp_path):
    cache, data, out = make_tree(tmp_path)
    result = build.build(cache, data, out)
    written = json.loads((out / "profiles.json").read_text(encoding="utf-8"))
    by_id = {r["user_id"]: r for r in written}
    assert "proposal_ids" not in by_id["u1"]
    assert by_id["u1"]["jp"] is True
    assert by_id["u9"]["jp"] is False
    # 戻り値には残っている
    assert "proposal_ids" in result["profiles"][0]


def test_total_proposals_matches_shard_sum(tmp_path):
    cache, data, out = make_tree(tmp_path)
    result = build.build(cache, data, out)
    meta = result["meta"]
    index = json.loads((out / "proposals" / "index.json").read_text(encoding="utf-8"))
    assert meta["total_proposals"] == sum(e["count"] for e in index)


def test_build_raises_when_funds_have_no_labels(tmp_path):
    import pytest

    cache, data, out = make_tree(tmp_path)
    write(cache / "funds_raw.json", {"data": [], "links": {}, "meta": {}})
    with pytest.raises(ValueError):
        build.build(cache, data, out)
