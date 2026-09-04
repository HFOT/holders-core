# SDD ledger — plan: /c/holders-core/docs/superpowers/plans/2026-09-04-catalyst-matome.md
Task 1: minor (deferred): sleep 0.3s の呼び出しを検証するテストが無い（全テストが sleep=0）
Task 1: minor (deferred): fetch_json 自体（urllib に触る唯一の関数）に fake opener 経由のテストが無い
Task 1: minor (deferred): fetch_json の戻り型注釈が Any（brief は dict | list）
Task 1: complete (commits 94722ac..bc54674, review clean)
Task 2: complete (commits bc54674..dd1e698, review clean)
Task 3: minor (deferred): SEARCH_FIELDS の "excerpt" が未テスト（API に実在する項目であることは調査で確認済み）
Task 3: minor (deferred): DEFAULT_KEYWORDS の短語 (osaka/nihon) が部分一致で誤検出しうる。候補は人が確認する前提なので許容
Task 3: complete (commits dd1e698..77ff903, review clean)
Task 4: minor (deferred): _sources() が overlay 由来の sources 内の None/空文字を除去していない（proposal 側は除去済み）
Task 4: complete (commits 77ff903..d68c596, review clean)
Task 5: minor (deferred): fund_labels に無いラベルが複数あると funds_active の並びが非決定（rank が同値 len(rank)）
Task 5: minor (informational): 共著提案の amount_received は各著者に満額計上。プロフィール横断で合計すると重複する（仕様どおりだが集計時に注意）
Task 5: complete (commits d68c596..ef6fcca, review clean)
Task 6: BLOCKED->resolved — 計画の誤記「/api/funds は bare array」。実物は data 封筒付き。api.fetch_funds 側で剥がす方針に決定、計画書も訂正
Task 6: fix round 1/5 dispatched (3 open — Critical: Windows cp932 で candidates が UnicodeEncodeError / Important: build() が funds 封筒を剥がさず読む / Critical: users[].username は 0件しか埋まらず実体は name。計画の誤記、roster+profiles+build に波及)
Task 6: fix round 1/5 (3 addressed, 0 open — Windows stdout UTF-8 / _read_funds 封筒剥がし / display_name で name 優先; commits 88293ba..1633e82)
Task 6: minor (deferred): Roster.match の2重照合は name 不在時に冗長（簡約可能・欠陥ではない）
Task 6: complete-except-human-step (commits ef6fcca..1633e82, review clean). 残: data/roster.json を人が埋める（Step 6）
Task 6: SCOPE CHANGE (CORN 指示 2026-09-04)「このサイトは日本語圏だけにしない事が重要」→ roster をゲートからタグに降格、全11,385件を対象化。spec/plan 両方訂正済み
Task 6: 全件化で判明した実データ欠陥: funding_status='leftover' 29件は実質採択(全件入金済/15件complete)だが現行実装は①に落としている。terminated/paused 8件は全件funded=「静かな消滅」の実データ
Task 6b: implemented (commits 1633e82..1bb6463) — leftover が {3:15, 2:14} に是正、outcome_counts {withdrawn:5, terminated:4, paused:4}、Fund分割出力、66テスト
Task 6b: fix round 1/5 dispatched (Critical: シャードが生レコードを保持し72MBになった。ブリーフに間引き工程を書き忘れた俺のミス。_display() を追加 / Important: 追加で変更した既存テスト2件の前後比較を要求)
Task 6b: fix round 1/5 (2 addressed, 0 open — _display 間引きで 72MB->13MB / 既存テスト2件は net-neutral-or-stricter を独立検証; commits 1bb6463..0322a15)
Task 6b: minor (deferred): stages.py の FUNDED 定数が未参照のまま残っている
Task 6b: complete (commits 1633e82..0322a15, review clean)
Task 7: implemented (commit 16e940f) — サイト稼働。ヘッダ「④未記入 2,217件」表示、terminated は段階②を保持、Fund14件、68テスト。実サイトで独立検証済み
Task 7: fix round 1/5 dispatched (Critical: sources の href がスキーム未検証で javascript: が通る。esc() は URL 属性には無力。overlay._sources と app.js の両層で http(s) 限定に。Task4 の deferred minor も同時に解消 / Minor: class="s${d.stage}" が esc() を通っていない)
Task 7: fix round 1/5 (2 addressed, 0 open — is_safe_url で http(s) 限定を overlay/app.js 両層に。出力件数は不変=0本フィルタ、純粋な予防; commits 16e940f..f44dc1b)
Task 7: complete (commits 0322a15..f44dc1b, review clean). 72テスト
Task 7: minor (deferred): app.js の safe() を直接検証する自動テストは無い（手動ブラウザ確認のみ）
FINAL REVIEW (opus): Critical 1件 = leftover と同型の欠陥が95件規模で残存（funding_status ラベルのみで②判定、status/amount_received を無視）。他 Critical 1・High 1・Medium 2
FINAL FIX WAVE: 5件すべて ADDRESSED、新規破壊なし、78/78 pass (commits f44dc1b..11d25b6)
  - was_funded() で②を証拠ベース判定に変更 → 130件が①→②/③ へ移動（9,489,845 ADA 分）。提案者40名の分類が変化、36名が proposing から脱出
  - data/out/ を廃止し site/data/ を唯一の生成先に（手作業同期による陳腐化の根絶）
  - total_proposals を decorated ベースに / 共著受領額の重複計上をフッターで開示 / fund_labels 空で ValueError
  - 全件回帰テスト tests/test_stages_corpus.py 新設（2行フィクスチャがこの欠陥を2度素通りさせたため）
Task 8: デザイン刷新 dispatched（CORN 指示「アップルのようなおしゃれなサイト」）。ブリーフに「洗練＝情報を減らす」を禁止として明記
Task 8: complete (commit 11d25b6..3b99deb, review clean — 指摘ゼロ)。バッジは色を使わず線種で3軸を区別（段階=実線/保留=破線/転帰=点線/未使用=塗り）
Task 9: holders CORE 入口 (f313de3) — 三層と三計器の現在地。未公開2計器は「手元にあるが未公開」でリンクにしない
Task 10: MAP層 (ce97c5a) — TIDE(CLARITY法案3件/ADA ETF3件、一次情報は govinfo・clerk.house.gov・SEC EDGAR まで到達) + FUEL。実装者が「9月採決予定」の記載を鉄則違反として自主的に却下
Task 11: YOU層 (c0cdf50) — 属性6つ/属性別の有無/DRep rationale五軸。実装者がブリーフの「3つがリンク」を実数4つに訂正（数字合わせの嘘を拒否）
SITE FINAL REVIEW (opus): Critical 1 = 入口フッターが「holder のために」を目的として掲げていた（俺のブリーフ由来。設計書の自戒に違反、you.html と矛盾）+ padding shorthand によるガター消失 + 未公開計器名の減光
SITE FIX WAVE: 6件すべて修正・実測検証済 (1609b56)。4ページのインセットが 375px/1400px で完全一致、未公開計器名が --fg に復帰
