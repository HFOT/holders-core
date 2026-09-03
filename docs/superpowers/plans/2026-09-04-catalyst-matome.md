# Catalyst まとめ（日本語圏）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日本語圏の Catalyst 提案者について「提案 → 採択 → 納品 → 使用」の段階を一次情報リンク付きで一覧できる静的サイトを作る。

**Architecture:** Python の収集スクリプトが Catalyst Explorer API を全件クロールしてローカル JSON に落とし、手書きの名簿（roster）と手書きの追記（overlay）を突き合わせて派生データを生成する。サイトは生成済み JSON を読むだけの静的 HTML。実行時に外部 API を叩かないので CORS もレート制限も関係しない。データ更新は Fund 単位で人がスクリプトを走らせる（原則4「めったに更新しない」）。

**Tech Stack:** Python 3.11+ / 標準ライブラリのみ（urllib）/ pytest / 素の HTML・CSS・JS（フレームワークなし）

## Global Constraints

spec: `C:\holders-core\docs\superpowers\specs\2026-09-04-holders-core-design.md`

- **一次情報のリンクを必ず付ける。** リンクを持たない項目はサイトに出力しない
- **人ではなく形を記録する。** 人物評・意図の推測・スコア・順位付けを出力しない
- **実現したものも同じ精度で記録する。** `complete` を落とさない
- **成果の型（技術型 / 信頼型）に優劣を付けない。** 並べるだけ
- **段階①〜④の番号を全項目に付す**
- **④（使われているか）は API に存在しない。** 手動 overlay でのみ付与し、未記入は「保留」として出す。推測で埋めない
- **日本語圏の判定は名簿（roster）による。** 本文言語での自動判定はしない（全提案が英語で書かれているため機能しない）
- **月次の編集作業を発生させる機能を作らない。** 更新は Fund 単位
- **API は 1 リクエストにつき 0.3 秒以上あける。** クロールは 475 ページ

### 実測済みの API 仕様（2026-09-04 時点）

| 項目 | 値 |
|---|---|
| proposals | `https://www.catalystexplorer.com/api/proposals?page=N` 認証不要 |
| 総件数 | 11,385 件 / `per_page` は 24 固定（変更不可・指定すると 500） |
| 総ページ | 475 |
| 効くパラメータ | `page`, `search` のみ（`fund` / `status` / `per_page` は無視される） |
| funds | `https://www.catalystexplorer.com/api/funds` 配列を直接返す（`data` ラッパー無し）。Fund 2〜15 |
| `funding_status` | `not_approved` / `funded` / `over_budget` / `pending` |
| `status` | `unfunded` / `pending` / `in_progress` / `complete` |

proposal の主な項目: `id`(uuid) / `title` / `slug` / `amount_requested` / `amount_received` / `status` / `funding_status` / `funded_at` / `ideascale_link` / `projectcatalyst_io_link` / `link` / `users`(配列) / `fund`{`label`,`title`,`id`} / `campaign`{`title`}

---

## File Structure

```
C:\holders-core\
├── catalyst/
│   ├── __init__.py
│   ├── api.py         API クライアント（取得のみ。加工しない）
│   ├── roster.py      日本語圏名簿の読み込みと突合、候補抽出
│   ├── stages.py      段階①〜④の導出
│   ├── overlay.py     手動追記（④使用 / 成果の型）の読み込みと適用
│   ├── profiles.py    提案者ごとの集計と形の分類
│   └── build.py       出力 JSON の生成（CLI エントリ）
├── data/
│   ├── roster.json    手書き。日本語圏の提案者名簿
│   ├── overlay.json   手書き。④使用と成果の型
│   ├── cache/         API 生データ（proposals_raw.json / funds_raw.json）
│   └── out/           生成物（proposals.json / profiles.json / meta.json）
├── site/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── tests/
│   ├── test_api.py
│   ├── test_roster.py
│   ├── test_stages.py
│   ├── test_overlay.py
│   ├── test_profiles.py
│   └── test_build.py
└── docs/superpowers/
```

責務の分け方: `api.py` は取得だけで加工しない。`stages.py` / `profiles.py` は純関数で、ネットワークにもファイルにも触らない。ファイル I/O は `build.py` に集める。これでテストがネットワーク無しで全部通る。

---

### Task 1: リポジトリ骨格と API クライアント

**Files:**
- Create: `C:\holders-core\catalyst\__init__.py`
- Create: `C:\holders-core\catalyst\api.py`
- Create: `C:\holders-core\tests\test_api.py`
- Create: `C:\holders-core\.gitignore`
- Create: `C:\holders-core\README.md`

**Interfaces:**
- Consumes: なし
- Produces: `catalyst.api.PROPOSALS_URL: str`, `catalyst.api.FUNDS_URL: str`, `catalyst.api.fetch_json(url: str, *, opener=None) -> dict | list`, `catalyst.api.iter_proposal_pages(*, fetch=fetch_json, sleep=0.3, max_pages=None) -> Iterator[dict]`, `catalyst.api.fetch_all_proposals(**kw) -> list[dict]`, `catalyst.api.fetch_funds(*, fetch=fetch_json) -> list[dict]`

- [ ] **Step 1: git 初期化とディレクトリ作成**

```bash
cd /c/holders-core
git init
mkdir -p catalyst data/cache data/out site tests
printf 'data/cache/\n__pycache__/\n*.pyc\n.pytest_cache/\n' > .gitignore
printf '# holders CORE\n\nCatalyst まとめ（日本語圏）。設計書は `docs/superpowers/specs/` を参照。\n' > README.md
touch catalyst/__init__.py
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/test_api.py`:

```python
from catalyst import api


def test_iter_proposal_pages_stops_at_last_page():
    pages = {
        1: {"current_page": 1, "last_page": 3, "total": 5, "data": [{"id": "a"}, {"id": "b"}]},
        2: {"current_page": 2, "last_page": 3, "total": 5, "data": [{"id": "c"}, {"id": "d"}]},
        3: {"current_page": 3, "last_page": 3, "total": 5, "data": [{"id": "e"}]},
    }
    calls = []

    def fake_fetch(url, *, opener=None):
        page = int(url.rsplit("page=", 1)[1])
        calls.append(page)
        return pages[page]

    got = list(api.iter_proposal_pages(fetch=fake_fetch, sleep=0))
    assert calls == [1, 2, 3]
    assert [p["id"] for page in got for p in page["data"]] == ["a", "b", "c", "d", "e"]


def test_fetch_all_proposals_flattens_pages():
    pages = {
        1: {"current_page": 1, "last_page": 2, "total": 3, "data": [{"id": "a"}, {"id": "b"}]},
        2: {"current_page": 2, "last_page": 2, "total": 3, "data": [{"id": "c"}]},
    }

    def fake_fetch(url, *, opener=None):
        return pages[int(url.rsplit("page=", 1)[1])]

    got = api.fetch_all_proposals(fetch=fake_fetch, sleep=0)
    assert [p["id"] for p in got] == ["a", "b", "c"]


def test_max_pages_limits_crawl():
    def fake_fetch(url, *, opener=None):
        page = int(url.rsplit("page=", 1)[1])
        return {"current_page": page, "last_page": 475, "total": 11385, "data": [{"id": str(page)}]}

    got = api.fetch_all_proposals(fetch=fake_fetch, sleep=0, max_pages=2)
    assert [p["id"] for p in got] == ["1", "2"]


def test_fetch_funds_returns_bare_list():
    def fake_fetch(url, *, opener=None):
        assert url == api.FUNDS_URL
        return [{"label": "Fund 15"}, {"label": "Fund 14"}]

    assert api.fetch_funds(fetch=fake_fetch) == [{"label": "Fund 15"}, {"label": "Fund 14"}]
```

- [ ] **Step 3: テストを走らせて失敗を確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalyst.api'`

- [ ] **Step 4: 最小の実装を書く**

`catalyst/api.py`:

```python
"""Catalyst Explorer API クライアント。取得のみ。加工はしない。"""
from __future__ import annotations

import json
import time
import urllib.request
from typing import Any, Callable, Iterator

BASE = "https://www.catalystexplorer.com/api"
PROPOSALS_URL = f"{BASE}/proposals"
FUNDS_URL = f"{BASE}/funds"

USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"
DEFAULT_SLEEP = 0.3


def fetch_json(url: str, *, opener: Any = None) -> Any:
    req = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def iter_proposal_pages(
    *,
    fetch: Callable[..., Any] = fetch_json,
    sleep: float = DEFAULT_SLEEP,
    max_pages: int | None = None,
) -> Iterator[dict]:
    page = 1
    while True:
        payload = fetch(f"{PROPOSALS_URL}?page={page}")
        yield payload
        last = payload.get("last_page", page)
        if max_pages is not None and page >= max_pages:
            return
        if page >= last:
            return
        page += 1
        if sleep:
            time.sleep(sleep)


def fetch_all_proposals(**kw: Any) -> list[dict]:
    out: list[dict] = []
    for payload in iter_proposal_pages(**kw):
        out.extend(payload.get("data", []))
    return out


def fetch_funds(*, fetch: Callable[..., Any] = fetch_json) -> list[dict]:
    return fetch(FUNDS_URL)
```

- [ ] **Step 5: テストを走らせて通ることを確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_api.py -v`
Expected: PASS（4件）

- [ ] **Step 6: コミット**

```bash
cd /c/holders-core
git add .gitignore README.md catalyst/__init__.py catalyst/api.py tests/test_api.py
git commit -m "feat: Catalyst Explorer API クライアント"
```

---

### Task 2: 段階①〜④の導出

**Files:**
- Create: `C:\holders-core\catalyst\stages.py`
- Create: `C:\holders-core\tests\test_stages.py`

**Interfaces:**
- Consumes: なし（純関数。proposal は dict）
- Produces: `catalyst.stages.STAGE_LABELS: dict[int, str]`, `catalyst.stages.stage_of(proposal: dict, *, used: bool = False) -> int`, `catalyst.stages.is_pending(proposal: dict) -> bool`

段階の定義（spec より）:

| 段階 | 意味 | 判定 |
|---|---|---|
| ① | 提案する | 常に成立（下限） |
| ② | 採択される | `funding_status == "funded"` |
| ③ | 納品される | `status == "complete"` |
| ④ | 使われる | overlay の `used` が真のときのみ |

`funding_status == "pending"` は「審査中」であり、②に到達していない。①のまま `is_pending` を真にする。
`over_budget` は「採択されなかった」であり①のまま。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_stages.py`:

```python
from catalyst import stages


def p(**kw):
    base = {"funding_status": "not_approved", "status": "unfunded"}
    base.update(kw)
    return base


def test_unfunded_is_stage_1():
    assert stages.stage_of(p()) == 1


def test_over_budget_is_stage_1():
    assert stages.stage_of(p(funding_status="over_budget")) == 1


def test_pending_is_stage_1_and_flagged():
    prop = p(funding_status="pending", status="pending")
    assert stages.stage_of(prop) == 1
    assert stages.is_pending(prop) is True


def test_not_approved_is_not_pending():
    assert stages.is_pending(p()) is False


def test_funded_is_stage_2():
    assert stages.stage_of(p(funding_status="funded", status="in_progress")) == 2


def test_complete_is_stage_3():
    assert stages.stage_of(p(funding_status="funded", status="complete")) == 3


def test_used_overlay_is_stage_4():
    assert stages.stage_of(p(funding_status="funded", status="complete"), used=True) == 4


def test_used_overlay_cannot_skip_delivery():
    # 納品されていないものを④にはしない。overlay の誤記に引きずられない
    assert stages.stage_of(p(funding_status="funded", status="in_progress"), used=True) == 2


def test_labels_cover_all_stages():
    assert set(stages.STAGE_LABELS) == {1, 2, 3, 4}
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_stages.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalyst.stages'`

- [ ] **Step 3: 最小の実装を書く**

`catalyst/stages.py`:

```python
"""段階①〜④の導出。純関数のみ。"""
from __future__ import annotations

STAGE_LABELS = {
    1: "① 提案",
    2: "② 採択",
    3: "③ 納品",
    4: "④ 使用",
}

FUNDED = "funded"
PENDING = "pending"
COMPLETE = "complete"


def is_pending(proposal: dict) -> bool:
    return proposal.get("funding_status") == PENDING


def stage_of(proposal: dict, *, used: bool = False) -> int:
    if proposal.get("funding_status") != FUNDED:
        return 1
    if proposal.get("status") != COMPLETE:
        return 2
    return 4 if used else 3
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_stages.py -v`
Expected: PASS（9件）

- [ ] **Step 5: コミット**

```bash
cd /c/holders-core
git add catalyst/stages.py tests/test_stages.py
git commit -m "feat: 段階①〜④の導出"
```

---

### Task 3: 日本語圏名簿（roster）と候補抽出

**Files:**
- Create: `C:\holders-core\catalyst\roster.py`
- Create: `C:\holders-core\data\roster.json`
- Create: `C:\holders-core\tests\test_roster.py`

**Interfaces:**
- Consumes: なし
- Produces: `catalyst.roster.Roster`（`.user_ids: set[str]`, `.usernames: set[str]`, `.proposal_ids: set[str]`, `.match(proposal: dict) -> bool`）, `catalyst.roster.load_roster(path: str | Path) -> Roster`, `catalyst.roster.find_candidates(proposals: list[dict], keywords: list[str]) -> list[dict]`, `catalyst.roster.DEFAULT_KEYWORDS: list[str]`

**なぜ名簿が要るか（実測）**: 216件のサンプルで本文に仮名を含む提案は 0 件。全提案が英語で書かれているため、言語による自動判定は機能しない。日本語圏は**提案者で定義する**しかない。

`data/roster.json` の形（初期は空でよい。Task 6 で人が埋める）:

```json
{
  "note": "日本語圏の提案者名簿。手動で維持する。自動判定はしない。",
  "user_ids": [],
  "usernames": [],
  "proposal_ids": []
}
```

`proposal_ids` は「この提案は日本語圏だが提案者IDが名簿に無い」場合の個別指定に使う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_roster.py`:

```python
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
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_roster.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalyst.roster'`

- [ ] **Step 3: 最小の実装を書く**

`catalyst/roster.py`:

```python
"""日本語圏の提案者名簿。判定は名簿によってのみ行う。"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_KEYWORDS = ["japan", "japanese", "tokyo", "osaka", "nippon", "nihon"]

SEARCH_FIELDS = ("title", "problem", "solution", "excerpt")


@dataclass
class Roster:
    user_ids: set[str] = field(default_factory=set)
    usernames: set[str] = field(default_factory=set)
    proposal_ids: set[str] = field(default_factory=set)

    def match(self, proposal: dict) -> bool:
        if proposal.get("id") in self.proposal_ids:
            return True
        for user in proposal.get("users") or []:
            if user.get("id") in self.user_ids:
                return True
            name = (user.get("username") or "").strip().lower()
            if name and name in self.usernames:
                return True
        return False


def load_roster(path: str | Path) -> Roster:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return Roster(
        user_ids=set(raw.get("user_ids") or []),
        usernames={str(n).strip().lower() for n in (raw.get("usernames") or [])},
        proposal_ids=set(raw.get("proposal_ids") or []),
    )


def find_candidates(proposals: list[dict], keywords: list[str]) -> list[dict]:
    needles = [k.lower() for k in keywords]
    out = []
    for p in proposals:
        blob = " ".join(str(p.get(f) or "") for f in SEARCH_FIELDS).lower()
        if any(n in blob for n in needles):
            out.append(p)
    return out
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_roster.py -v`
Expected: PASS（7件）

- [ ] **Step 5: 空の名簿ファイルを作る**

```bash
cd /c/holders-core
cat > data/roster.json << 'EOF'
{
  "note": "日本語圏の提案者名簿。手動で維持する。本文言語による自動判定はしない（全提案が英語で書かれているため機能しない）。",
  "user_ids": [],
  "usernames": [],
  "proposal_ids": []
}
EOF
```

- [ ] **Step 6: コミット**

```bash
cd /c/holders-core
git add catalyst/roster.py data/roster.json tests/test_roster.py
git commit -m "feat: 日本語圏名簿と候補抽出"
```

---

### Task 4: 手動 overlay（④使用 / 成果の型）

**Files:**
- Create: `C:\holders-core\catalyst\overlay.py`
- Create: `C:\holders-core\data\overlay.json`
- Create: `C:\holders-core\tests\test_overlay.py`

**Interfaces:**
- Consumes: `catalyst.stages.stage_of`
- Produces: `catalyst.overlay.load_overlay(path: str | Path) -> dict[str, dict]`, `catalyst.overlay.entry_for(overlay: dict, proposal_id: str) -> dict`, `catalyst.overlay.decorate(proposal: dict, overlay: dict) -> dict`

`decorate` が返す dict は元の proposal の全キーに加えて:

| キー | 型 | 意味 |
|---|---|---|
| `stage` | int 1..4 | 段階 |
| `pending` | bool | 審査中 |
| `used` | `True` / `False` / `None` | ④。**未記入は None（保留）。推測で埋めない** |
| `outcome_type` | `"tech"` / `"trust"` / `None` | 成果の型。未記入は None |
| `sources` | list[str] | 一次情報 URL（重複排除・順序保持） |
| `note` | str | overlay の補足。既定は空文字 |

`data/overlay.json` の形:

```json
{
  "note": "手動追記。④使用の有無と成果の型。未記入は保留として出力される。推測で埋めない。",
  "entries": {}
}
```

エントリ1件の形:

```json
{
  "used": true,
  "outcome_type": "tech",
  "sources": ["https://example.com/evidence"],
  "note": "2025-03 稼働確認"
}
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_overlay.py`:

```python
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
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_overlay.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalyst.overlay'`

- [ ] **Step 3: 最小の実装を書く**

`catalyst/overlay.py`:

```python
"""手動追記の読み込みと適用。未記入は保留（None）のまま出す。"""
from __future__ import annotations

import json
from pathlib import Path

from . import stages

PRIMARY_LINK_FIELDS = ("link", "ideascale_link", "projectcatalyst_io_link")


def load_overlay(path: str | Path) -> dict[str, dict]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return dict(raw.get("entries") or {})


def entry_for(overlay: dict[str, dict], proposal_id: str) -> dict:
    return overlay.get(proposal_id) or {}


def _sources(proposal: dict, entry: dict) -> list[str]:
    urls: list[str] = []
    for field in PRIMARY_LINK_FIELDS:
        url = proposal.get(field)
        if url:
            urls.append(url)
    urls.extend(entry.get("sources") or [])
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def decorate(proposal: dict, overlay: dict[str, dict]) -> dict:
    entry = entry_for(overlay, proposal.get("id", ""))
    used = entry.get("used")
    out = dict(proposal)
    out["used"] = used
    out["outcome_type"] = entry.get("outcome_type")
    out["note"] = entry.get("note") or ""
    out["sources"] = _sources(proposal, entry)
    out["pending"] = stages.is_pending(proposal)
    out["stage"] = stages.stage_of(proposal, used=bool(used))
    return out
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_overlay.py -v`
Expected: PASS（8件）

- [ ] **Step 5: 空の overlay ファイルを作る**

```bash
cd /c/holders-core
cat > data/overlay.json << 'EOF'
{
  "note": "手動追記。④使用の有無と成果の型（tech / trust）。未記入は保留として出力される。推測で埋めない。",
  "entries": {}
}
EOF
```

- [ ] **Step 6: コミット**

```bash
cd /c/holders-core
git add catalyst/overlay.py data/overlay.json tests/test_overlay.py
git commit -m "feat: 手動overlay（④使用・成果の型）"
```

---

### Task 5: 提案者ごとの集計と形の分類

**Files:**
- Create: `C:\holders-core\catalyst\profiles.py`
- Create: `C:\holders-core\tests\test_profiles.py`

**Interfaces:**
- Consumes: `catalyst.overlay.decorate` が返す形の dict（`stage` / `used` / `outcome_type` を持つ）
- Produces: `catalyst.profiles.fund_order(funds: list[dict]) -> list[str]`, `catalyst.profiles.build_profiles(decorated: list[dict], fund_labels: list[str]) -> list[dict]`, `catalyst.profiles.classify(profile: dict, latest_funds: set[str]) -> str`, `catalyst.profiles.PATTERNS: dict[str, str]`

分類は **回数から機械的に決まる記述子** であって評価ではない。サイトは必ず生の件数を並べて表示し、読者が分類を検算できるようにする（spec「人ではなく形を記録する」「優劣は付けない」）。

| 値 | 条件 |
|---|---|
| `delivering` | 納品（stage>=3）が 1 件以上 |
| `fade_out` | 採択（stage>=2）が 1 件以上・納品 0 件・直近2 Fund に提案なし |
| `continuing_without_delivery` | 採択が 1 件以上・納品 0 件・直近2 Fund に提案あり |
| `proposing` | 採択 0 件 |

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_profiles.py`:

```python
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
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_profiles.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalyst.profiles'`

- [ ] **Step 3: 最小の実装を書く**

`catalyst/profiles.py`:

```python
"""提案者ごとの集計。分類は件数から機械的に決まる記述子であって評価ではない。"""
from __future__ import annotations

PATTERNS = {
    "delivering": "納品あり",
    "fade_out": "採択後に静止",
    "continuing_without_delivery": "納品なしで継続",
    "proposing": "採択なし",
}

RECENT_FUND_COUNT = 2


def fund_order(funds: list[dict]) -> list[str]:
    return [f["label"] for f in funds]


def build_profiles(decorated: list[dict], fund_labels: list[str]) -> list[dict]:
    rank = {label: i for i, label in enumerate(fund_labels)}
    acc: dict[str, dict] = {}
    for row in decorated:
        for user in row.get("users") or []:
            uid = user.get("id")
            if not uid:
                continue
            prof = acc.setdefault(
                uid,
                {
                    "user_id": uid,
                    "username": user.get("username") or "",
                    "proposed": 0,
                    "funded": 0,
                    "delivered": 0,
                    "used": 0,
                    "amount_received": 0,
                    "funds_active": set(),
                    "proposal_ids": [],
                },
            )
            prof["proposed"] += 1
            stage = row.get("stage", 1)
            if stage >= 2:
                prof["funded"] += 1
                prof["amount_received"] += row.get("amount_received") or 0
            if stage >= 3:
                prof["delivered"] += 1
            if stage >= 4:
                prof["used"] += 1
            label = (row.get("fund") or {}).get("label")
            if label:
                prof["funds_active"].add(label)
            prof["proposal_ids"].append(row["id"])

    latest = set(fund_labels[:RECENT_FUND_COUNT])
    out = []
    for prof in acc.values():
        prof["funds_active"] = sorted(
            prof["funds_active"], key=lambda l: rank.get(l, len(rank))
        )
        prof["pattern"] = classify(prof, latest)
        out.append(prof)
    out.sort(key=lambda p: (-p["proposed"], p["user_id"]))
    return out


def classify(profile: dict, latest_funds: set[str]) -> str:
    if profile["delivered"] >= 1:
        return "delivering"
    if profile["funded"] == 0:
        return "proposing"
    active_recently = bool(set(profile["funds_active"]) & latest_funds)
    return "continuing_without_delivery" if active_recently else "fade_out"
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_profiles.py -v`
Expected: PASS（10件）

- [ ] **Step 5: コミット**

```bash
cd /c/holders-core
git add catalyst/profiles.py tests/test_profiles.py
git commit -m "feat: 提案者ごとの集計と形の分類"
```

---

### Task 6: ビルド CLI と実データ収集

**Files:**
- Create: `C:\holders-core\catalyst\build.py`
- Create: `C:\holders-core\tests\test_build.py`
- Modify: `C:\holders-core\data\roster.json`（実データを見て人が埋める）

**Interfaces:**
- Consumes: `catalyst.api`, `catalyst.roster`, `catalyst.overlay`, `catalyst.profiles`
- Produces: `catalyst.build.harvest(cache_dir) -> None`（API → `cache/proposals_raw.json`・`cache/funds_raw.json`）, `catalyst.build.build(cache_dir, data_dir, out_dir) -> dict`（`{"proposals": [...], "profiles": [...], "meta": {...}}` を返し同名 JSON を書く）, `catalyst.build.candidates(cache_dir, data_dir) -> list[dict]`

CLI:

```
python -m catalyst.build harvest       # API を全件クロールして cache に保存（約475req / 3分）
python -m catalyst.build candidates    # 名簿に未登録の日本語圏候補を出す（人が roster.json に写す）
python -m catalyst.build build         # cache + roster + overlay → data/out/*.json
```

`meta.json` の内容: `generated_at`（ISO8601 UTC）/ `total_proposals`（全体件数）/ `roster_proposals`（名簿一致件数）/ `funds`（Fund ラベル配列）/ `stage_counts`（段階ごとの件数）/ `pending_used`（`used` が未記入の採択済み件数）

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_build.py`:

```python
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
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `cd /c/holders-core && python -m pytest tests/test_build.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalyst.build'`

- [ ] **Step 3: 最小の実装を書く**

`catalyst/build.py`:

```python
"""収集と生成の CLI。ファイル I/O はここに集める。"""
from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from . import api, overlay, profiles, roster

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "cache"
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "data" / "out"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def harvest(cache_dir: Path = CACHE_DIR) -> None:
    cache_dir = Path(cache_dir)
    proposals = api.fetch_all_proposals()
    _write(cache_dir / "proposals_raw.json", proposals)
    _write(cache_dir / "funds_raw.json", api.fetch_funds())
    print(f"harvested {len(proposals)} proposals")


def candidates(cache_dir: Path = CACHE_DIR, data_dir: Path = DATA_DIR) -> list[dict]:
    raw = _read(Path(cache_dir) / "proposals_raw.json")
    known = roster.load_roster(Path(data_dir) / "roster.json")
    hits = roster.find_candidates(raw, roster.DEFAULT_KEYWORDS)
    return [p for p in hits if not known.match(p)]


def build(
    cache_dir: Path = CACHE_DIR, data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR
) -> dict:
    cache_dir, data_dir, out_dir = Path(cache_dir), Path(data_dir), Path(out_dir)
    raw = _read(cache_dir / "proposals_raw.json")
    funds = _read(cache_dir / "funds_raw.json")
    known = roster.load_roster(data_dir / "roster.json")
    ov = overlay.load_overlay(data_dir / "overlay.json")

    matched = [p for p in raw if known.match(p)]
    decorated = [overlay.decorate(p, ov) for p in matched]
    # 一次情報リンクを持たないものは出力しない（Global Constraints）
    decorated = [d for d in decorated if d["sources"]]

    labels = profiles.fund_order(funds)
    profs = profiles.build_profiles(decorated, labels)

    counts = Counter(str(d["stage"]) for d in decorated)
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total_proposals": len(raw),
        "roster_proposals": len(decorated),
        "funds": labels,
        "stage_counts": {str(s): counts.get(str(s), 0) for s in (1, 2, 3, 4)},
        "pending_used": sum(1 for d in decorated if d["stage"] >= 2 and d["used"] is None),
    }

    _write(out_dir / "proposals.json", decorated)
    _write(out_dir / "profiles.json", profs)
    _write(out_dir / "meta.json", meta)
    return {"proposals": decorated, "profiles": profs, "meta": meta}


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "build"
    if cmd == "harvest":
        harvest()
    elif cmd == "candidates":
        for c in candidates():
            users = ", ".join(
                f"{u.get('username') or '?'}({u.get('id')})" for u in c.get("users") or []
            )
            print(f"{c['fund']['label']}\t{c['title'][:60]}\t{users}")
    elif cmd == "build":
        meta = build()["meta"]
        print(json.dumps(meta, ensure_ascii=False, indent=2))
    else:
        print(f"unknown command: {cmd}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `cd /c/holders-core && python -m pytest tests/ -v`
Expected: PASS（全38件）

- [ ] **Step 5: 実データを収集する**

```bash
cd /c/holders-core && python -m catalyst.build harvest
```

Expected: `harvested 11385 proposals`（約3分。件数は増えている可能性あり）

- [ ] **Step 6: 候補を出して名簿を人が埋める**

```bash
cd /c/holders-core && python -m catalyst.build candidates | sort | uniq
```

出力は「Fund ラベル / タイトル / 提案者(username(id))」のタブ区切り。
**ここは人の作業。** 出力を見て、日本語圏だと確認できた提案者の `id` を `data/roster.json` の `user_ids` に写す。キーワードに引っかからなかった提案者は、その提案者の他の提案が自動的に拾われるので、まず確実なものだけ入れる。

判断がつかないものは入れない（Global Constraints「推測で埋めない」）。

- [ ] **Step 7: 生成して結果を確認する**

```bash
cd /c/holders-core && python -m catalyst.build build
```

Expected: `meta` が表示され、`roster_proposals` が名簿件数に応じた数になる。`pending_used` は「④が未記入の採択済み件数」＝これから人が埋める量。

- [ ] **Step 8: コミット**

```bash
cd /c/holders-core
git add catalyst/build.py tests/test_build.py data/roster.json data/out
git commit -m "feat: ビルドCLIと日本語圏名簿の初期データ"
```

---

### Task 7: 静的サイト

**Files:**
- Create: `C:\holders-core\site\index.html`
- Create: `C:\holders-core\site\style.css`
- Create: `C:\holders-core\site\app.js`
- Create: `C:\holders-core\site\data\` （`data/out/*.json` のコピー先）

**Interfaces:**
- Consumes: `data/out/proposals.json`, `data/out/profiles.json`, `data/out/meta.json`
- Produces: なし（終端）

表示の要件（spec より）:

- 各提案に **段階バッジ①〜④** を付す
- ④が未記入のものは「**保留**」と表示する。空欄にも「未使用」にもしない
- **一次情報リンクを全件に表示する**
- 提案者行には **生の件数（提案 / 採択 / 納品 / 使用）を必ず並べる**。分類ラベルは件数の隣に置き、単独で出さない
- 成果の型（技術型 / 信頼型）は**並べるだけ**。並び順や色で優劣を示さない
- `meta.generated_at` と `pending_used`（保留件数）をページ上部に出す。**何が埋まっていないかを隠さない**

- [ ] **Step 1: データをサイトへ配置する**

```bash
cd /c/holders-core
mkdir -p site/data
cp data/out/proposals.json data/out/profiles.json data/out/meta.json site/data/
```

- [ ] **Step 2: HTML を書く**

`site/index.html`:

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalyst まとめ（日本語圏）— holders CORE</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header>
  <h1>Catalyst まとめ<span class="sub">日本語圏</span></h1>
  <p id="meta" class="meta">読み込み中…</p>
  <p class="legend">
    <span class="stage s1">① 提案</span>
    <span class="stage s2">② 採択</span>
    <span class="stage s3">③ 納品</span>
    <span class="stage s4">④ 使用</span>
    <span class="hold">保留 = ④が未記入</span>
  </p>
</header>

<main>
  <section>
    <h2>提案者</h2>
    <table id="profiles">
      <thead><tr><th>提案者</th><th>提案</th><th>採択</th><th>納品</th><th>使用</th><th>参加 Fund</th><th>形</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

  <section>
    <h2>提案</h2>
    <ul id="proposals" class="proposals"></ul>
  </section>
</main>

<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: CSS を書く**

`site/style.css`:

```css
:root {
  --bg: #12131a; --fg: #e6e6ea; --dim: #8b8d99;
  --line: #2a2c38; --card: #1a1c26;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.7 system-ui, "Yu Gothic UI", sans-serif; }
header, main { max-width: 1000px; margin: 0 auto; padding: 24px 20px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .04em; }
h1 .sub { font-size: 12px; color: var(--dim); margin-left: 10px; letter-spacing: .1em; }
h2 { font-size: 15px; color: var(--dim); font-weight: 600;
  border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 32px 0 12px; }
.meta { color: var(--dim); font-size: 13px; margin: 0 0 12px; }
.legend { font-size: 12px; color: var(--dim); display: flex; gap: 10px; flex-wrap: wrap; }
.stage { border: 1px solid var(--line); border-radius: 3px; padding: 1px 7px; white-space: nowrap; }
.s1 { color: #7d8090; } .s2 { color: #6fa8dc; } .s3 { color: #7fc39b; } .s4 { color: #d9c07a; }
.hold { color: #c98b8b; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); }
th { color: var(--dim); font-weight: 600; font-size: 12px; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.pattern { color: var(--dim); font-size: 12px; }
.proposals { list-style: none; padding: 0; margin: 0; }
.proposals li { border: 1px solid var(--line); background: var(--card);
  border-radius: 4px; padding: 10px 12px; margin-bottom: 8px; }
.row1 { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.title { font-weight: 600; }
.fund { color: var(--dim); font-size: 12px; }
.type { font-size: 12px; color: var(--dim); border: 1px solid var(--line);
  border-radius: 3px; padding: 0 6px; }
.sources { margin-top: 6px; font-size: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
.sources a { color: #7fa6c9; }
@media (max-width: 640px) { th:nth-child(6), td:nth-child(6) { display: none; } }
```

- [ ] **Step 4: JS を書く**

`site/app.js`:

```js
const PATTERNS = {
  delivering: "納品あり",
  fade_out: "採択後に静止",
  continuing_without_delivery: "納品なしで継続",
  proposing: "採択なし",
};
const TYPES = { tech: "技術型", trust: "信頼型" };
const STAGE_TEXT = { 1: "① 提案", 2: "② 採択", 3: "③ 納品", 4: "④ 使用" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

async function load(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

function renderMeta(meta) {
  document.getElementById("meta").textContent =
    `生成 ${meta.generated_at} ／ 名簿一致 ${meta.roster_proposals} 件` +
    `（全 ${meta.total_proposals} 件中） ／ ④未記入 ${meta.pending_used} 件`;
}

function renderProfiles(rows) {
  const tb = document.querySelector("#profiles tbody");
  tb.innerHTML = rows
    .map(
      (p) => `<tr>
        <td>${esc(p.username || p.user_id)}</td>
        <td class="num">${p.proposed}</td>
        <td class="num">${p.funded}</td>
        <td class="num">${p.delivered}</td>
        <td class="num">${p.used}</td>
        <td class="fund">${esc(p.funds_active.join(" / "))}</td>
        <td class="pattern">${esc(PATTERNS[p.pattern] || p.pattern)}</td>
      </tr>`
    )
    .join("");
}

function renderProposals(rows) {
  const ul = document.getElementById("proposals");
  ul.innerHTML = rows
    .map((d) => {
      const hold = d.stage >= 2 && d.used === null;
      const badge = `<span class="stage s${d.stage}">${STAGE_TEXT[d.stage]}</span>`;
      const holdTag = hold ? `<span class="hold">保留</span>` : "";
      const type = d.outcome_type
        ? `<span class="type">${esc(TYPES[d.outcome_type] || d.outcome_type)}</span>`
        : "";
      const links = d.sources
        .map((u, i) => `<a href="${esc(u)}" rel="noopener">一次情報 ${i + 1}</a>`)
        .join("");
      return `<li>
        <div class="row1">${badge}${holdTag}
          <span class="title">${esc(d.title)}</span>
          <span class="fund">${esc((d.fund || {}).label || "")}</span>${type}
        </div>
        <div class="sources">${links}</div>
      </li>`;
    })
    .join("");
}

(async () => {
  try {
    const [meta, profiles, proposals] = await Promise.all([
      load("meta"),
      load("profiles"),
      load("proposals"),
    ]);
    renderMeta(meta);
    renderProfiles(profiles);
    renderProposals(proposals);
  } catch (e) {
    document.getElementById("meta").textContent = `読み込み失敗: ${e.message}`;
  }
})();
```

- [ ] **Step 5: ローカルで表示を確認する**

```bash
cd /c/holders-core/site && python -m http.server 8765
```

ブラウザで `http://localhost:8765/` を開き、次を目視で確認する。

1. 上部に生成日時・名簿一致件数・④未記入件数が出ている
2. 提案者テーブルに **生の件数4列（提案/採択/納品/使用）が並んでいる**
3. 各提案に段階バッジが付き、④未記入の採択済みには「保留」が付いている
4. 全提案に一次情報リンクが1本以上ある

確認後 Ctrl+C でサーバーを止める。

- [ ] **Step 6: コミット**

```bash
cd /c/holders-core
git add site
git commit -m "feat: 静的サイト（段階バッジ・生件数・一次情報リンク）"
```

---

## Self-Review

**1. Spec coverage（Phase 1 スコープ）**

| spec の要求 | 実装タスク |
|---|---|
| 日本語圏の Catalyst 提案を対象 | Task 3（名簿）+ Task 6 Step 6 |
| 段階①〜④の記録 | Task 2, Task 4 |
| 提案数 / 採択数 / 納品報告 / その後の提案 の一覧 | Task 5, Task 7 |
| 一次情報リンク必須 | Task 4（`sources`）, Task 6（リンク無しは出力しない）, Task 7 |
| 成果の型の付与 | Task 4（overlay）, Task 7（優劣を付けず表示） |
| 実現も同じ精度で記録 | Task 2（`complete` → ③）, Task 5（`delivering`） |
| 無いものは「無い」と表示 | Task 4（`used=None`）, Task 7（「保留」表示・`pending_used` をヘッダに出す） |
| 人物評をしない | Task 5（件数由来の記述子のみ）, Task 7（生件数を必ず併記） |
| 月次編集を発生させない | 更新は Fund 単位の `harvest` → `build` のみ |

**2. Placeholder scan:** 全ステップに実コードあり。「適切にエラー処理」等の曖昧指示なし。Task 6 Step 6 のみ人の判断を要するが、判断基準（確認できたものだけ／推測で埋めない）を明記済み。

**3. Type consistency:** `stage_of(proposal, *, used)` / `decorate(proposal, overlay)` が返す `stage` `used` `outcome_type` `sources` `pending` `note` / `build_profiles(decorated, fund_labels)` が返す `user_id` `username` `proposed` `funded` `delivered` `used` `funds_active` `pattern` — Task 2→4→5→6→7 で名称一致を確認済み。`PATTERNS` のキーは `profiles.py` と `app.js` で一致。

**未カバー（意図的）**: リンク切れ検査は Phase 1 に入れない（一次情報 URL は Catalyst Explorer 側の恒久 URL であり、初回から検査を入れると維持コストが増えて原則4に反する）。
