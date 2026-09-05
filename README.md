# holders CORE

Catalyst まとめ。Cardano Project Catalyst の全提案（11,385件）を対象とする。設計書は `docs/superpowers/specs/` を参照。

## 実行手順

```
python -m catalyst.build harvest      # API から収集 → data/cache/*.json
python -m catalyst.build build        # cache + roster + overlay → site/data/*.json
python -m catalyst.build harvest-geo  # 公式 global map から収集 → data/cache/global_map_raw.json
python -m catalyst.build build-geo    # cache + geo_notes → site/data/geo.json（build のあとに実行する）

python -m catalyst.build harvest-world  # Natural Earth の国境を収集 → data/cache/world_50m_raw.json
python -m catalyst.build build-world    # → site/data/world.json（地図の形だけ。数字は入らない）

python -m catalyst.build harvest-projects  # projectcatalyst.io GraphQL → data/cache/pcio_projects_raw.json（151リクエスト・数分）
python -m catalyst.build build-projects    # 台帳と突き合わせ → site/data/projects.json（harvest のあとに実行する）
```

`world` は国境の形だけを扱い、Catalyst のデータを一切含まない。国境はめったに変わらないので、
`harvest-world` は取り直す必要がほとんど無い。

`site/data/` は `build` が直接書き出す生成物であり、唯一の生成データである（別ディレクトリへのコピーは不要）。

## 二つの情報源

台帳（LEDGER）は Catalyst Explorer API だけから作る。ここは単一ソースである。

地域の層（`site/region.html`）は別で、projectcatalyst.io の公開データ（公式 global map と同じ CMS）に由来する。
プロジェクトごとの国・状態・金額・投票は GraphQL の記録のまま。提案者名だけは台帳と突き合わせて引く。
対象も粒度も違うため、台帳とは合算しない。公式側の値は書き換えず、欠陥に印を付けてそのまま出す。
判断の記録は `docs/data-notes/2026-09-05-region-layer.md` を参照。

国境の形は Natural Earth（パブリックドメイン）の 1:50m データによる。描画は自前の SVG で、
地図ライブラリもタイルサーバーも使わない。site の依存はゼロのまま。
