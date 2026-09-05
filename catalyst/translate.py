"""日本語訳。約束と報告の本文を訳す。

記録そのものは書き換えない。原文は原文のまま残し、訳は別のファイルに置く。
画面で切り替えられるようにするためであり、訳が原文を置き換えることはない。

翻訳は LibreTranslate の公開インスタンスを使う。機械翻訳なので誤りうる。
その旨は画面に明記すること。原文を必ず併せて読めるようにすること。

一度訳したものは残す（キャッシュ）。途中で止めても、次は続きから始まる。
同じ文が何度も出てくるので、文の内容で覚える。
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Iterable

ENDPOINT = "https://translate.disroot.org/translate"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"
SOURCE_NOTE = "LibreTranslate（機械翻訳）"

# 一度に送る長さ。長すぎると落ちるので、文の切れ目で分ける。
CHUNK = 1800
# 同時に投げる本数。公開インスタンスに負荷をかけない範囲に留める。
WORKERS = 4
# 失敗したときの待ち時間（秒）。倍々で伸ばす。
BACKOFF = (2, 6, 15)


def key_of(text: str) -> str:
    """訳を覚えるための鍵。文の内容そのものから作る。"""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def split_text(text: str, cap: int = CHUNK) -> list[str]:
    """長い文を、文の切れ目で分ける。切れ目が無ければそのまま切る。"""
    if len(text) <= cap:
        return [text]
    parts: list[str] = []
    rest = text
    while len(rest) > cap:
        window = rest[:cap]
        cut = max(window.rfind("\n"), window.rfind(". "), window.rfind("。"))
        if cut < cap // 3:
            cut = cap
        else:
            cut += 1
        parts.append(rest[:cut])
        rest = rest[cut:]
    if rest.strip():
        parts.append(rest)
    return parts


def translate_once(text: str, *, opener: Any = None) -> str:
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({"q": text, "source": "en", "target": "ja", "format": "text"}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))["translatedText"]


def translate(text: str, *, fetch: Callable[..., str] = translate_once) -> str | None:
    """一本ぶんを訳す。落ちたら間を空けて数回試し、それでも駄目なら None。

    None は「訳せなかった」であって「訳が空」ではない。呼ぶ側で区別すること。
    """
    out: list[str] = []
    for part in split_text(text):
        got = None
        for wait in BACKOFF:
            try:
                got = fetch(part)
                break
            except (urllib.error.URLError, TimeoutError, KeyError, ValueError, OSError):
                time.sleep(wait)
        if got is None:
            return None
        out.append(got)
    return "".join(out)


def collect(files: Iterable[Path], fields: tuple[str, ...] = ("promise", "criteria", "report")) -> dict[str, str]:
    """訳す対象の文を集める。同じ文は一度だけ訳す。"""
    todo: dict[str, str] = {}
    for path in files:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        for ms in data.get("ms") or []:
            for field in fields:
                text = (ms.get(field) or "").strip()
                if text:
                    todo[key_of(text)] = text
    return todo


def run(
    todo: dict[str, str],
    cache: dict[str, str],
    *,
    fetch: Callable[..., str] = translate_once,
    workers: int = WORKERS,
    on_progress: Callable[[int, int, int], None] | None = None,
    save: Callable[[], None] | None = None,
    save_every: int = 200,
) -> dict[str, str]:
    """まだ訳していないものだけを訳す。途中で止めても続きから始められる。"""
    pending = [(k, v) for k, v in todo.items() if k not in cache]
    done = failed = 0

    def work(item):
        k, v = item
        return k, translate(v, fetch=fetch)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for k, got in pool.map(work, pending):
            if got is None:
                failed += 1
            else:
                cache[k] = got
                done += 1
            if save and (done + failed) % save_every == 0:
                save()
            if on_progress:
                on_progress(done + failed, len(pending), failed)
    if save:
        save()
    return cache
