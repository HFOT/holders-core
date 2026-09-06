"""Catalyst Detailed Map の TOP を守るテスト。

一番大事なのは「地図の母体を触っていない」こと。
JS のテスト基盤はこのリポジトリに無いので、母体のハッシュを固定して
うっかりの編集を落とす。母体を意図して変えるときは EXPECTED を更新する。
"""

import hashlib
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"
CMAP = SITE / "catalyst-map"

# 母体。ここを変えるなら、それは別の作業。
BODY = ["region.html", "region.js", "ask.js", "style.css"]


def read(name):
    return (CMAP / name).read_text(encoding="utf-8")


def digest(p):
    # core.autocrlf=true のため、checkout し直すだけで LF/CRLF が入れ替わり
    # バイト列が変わってしまう。改行コードの違いでテストが落ちないよう、
    # テキストとして読んで改行を \n に正規化してからハッシュ化する。
    s = p.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def test_top_page_exists():
    assert (CMAP / "index.html").exists()
    assert (CMAP / "style.css").exists()


def test_top_never_reimplements_the_map():
    """TOP は地図を作り直さない。器を置いて、本物へ送るだけ。

    ヒーローの iframe は器の段階では外してある（地図が明るい平面のとき
    文字が埋もれたため）。器 .cm-slot は残し、地図の実装が漏れていない
    ことと、本物への導線が生きていることを守る。
    """
    src = read("index.html")
    assert "cm-slot" in src, "地図・図版の器が無い"
    assert "../region.html" in src, "本物の地図への導線が無い"
    for w in ["orthographic", "globePath", "drawGlobe", "buildMap", "renderPlist"]:
        assert w not in src, f"地図の実装が TOP に漏れている: {w}"


def test_top_has_no_javascript_of_its_own_for_the_map():
    """地図の JS ファイルを新サイトに置いていない。"""
    assert not list(CMAP.glob("*map*.js"))
    assert not (CMAP / "region.js").exists()


def test_top_does_not_load_the_shared_stylesheet_map_rules():
    """TOP は自前の CSS を持つ。共用 style.css を書き換えない前提。"""
    assert 'href="style.css' in read("index.html")


# Task 1 時点の母体。意図して変えたときだけ更新する。
EXPECTED = {
    "region.html": "9c78fe62cf9697a7",
    "region.js": "773a1084007583fe",
    "ask.js": "32c37ce21d585fb3",
    "style.css": "e340c007bd46c2ff",
}


def test_map_body_is_untouched():
    """地図の母体を変えていない。変わったら、それは別の作業として
    意識的にやったはずなので、EXPECTED を更新して commit する。"""
    for name, want in EXPECTED.items():
        got = digest(SITE / name)
        assert got == want, f"{name} が変わっている（{want} → {got}）"


def test_top_does_not_promise_an_unbuilt_treasury_map():
    src = read("index.html")
    for bad in ["作っている", "作成中", "近日", "coming soon"]:
        assert bad not in src, f"作っていないものを約束している: {bad}"
    assert "トレジャリーにも、同じ場所が要るのではないか" in src


def test_holders_core_is_the_entrance():
    src = (SITE / "index.html").read_text(encoding="utf-8")
    assert "catalyst-map/" in src, "CORE から Catalyst Map へ入れない"
