"""機械訳の壊れを直す。

projects-ja.json は LibreTranslate が付けた訳で、次の壊れ方をする。

  1. 固有名詞の誤訳 —— Catalyst を化学の「触媒」にする
  2. 表記ゆれ —— Cardano が「カルダノ」と「カーダノ」に割れる
  3. 暴走 —— 同じ語を数百回くり返す
  4. 記号だけ —— 「. . . . .」しか返らない
  5. 意味の反転・数字の相違 —— Vitality を「死亡率」、$550億を「500億」

1〜4 は形で見つかるので機械で直す。5 は形では見つからないので、
見つけたものを data/ja_overrides.json に手で書いて上書きする。

原文は書き換えない。直すのは訳だけ。直しても直しきれないので、
画面では常に原文を主題に置き、訳は「参考訳」と断って添える。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERRIDES = ROOT / "data" / "ja_overrides.json"
TARGET = ROOT / "site" / "data" / "projects-ja.json"
PROJECTS = ROOT / "site" / "data" / "projects.json"

# 同じ 2〜20 文字のかたまりが 5 回以上続いたら暴走とみなす
RUNAWAY = re.compile(r"(.{2,20}?)\1{4,}")
# 記号と空白しか残っていない
SYMBOLS_ONLY = re.compile(r"^[\s.\-–—、。,;:()（）\[\]]*$")


def is_broken(text: str) -> str | None:
    """訳として使えない形なら、その理由を返す。使えるなら None。"""
    if not text or SYMBOLS_ONLY.match(text):
        return "記号のみ"
    if RUNAWAY.search(text):
        return "暴走"
    return None


def mechanical(original: str, text: str) -> tuple[str, list[str]]:
    """形で分かる壊れを直す。直した理由を並べて返す。"""
    fixed, why = text, []

    # Catalyst は事業の名前であって化学の触媒ではない。
    # 原文に Catalyst が無いのに「触媒」と出ているものは触らない。
    if "触媒" in fixed and "catalyst" in original.lower():
        fixed = fixed.replace("触媒", "Catalyst")
        why.append("触媒→Catalyst")

    # Cardano の表記を「カルダノ」に寄せる。多いほうに揃える。
    if "カーダノ" in fixed and "cardano" in original.lower():
        fixed = fixed.replace("カーダノ", "カルダノ")
        why.append("カーダノ→カルダノ")

    fixed = re.sub(r"[ 　]{2,}", " ", fixed).strip()
    if fixed != text and "空白" not in why and fixed.replace(" ", "") != text.replace(" ", ""):
        pass

    return fixed, why


def load_overrides(path: Path = OVERRIDES) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def apply(
    target: Path = TARGET,
    projects: Path = PROJECTS,
    overrides_path: Path = OVERRIDES,
) -> dict:
    """訳を直して書き戻す。何をどう直したかを返す。"""
    ja = json.loads(target.read_text(encoding="utf-8"))
    rows = json.loads(projects.read_text(encoding="utf-8"))["rows"]
    en = {r["url"]: r.get("n", "") for r in rows if r.get("url")}
    overrides = load_overrides(overrides_path)

    report = {"手直し": [], "機械": [], "捨てた": [], "総数": len(ja)}

    for url, text in list(ja.items()):
        original = en.get(url, "")

        if url in overrides:
            entry = overrides[url]
            new = entry["ja"] if isinstance(entry, dict) else entry
            reason = entry.get("why", "") if isinstance(entry, dict) else ""
            if new != text:
                ja[url] = new
                report["手直し"].append({"url": url, "en": original, "前": text, "後": new, "理由": reason})
            continue

        broken = is_broken(text)
        if broken:
            # 直せないものは訳を捨てる。推測で埋めない。
            del ja[url]
            report["捨てた"].append({"url": url, "en": original, "前": text, "理由": broken})
            continue

        new, why = mechanical(original, text)
        if new != text:
            ja[url] = new
            report["機械"].append({"url": url, "前": text, "後": new, "理由": "・".join(why)})

    target.write_text(
        json.dumps(ja, ensure_ascii=False, indent=0, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report
