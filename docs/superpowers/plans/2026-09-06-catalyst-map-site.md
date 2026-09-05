# Catalyst Detailed Map サイト構築 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalyst Detailed Map の TOP（読み物本体）を作り、動いている地図をそのままはめ込む。

**Architecture:** 地図の母体（`region.html` / `region.js` / `ask.js` / 共用 `style.css`）には**一文字も触らない**。新サイトは TOP 1ページだけを新規に作り、地図は `<iframe src="../region.html?view=neo">` ではめ込む。地図のコードが新サイト側に一行も存在しないので、二つ目の母体が構造的に作れない。

**Tech Stack:** 素の HTML / CSS（モジュールもバンドラも使わない。既存の作法）。テストは Python + pytest（既存 144 件）。

## Global Constraints

設計は `docs/superpowers/specs/2026-09-06-catalyst-map-site-design.md`。以下は全タスクに常にかかる。

- **地図の母体を変えない。** `site/region.html` `site/region.js` `site/ask.js` を編集しない。
  Task 1 のテストがハッシュで機械的に守る
- **共用 `site/style.css` を変えない。** TOP のスタイルは
  `site/catalyst-map/style.css` に新規で書く
- **編集場所は一つ。** 地図に関わる JS を新サイト側に書かない
- **判断しない。** 達成・未達を決めない。良し悪しを書かない
- **推測で埋めない。** 「測れない」を「変化なし」にしない
- **色相で優劣を作らない。** ⑪ の `−$674万` に赤を使わない
- **データの限界を隠さない。** 取れていないものは件数を書く
- **DRep について評価を書かない。** このサイトは DRep のデータを持たない
- **トレジャリー Map を「作っている」と書かない。** 問いのまま置く
- `?v=` は末尾の数字を上げる方式（`cm-1` → `cm-2`）。ハッシュにしない
- 既存の Python テスト 144 件は常に緑（`python -m pytest -q`）
- push しない。ローカルの commit のみ

確認は `cd C:\holders-core\site && python -m http.server 8955` → Ctrl+F5。

### 母体との接点（この3つだけ）

| 使うもの | 何に使うか |
|---|---|
| `../region.html?view=neo` | 地図を全画面で iframe にはめ込む。`wireFullscreen()` が既に対応済み（region.js:1886） |
| `../region.html#sec-gap` / `#sec-value` / `#sec-scores` / `#sec-timeline` / `#sec-list` | 「記録の質」への誘導。下段5セクションは region.html にあるまま |
| `../region.html` | 地図をひらく |

---

### Task 1: TOP の骨と、地図のはめ込み

TOP を新規に作り、ヒーローに動いている地図そのものを置く。地図は iframe なので母体には触らない。

**Files:**
- Create: `site/catalyst-map/index.html`
- Create: `site/catalyst-map/style.css`
- Test: `tests/test_catalyst_map_site.py`（新規）

**Interfaces:**
- Consumes: `site/region.html?view=neo`（既存・無改変）
- Produces: `site/catalyst-map/index.html` が立つ。ヒーローに実物の地図が動く

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_catalyst_map_site.py` を新規作成:

```python
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
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def test_top_page_exists():
    assert (CMAP / "index.html").exists()
    assert (CMAP / "style.css").exists()


def test_top_embeds_the_real_map_instead_of_reimplementing_it():
    src = read("index.html")
    assert "../region.html?view=neo" in src, "地図をはめ込んでいない"
    # 新サイト側に地図の実装が漏れていない
    for w in ["orthographic", "globePath", "drawGlobe", "buildMap", "renderPlist"]:
        assert w not in src, f"地図の実装が TOP に漏れている: {w}"


def test_top_has_no_javascript_of_its_own_for_the_map():
    """地図の JS ファイルを新サイトに置いていない。"""
    assert not list(CMAP.glob("*map*.js"))
    assert not (CMAP / "region.js").exists()


def test_top_does_not_load_the_shared_stylesheet_map_rules():
    """TOP は自前の CSS を持つ。共用 style.css を書き換えない前提。"""
    assert 'href="style.css' in read("index.html")
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd C:\holders-core && python -m pytest tests/test_catalyst_map_site.py -v`
Expected: FAIL（`site/catalyst-map` が無く `test_top_page_exists` が AssertionError）

- [ ] **Step 3: 母体のハッシュを固定するテストを足す**

Step 2 で構造が見えたので、母体の現在値を測って固定する:

```bash
cd C:\holders-core && python -c "
import hashlib, pathlib
for n in ['region.html','region.js','ask.js','style.css']:
    p = pathlib.Path('site')/n
    print(f'    \"{n}\": \"{hashlib.sha256(p.read_bytes()).hexdigest()[:16]}\",')
"
```

出力をそのまま `tests/test_catalyst_map_site.py` に貼る:

```python
# Task 1 時点の母体。意図して変えたときだけ更新する。
EXPECTED = {
    # ここに上のコマンドの出力を貼る
}


def test_map_body_is_untouched():
    """地図の母体を変えていない。変わったら、それは別の作業として
    意識的にやったはずなので、EXPECTED を更新して commit する。"""
    for name, want in EXPECTED.items():
        got = digest(SITE / name)
        assert got == want, f"{name} が変わっている（{want} → {got}）"
```

- [ ] **Step 4: `index.html` を作る**

`site/catalyst-map/index.html`:

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalyst Detailed Map</title>
<meta name="description" content="ホルダーの投票で採択された 2,221 件が、いまどうなっているか。公開情報だけで辿れる場所。">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css?v=cm-1">
</head>
<body>

<!-- ① ヒーロー ─────────────────────────────────── -->
<section class="cm-hero">
  <iframe class="cm-hero-map" src="../region.html?view=neo"
          title="Catalyst Detailed Map" loading="eager"></iframe>
  <div class="cm-hero-copy">
    <h1>あなたが投票した提案は、いま どうなっているか。</h1>
    <p>6年で 2,221 件が採択された。<br>
       完了 1,722 件。中止 269 件。報告は 1,716 件ぶん出ている。</p>
    <p class="cm-lead">それを見渡せる場所は、まだ無い。</p>
    <p><a class="cm-cta" href="../region.html">地図をひらく</a></p>
  </div>
</section>

<!-- ② 計器 ────────────────────────────────────── -->
<section class="cm-figures">
  <div class="cm-wrap cm-fig-row">
    <div class="cm-fig"><b>11,385</b><span>提案</span></div>
    <div class="cm-fig"><b>2,221</b><span>採択</span></div>
    <div class="cm-fig"><b>1,722</b><span>完了</span></div>
    <div class="cm-fig"><b>269</b><span>中止</span></div>
  </div>
</section>

</body>
</html>
```

**iframe について:** ヒーローには地図フレーム全体（左サイドバー込み）がそのまま出る。
地球儀だけにするには母体に手を入れる必要があるので、しない。
動いている本物が丸ごと見えるほうが、この TOP の目的には合っている。

- [ ] **Step 5: `style.css` を作る**

`site/catalyst-map/style.css`。共用 CSS を読まないので、必要な骨だけ自前で持つ:

```css
/* Catalyst Detailed Map — TOP 専用。
   地図の見た目は region.html 側（共用 style.css）が持つ。ここは触らない。 */

:root {
  --cm-bg: #0b0f14;
  --cm-fg: #e8eef5;
  --cm-dim: #8fa3b8;
  --cm-line: rgba(255, 255, 255, .12);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--cm-bg);
  color: var(--cm-fg);
  font: 16px/1.9 system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
}
.cm-wrap { max-width: 980px; margin: 0 auto; padding: 0 24px; }

/* ① ヒーロー */
.cm-hero { position: relative; min-height: 100vh; }
.cm-hero-map {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  border: 0;
}
.cm-hero-copy {
  position: relative;
  pointer-events: none;               /* 地図の操作を邪魔しない */
  max-width: 720px;
  margin: 0 auto;
  padding: 12vh 24px 0;
  text-shadow: 0 2px 24px rgba(0, 0, 0, .85);
}
.cm-hero-copy a { pointer-events: auto; }
.cm-hero-copy h1 {
  font-size: clamp(1.9rem, 4.6vw, 3.4rem);
  line-height: 1.35;
  margin: 0 0 1.2em;
  font-weight: 700;
}
.cm-lead { font-size: clamp(1.2rem, 2.6vw, 1.9rem); margin: 1.6em 0; }
.cm-cta {
  pointer-events: auto;
  display: inline-block;
  padding: .9em 2.2em;
  border: 1px solid var(--cm-line);
  border-radius: 999px;
  color: var(--cm-fg);
  text-decoration: none;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, .06);
}
.cm-cta:hover { background: rgba(255, 255, 255, .12); }

/* ② 計器 */
.cm-figures { padding: 14vh 0; border-top: 1px solid var(--cm-line); }
.cm-fig-row { display: flex; flex-wrap: wrap; gap: 3rem; justify-content: center; }
.cm-fig { text-align: center; }
.cm-fig b { display: block; font-size: clamp(2rem, 6vw, 4rem); font-weight: 700; }
.cm-fig span { color: var(--cm-dim); font-size: .95rem; }
```

**ヒーローのコピーが地図の操作を潰さないよう `pointer-events: none` を置く。**
これを忘れると、地球儀を掴んで回せなくなる。

- [ ] **Step 6: テストが通ることを確かめる**

Run: `cd C:\holders-core && python -m pytest -q`
Expected: 全件 PASS（新規5件 + 既存 144 件）

- [ ] **Step 7: ブラウザで確かめる**

`http://127.0.0.1:8955/catalyst-map/` を Ctrl+F5。

- ヒーロー全面に地図が出る。平面地図が描画されている
- **地図が操作できる。** 「地球」ボタンで球になり、自動回転する。掴んで回せる。
  国を押すと左に一覧が出る（`pointer-events` が効いている証拠）
- ヒーローのコピーが地図の上に読める
- `地図をひらく` で `region.html` に行く
- スクロールすると計器4つが出る
- Console にエラーが無い
- **`region.html` を直接開いて、いままでどおり動く**（母体を壊していない）

- [ ] **Step 8: commit**

```bash
cd C:\holders-core
git add site/catalyst-map tests/test_catalyst_map_site.py
git commit -m "Catalyst Detailed Map の TOP を作り、地図をはめ込む

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: [見る] 段の見せ場 ③④⑤ と、[知る] 段 ⑥〜⑫

TOP の本文。地図はもうヒーローに1つある。③④⑤ で二度目・三度目のインスタンスを作らない。

**Files:**
- Modify: `site/catalyst-map/index.html`
- Modify: `site/catalyst-map/style.css`

**Interfaces:**
- Consumes: Task 1
- Produces: なし（TOP の本文のみ）

**⑦ の実数は測定済み**（2026-09-06、`site/data/projects.json`、未完了だけで集計）:

- 未完了 313 件（active 226 / funded 84 / onboarding 3）
- 記録が動いてから 365日超 12 件、180日超 31 件、最長 603 日
- 記録そのものが無いもの 90 件
- Fund 9 以前の未完了 78 件（F6 が 21、F7 が 22）

再測定するときのコマンド:

```bash
cd C:\holders-core && python -c "
import json
d=json.load(open('site/data/projects.json',encoding='utf-8'))
live=[r for r in d['rows'] if (r.get('st') or '').lower() in ('active','funded','onboarding')]
ws=[r for r in live if r.get('stale') is not None]
v=sorted(r['stale'] for r in ws)
print('未完了',len(live),'/ stale あり',len(ws),'/ 無し',len(live)-len(ws))
for th in (180,365): print(f'  >{th}日:',sum(1 for x in v if x>th))
"
```

- [ ] **Step 1: ③④⑤ MAP の見せ場を書く**

計器の下に足す:

```html
<!-- ③④⑤ MAP の見せ場 ──────────────────────── -->
<section class="cm-show">
  <div class="cm-wrap">
    <h2>国から入る</h2>
    <p>97 の国。押すとその国の採択が全部出る。</p>
  </div>
</section>

<section class="cm-show">
  <div class="cm-wrap">
    <h2>人から入る</h2>
    <p>5,699 人。関わった全部と、単独提案だけを切り替えられる。</p>
    <p class="cm-note">51% が共同提案なので、人物別に足すと ADA が 2.0 倍・USD が 2.5 倍になる。それも隠さず出す。</p>
  </div>
</section>

<section class="cm-show">
  <div class="cm-wrap">
    <h2>一件まで降りる</h2>
    <p>完了報告の動画 587 件。報告書 1,761 件。<br>
       約束と報告を左右に並べる。判断はしない。</p>
    <p><a class="cm-cta" href="../region.html">地図をひらく</a></p>
  </div>
</section>
```

- [ ] **Step 2: ⑥ 完了報告は、存在する**

```html
<section class="cm-fact">
  <div class="cm-wrap">
    <p class="cm-big">1,716 / 1,722</p>
    <h2>完了報告は、存在する</h2>
    <p>98% に証拠リンク。GitHub だけで 23,890 本。<br>
       誰も並べていなかっただけ。</p>
  </div>
</section>
```

- [ ] **Step 3: ⑦ 採択された提案は、その期間 生きていたか**

断定にしない。問いのまま置く:

```html
<section class="cm-ask">
  <div class="cm-wrap">
    <h2>採択された提案は、その期間 生きていたか</h2>
    <p>いま完了していないものが 313 件ある。<br>
       そのうち記録が動いてから 365 日を超えたものが 12 件。<br>
       記録そのものが取れていないものが 90 件。</p>
    <p class="cm-note">これは記録が動いた日であって、活動があった日ではない。
       動いていたのに記録していないものと、止まっていたものを、この線は区別しない。</p>
    <p class="cm-note">区別できないまま、それでも線を引く。<br>
       引かなければ、誰の目にも入らないままになるから。</p>
  </div>
</section>
```

- [ ] **Step 4: ⑧ 事前の評価**

```html
<section class="cm-fact">
  <div class="cm-wrap">
    <p class="cm-big">3.67 <span class="cm-op">=</span> 3.67</p>
    <p class="cm-big-sub">中止 72 件　　完了 732 件</p>
    <h2>事前の評価は、その後を何も言い当てていない</h2>
    <p>6,908 件の 71% が 3.30〜4.00 に収まる（標準偏差 0.46）。<br>
       評価の労力は全部、金が動く前に置かれている。</p>
    <p><a class="cm-more" href="../region.html#sec-scores">事前の評価を見る →</a></p>
  </div>
</section>
```

- [ ] **Step 5: ⑨ 議論は、金が動く前にしかない**

⑧ と数字を重ねない。中央値を再掲しない:

```html
<section class="cm-ask">
  <div class="cm-wrap">
    <h2>議論は、金が動く前にしかない</h2>
    <p>議論の記録は 6,908 件ある。すべて投票の前のものだ。</p>
    <p>投票の後に、これがどう見られ、どう議論され、
       どれだけ広まったかの記録は、どこにも無い。<br>
       拡散も議論も、測る場所が用意されていない。</p>
    <p class="cm-note">このサイトが埋められるのは、記録を目に留まる場所へ置くところまで。</p>
  </div>
</section>
```

- [ ] **Step 6: ⑩ 歴史**

採択率は単調に下がっていない、と書く:

```html
<section class="cm-fact">
  <div class="cm-wrap">
    <p class="cm-big">32.6% <span class="cm-op">→</span> 10.2%</p>
    <p class="cm-big-sub">F11 から F14 へ</p>
    <h2>採択率は、上下しながら下がっている</h2>
    <p>F8 で 32.4%、F9 で 17.8%、F10 で 13.1% まで落ちてから
       F11 で 32.6% に戻り、また落ちた。<br>
       応募のピークは F13 の 1,639 件。F14 は 1,283 件で減っている。</p>
    <p><a class="cm-more" href="../region.html#sec-timeline">Fund の歩みを見る →</a></p>
  </div>
</section>
```

- [ ] **Step 7: ⑪ 相場で動いた額**

`−$674万` に赤を使わない:

```html
<section class="cm-fact">
  <div class="cm-wrap">
    <p class="cm-big">−$674万</p>
    <h2>相場で動いた額</h2>
    <p>F10・F11 は +28〜30%、F13・F14 は −29〜31%。<br>
       全体の −6% は逆向きの動きが打ち消し合った結果で、
       Fund 別に見ないと構造が消える。</p>
    <p><a class="cm-more" href="../region.html#sec-value">価値の差を見る →</a></p>
  </div>
</section>
```

- [ ] **Step 8: ⑫ 現在地 2026**

```html
<section class="cm-now">
  <div class="cm-wrap">
    <h2>現在地 —— 2026</h2>
    <ol class="cm-steps">
      <li><b>2026-02-24</b> 運営が IOG から Cardano Foundation へ移った。
        <a href="https://www.cryptotimes.io/2026/02/24/cardano-foundation-assumes-stewardship-of-project-catalyst/">出典</a></li>
      <li><b>Fund 15</b> は 1,850万 ADA + 1,279万 USD + 25万 USDM が用意され、
        配分はゼロのままトレジャリーへ返還された。データにそのまま出ている。
        <a href="https://projectcatalyst.io/funds/15">出典</a></li>
      <li><b>2026-08</b> Catalyst Pilot が始まった。250万 ADA、10〜15 件、
        成果連動払い 40/40/20。ADA 枠だけで比べると F13 の 1/18。
        採択結果はまだ出ていない。
        <a href="https://forum.cardano.org/t/new-catalyst-pilot-fund-launching-this-summer/155306">出典</a></li>
    </ol>
    <p class="cm-note">F13 は ADA 4,650万 と USD 4,878万の二本立てなので、
       ADA 枠だけの比較であることを断っておく。</p>
  </div>
</section>
```

- [ ] **Step 9: CSS を足す**

`site/catalyst-map/style.css` に追記:

```css
/* ③④⑤ 見せ場 */
.cm-show { padding: 18vh 0; border-top: 1px solid var(--cm-line); }
.cm-show h2 { font-size: clamp(1.6rem, 4vw, 2.8rem); margin: 0 0 .8em; }

/* ⑥⑧⑩⑪ 同じ形で4回反復する。ここがリズムになる */
.cm-fact { padding: 20vh 0; border-top: 1px solid var(--cm-line); text-align: center; }
.cm-big {
  font-size: clamp(3rem, 12vw, 9rem);
  font-weight: 700;
  line-height: 1.05;
  margin: 0;
  letter-spacing: -.02em;
}
.cm-op { color: var(--cm-dim); font-weight: 400; }
.cm-big-sub { color: var(--cm-dim); margin: .6em 0 0; font-size: 1rem; }
.cm-fact h2 { font-size: clamp(1.4rem, 3.4vw, 2.2rem); margin: 1.4em 0 .6em; }

/* ⑦⑨ 問い。⑫ 現在地。形を変えて呼吸の切れ目にする */
.cm-ask, .cm-now { padding: 20vh 0; border-top: 1px solid var(--cm-line); }
.cm-ask h2, .cm-now h2 { font-size: clamp(1.5rem, 3.6vw, 2.4rem); margin: 0 0 1.2em; }
.cm-note { color: var(--cm-dim); font-size: .95rem; }
.cm-steps { list-style: none; padding: 0; }
.cm-steps li { padding: 1.4em 0; border-top: 1px solid var(--cm-line); }
.cm-steps b { display: block; color: var(--cm-dim); font-size: .9rem; }
.cm-more { color: var(--cm-fg); }
```

- [ ] **Step 10: ブラウザで確かめる**

`catalyst-map/` を Ctrl+F5。

- ⑥⑧⑩⑪ が同じ形で4回反復し、⑦⑨⑫ が違う形で挟まる
- `../region.html#sec-scores` `#sec-timeline` `#sec-value` が該当セクションに飛ぶ
- スクロールで一つずつ現れる（1画面1事実になっている）
- Console にエラーが無い

- [ ] **Step 11: commit**

```bash
cd C:\holders-core
git add site/catalyst-map
git commit -m "TOP に MAP の見せ場と [知る] 段を置く

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: [使う] 段 ⑬⑭ と、holders CORE からの導線

TOP を問いで閉じ、CORE を入口にする。

**Files:**
- Modify: `site/catalyst-map/index.html`
- Modify: `site/catalyst-map/style.css`
- Modify: `site/index.html`（MAP NEO カードの行き先）
- Modify: `docs/superpowers/specs/2026-09-06-catalyst-map-site-design.md`
- Modify: `tests/test_catalyst_map_site.py`

**Interfaces:**
- Consumes: Task 2
- Produces: サイトが閉じる。CORE から入れる

- [ ] **Step 1: 失敗するテストを書く**

作法を機械で守る。⑭ でうっかり約束を書かないための歯止め:

```python
def test_top_does_not_promise_an_unbuilt_treasury_map():
    src = read("index.html")
    for bad in ["作っている", "作成中", "近日", "coming soon"]:
        assert bad not in src, f"作っていないものを約束している: {bad}"
    assert "トレジャリーにも、同じ場所が要るのではないか" in src


def test_holders_core_is_the_entrance():
    src = (SITE / "index.html").read_text(encoding="utf-8")
    assert "catalyst-map/" in src, "CORE から Catalyst Map へ入れない"
```

**注意:** `site/index.html` を変えると Task 1 の `test_map_body_is_untouched` は
落ちない（`index.html` は母体4ファイルに入っていない）。共用 `style.css` は
触らないので、そちらのハッシュは変わらないままであること。

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd C:\holders-core && python -m pytest tests/test_catalyst_map_site.py -v`
Expected: FAIL

- [ ] **Step 3: ⑬ このサイトが埋められないもの**

```html
<section class="cm-limit">
  <div class="cm-wrap">
    <h2>このサイトが埋められないもの</h2>
    <p>報告が出ていることと、書かれたとおりに起きたことは別である。<br>
       その誤差は、ここでは埋められない。判断はあなたがする。</p>
    <p>埋められるのはもう一つの差のほうだ。<br>
       記録は存在しているのに、投票した人の目に届いていない。<br>
       2,221 件を採択したのはホルダーで、
       その後どうなったかを見る場所は、その手元に返ってきていない。</p>
    <p class="cm-lead">ここは、それを返す場所である。</p>
    <p><a class="cm-more" href="../region.html#sec-gap">記録の質を見る →</a></p>
  </div>
</section>
```

- [ ] **Step 4: ⑭ 同じ感覚のまま、次が始まっている**

DRep を評価しない。トレジャリー Map を約束しない:

```html
<section class="cm-close">
  <div class="cm-wrap">
    <h2>同じ感覚のまま、次が始まっている</h2>
    <p>Catalyst は 6年で 2,221 件を採択した。
       完了 1,722 件、中止 269 件、報告 1,716 件。<br>
       報告は出ていた。目に留まる場所に無かっただけだ。<br>
       評価する構造は無いまま、資金は配られてきた。</p>
    <p>いま、ホルダーは DRep に権限を預け、
       DRep がトレジャリーの配分を決めている。</p>
    <p>預けるときに見ていたものは、
       Catalyst で投票するときに見ていたものと、同じではないか。<br>
       表明と、公約と、事前の評価。<br>
       その後を見る場所は、まだ返ってきていない。</p>
    <p class="cm-lead">─ いま、どう感じるか。</p>
    <p class="cm-lead">トレジャリーにも、同じ場所が要るのではないか。</p>
  </div>
</section>
```

- [ ] **Step 5: CORE を入口にする**

`site/index.html` の MAP NEO カードの行き先を変える（43行目）:

```html
<a class="map-neo" href="catalyst-map/" aria-label="Catalyst Detailed Map をひらく">
```

カードの文言も TOP と揃える（`map-neo-title` は `Catalyst<br>MAP NEO` のまま残すか、
`Catalyst<br>Detailed Map` に変えるかは見た目を見て決める。CSS は触らない）。

**`site/catalyst.html` の `region.html` へのリンクは変えない。**
台帳から地図へ降りる導線であって、TOP を通す必要は無い。
念のため確認: `grep -n 'region.html' site/*.html`

- [ ] **Step 6: CSS を足す**

```css
.cm-limit, .cm-close { padding: 20vh 0; border-top: 1px solid var(--cm-line); }
.cm-limit h2, .cm-close h2 { font-size: clamp(1.5rem, 3.6vw, 2.4rem); margin: 0 0 1.2em; }
.cm-close { padding-bottom: 30vh; }   /* ここで終わる。他へ誘導しない */
```

- [ ] **Step 7: 仕様書を実装に合わせて直す**

`docs/superpowers/specs/2026-09-06-catalyst-map-site-design.md` を、
実際に作ったものに合わせる。3箇所:

1. **「ページ」の節** —— 3ページ（index / map / notes）ではなく、
   TOP 1ページ + 既存の `region.html`。理由を書く:

```
### ページ

site/catalyst-map/index.html   TOP（読み物本体）
site/region.html               地図と記録の質。既存。無改変

地図の母体（region.html / region.js / ask.js / 共用 style.css）を
一文字も変えないことを最上位の制約に置いたので、
notes.html は作らない。「記録の質」の5セクションは region.html の
下段にあるまま、TOP から #sec-gap / #sec-value / #sec-scores /
#sec-timeline / #sec-list へ直接リンクする。

新サイト側に地図の JS が一行も無いので、二つ目の母体が構造的に作れない。
```

2. **「JS の分割」「二つのモード」の節** —— まるごと差し替える:

```
### 地図のはめ込み

region.js は割らない。MAP_MODE も足さない。母体を変えないため。

TOP のヒーローは <iframe src="../region.html?view=neo"> で
動いている地図そのものをはめ込む。?view=neo は既存の機能
（region.js:1886 wireFullscreen）で、地図フレームを全画面にする。
index.html の MAP NEO カードが以前から使っていたもの。

ヒーローには地図フレーム全体（左サイドバー込み）が出る。
地球儀だけにするには母体に手を入れる必要があるのでしない。
```

3. **「未決」の節** —— 4つのうち3つが決まったので更新:

```
1. ページの題 —— `Catalyst Detailed Map`（英語）。決定済み
2. 青いネオン化 —— 未決。catalyst-map/style.css だけを触ればできる
3. stale の実数 —— 測定済み（未完了 313 / 365日超 12 / 記録なし 90）
4. 2026年の記録 —— ⑫ に実装済み
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `cd C:\holders-core && python -m pytest -q`
Expected: 全件 PASS。特に `test_map_body_is_untouched` が緑であること
（母体4ファイルを一度も触っていない証明）

- [ ] **Step 9: 通しで確かめる**

- `index.html`（CORE）→ MAP NEO カード → `catalyst-map/` に着く
- `catalyst-map/` を上から下まで通してスクロール。
  ヒーローの問い「いま どうなっているか」で始まり、
  ⑭ の問い「トレジャリーにも、同じ場所が要るのではないか」で終わる
- ヒーローの `地図をひらく`、⑤ の `地図をひらく`、
  ⑧⑩⑪⑬ の `→` リンクが全部生きている
- **`region.html` が以前と全く同じに動く。**
  地図・左サイドバー・詳細パネル・ツールチップ・LENS 連携・下段5セクション
- `region.html?view=neo` が全画面で開く
- 全ページ Console にエラーが無い

- [ ] **Step 10: commit**

```bash
cd C:\holders-core
git add site docs tests
git commit -m "TOP を問いで閉じ、CORE を Catalyst Detailed Map の入口にする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## この計画で扱わないこと

- **地図の母体への変更**（最上位の制約）
- **`notes.html`** —— 「記録の質」は region.html の下段にあるまま
- **青いネオン化** —— `catalyst-map/style.css` だけを触ればできる。別の作業
- **トレジャリー Map** —— 問いのまま置く
- **状態フラグのリスト化**（`overdueList` / `gapList` / `oldList`）。
  ⑦ を「どれが該当するか」まで厚くするなら効く。母体を触るので別の作業
- **`poas_reviews` の取得**
- **push**（ローカルの commit のみ）
