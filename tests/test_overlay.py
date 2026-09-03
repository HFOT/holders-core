import json

from catalyst import overlay


def prop(pid="p1", **kw):
    base = {
        "id": pid,
        "funding_status": "funded",
        "status": "complete",
        "link": "https://www.catalystexplorer.com/en/proposals/x",
        "ideascale_link": None,
        "projectcatalyst_io_link": None,
    }
    base.update(kw)
    return base


def test_load_overlay(tmp_path):
    path = tmp_path / "overlay.json"
    path.write_text(
        json.dumps({"entries": {"p1": {"used": True, "outcome_type": "tech"}}}),
        encoding="utf-8",
    )
    ov = overlay.load_overlay(path)
    assert ov["p1"]["used"] is True


def test_missing_entry_yields_none_not_false():
    d = overlay.decorate(prop(), {})
    assert d["used"] is None
    assert d["outcome_type"] is None
    assert d["stage"] == 3


def test_used_true_promotes_to_stage_4():
    d = overlay.decorate(prop(), {"p1": {"used": True}})
    assert d["used"] is True
    assert d["stage"] == 4


def test_used_false_stays_stage_3():
    d = overlay.decorate(prop(), {"p1": {"used": False}})
    assert d["used"] is False
    assert d["stage"] == 3


def test_sources_collects_all_primary_links_without_duplicates():
    p = prop(
        link="https://a/",
        ideascale_link="https://b/",
        projectcatalyst_io_link="https://a/",
    )
    d = overlay.decorate(p, {"p1": {"sources": ["https://c/", "https://b/"]}})
    assert d["sources"] == ["https://a/", "https://b/", "https://c/"]


def test_pending_flag_is_carried():
    d = overlay.decorate(prop(funding_status="pending", status="pending"), {})
    assert d["pending"] is True
    assert d["stage"] == 1


def test_note_defaults_to_empty_string():
    assert overlay.decorate(prop(), {})["note"] == ""


def test_original_keys_are_preserved():
    d = overlay.decorate(prop(title="Hello"), {})
    assert d["title"] == "Hello"
