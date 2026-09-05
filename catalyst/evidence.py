"""約束と報告。提案で何をやろうとしていたのか、完了報告で何が報告されたのか。

判断はしない。達成／未達を決めない。
`soms.outputs`（約束した成果物）と `poas.content`（実際の報告）を、
どちらも現物のまま並べて置くだけである。誤差を読むのは人の仕事。

証拠のリンクは種類だけ数える。コードなのか、文書なのか、動画なのか。
中身が良いか悪いかは見ない。何が出されたかを形として記録する。

全プロジェクトを一枚に入れると 10MB を超えるので、プロジェクトごとに
別ファイルへ切る。地図は押されたときだけ読む。
"""
from __future__ import annotations

import re
from typing import Any

# 一つの文が長すぎると読めない。頭からこの長さで切り、切ったことを記録する。
CAP_OUTPUTS = 1200
CAP_CRITERIA = 600
CAP_CONTENT = 2000

URL_RE = re.compile(r'https?://[^\s<>")\]]+')

# 記録には HTML の断片が混じっている（提案者が書式付きで書いたもの）。
# タグは読むうえで邪魔なので外す。文字は消さない。
TAG_RE = re.compile(r"<[^>]{0,400}>")
BLOCK_RE = re.compile(r"</(?:p|div|li|tr|h[1-6]|ul|ol|table)>", re.I)
ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”",
}


def strip_html(text: str | None) -> str:
    """タグを外して読める文章に戻す。中身は変えない。

    ブロックの終わりは改行にする。箇条書きの区切りが消えると意味が変わるため。
    """
    t = text or ""
    if "<" not in t and "&" not in t:
        return t.strip()
    t = BLOCK_RE.sub("\n", t)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<li[^>]*>", "\u30fb", t, flags=re.I)
    t = TAG_RE.sub("", t)
    for k, v in ENTITIES.items():
        t = t.replace(k, v)
    t = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), t)
    t = re.sub(r"[ \t\u00a0]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


# 証拠の種類。ドメインで分けるだけで、中身は見ない。
KINDS: dict[str, tuple[str, ...]] = {
    "code": ("github.com", "gitlab.com", "bitbucket.org", "npmjs.com", "pypi.org", "crates.io", "hub.docker.com"),
    "chain": ("cardanoscan.io", "cexplorer.io", "adastat.net", "pool.pm"),
    "live": ("vercel.app", "netlify.app", "github.io", "herokuapp.com", "fly.dev", "pages.dev"),
    "doc": ("drive.google.com", "docs.google.com", "notion.so", "gitbook.io", "medium.com", "hackmd.io"),
    "video": ("youtu.be", "youtube.com", "vimeo.com", "loom.com"),
    "social": ("x.com", "twitter.com", "discord.com", "t.me", "linkedin.com", "facebook.com"),
}

KIND_LABELS = {
    "code": "コード",
    "chain": "オンチェーン",
    "live": "稼働URL",
    "doc": "文書",
    "video": "動画",
    "social": "SNS",
    "other": "その他",
}


def host_of(url: str) -> str:
    m = re.match(r"https?://(?:www\.)?([^/]+)", url)
    return m.group(1).lower() if m else ""


def kind_of(url: str) -> str:
    h = host_of(url)
    for kind, domains in KINDS.items():
        if any(h == d or h.endswith("." + d) for d in domains):
            return kind
    return "other"


def _clip(text: str | None, cap: int) -> tuple[str, bool]:
    """頭から cap 字で切る。切ったかどうかも返す。省略は読み手に伝える。"""
    t = strip_html(text)
    if len(t) <= cap:
        return t, False
    return t[:cap].rstrip(), True


def build(raw: dict) -> dict:
    """プロジェクトごとに、マイルストーンの約束と報告を並べた形へ畳む。"""
    soms = {s["id"]: s for s in raw.get("soms") or []}
    props = {p["id"]: p for p in raw.get("proposals") or []}

    # 最新版の som だけを対象にする。改訂前の約束と後の報告を並べない。
    latest: dict[tuple, dict] = {}
    for som in raw.get("soms") or []:
        key = (som.get("proposal_id"), som.get("milestone"))
        cur = latest.get(key)
        if cur is None or (som.get("id") or 0) > (cur.get("id") or 0):
            latest[key] = som
    latest_ids = {s["id"] for s in latest.values()}

    by_project: dict[Any, dict] = {}
    for poa in raw.get("poas") or []:
        som = soms.get(poa.get("som_id"))
        if som is None or som["id"] not in latest_ids:
            continue
        prop = props.get(som.get("proposal_id"))
        if prop is None or not prop.get("project_id"):
            continue

        content = poa.get("content") or ""
        links = URL_RE.findall(content)  # タグを外す前に拾う（href も証拠）
        kinds = sorted({kind_of(u) for u in links})

        promise, p_cut = _clip(som.get("outputs"), CAP_OUTPUTS)
        criteria, c_cut = _clip(som.get("success_criteria"), CAP_CRITERIA)
        report, r_cut = _clip(content, CAP_CONTENT)

        row = {
            "no": som.get("milestone"),
            "month": som.get("month"),
            "cost": som.get("cost"),
            # 約束したこと
            "promise": promise,
            "criteria": criteria,
            # 報告されたこと
            "report": report,
            # 出された証拠の種類と数。中身は見ない。
            "kinds": kinds,
            "links": len(links),
        }
        if p_cut or c_cut or r_cut:
            row["cut"] = True

        entry = by_project.setdefault(
            prop["project_id"], {"title": prop.get("title"), "ms": {}}
        )
        # 一つのマイルストーンに報告が何度も出されることがある。
        # id が大きいもの＝最後に出された報告だけを採る。
        prev = entry["ms"].get(row["no"])
        if prev is None or (poa.get("id") or 0) > prev["_id"]:
            row["_id"] = poa.get("id") or 0
            entry["ms"][row["no"]] = row

    for entry in by_project.values():
        rows = sorted(entry["ms"].values(), key=lambda m: (m["no"] or 0))
        for r in rows:
            r.pop("_id", None)
        entry["ms"] = rows

    return by_project
