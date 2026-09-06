"""機械訳の直しを守るテスト。

原文は書き換えない。直すのは訳だけ。
壊れた訳は推測で埋めず、捨てる。
"""

import json

from catalyst import ja_fix


def test_runaway_repetition_is_detected():
    assert ja_fix.is_broken("(Dao-Fund) " * 6) == "暴走"


def test_symbols_only_is_detected():
    assert ja_fix.is_broken(". . . . . . .") == "記号のみ"
    assert ja_fix.is_broken("") == "記号のみ"


def test_a_normal_translation_is_not_broken():
    assert ja_fix.is_broken("Cardano の開発者エコシステム") is None


def test_catalyst_is_a_name_not_a_chemical():
    fixed, why = ja_fix.mechanical("Japanese Ambassadors & Catalyst", "日本大使と触媒")
    assert "触媒" not in fixed
    assert "Catalyst" in fixed
    assert why


def test_catalyst_is_left_alone_when_the_original_never_said_it():
    """原文に Catalyst が無いなら、その「触媒」は化学の触媒かもしれない。触らない。"""
    fixed, why = ja_fix.mechanical("Chemical reaction study", "化学反応と触媒の研究")
    assert fixed == "化学反応と触媒の研究"
    assert why == []


def test_cardano_spelling_is_unified():
    fixed, _ = ja_fix.mechanical("Cardano Bridges", "カーダノの橋")
    assert "カルダノ" in fixed
    assert "カーダノ" not in fixed


def test_overrides_are_readable_and_every_entry_explains_itself():
    data = ja_fix.load_overrides()
    assert data, "上書き辞書が空"
    for url, entry in data.items():
        assert url.startswith("https://projectcatalyst.io/"), url
        assert entry["ja"].strip(), url
        assert entry["why"].strip(), f"直した理由が書かれていない: {url}"


def test_shipped_translations_carry_no_known_breakage():
    ja = json.loads(ja_fix.TARGET.read_text(encoding="utf-8"))
    bad = {u: t for u, t in ja.items() if ja_fix.is_broken(t)}
    assert not bad, f"壊れた訳が残っている: {list(bad)[:3]}"
    assert not [t for t in ja.values() if "カーダノ" in t], "Cardano の表記が割れている"
