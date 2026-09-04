# holders CORE

Catalyst まとめ。Cardano Project Catalyst の全提案（11,385件）を対象とする。設計書は `docs/superpowers/specs/` を参照。

## 実行手順

```
python -m catalyst.build harvest   # API から収集 → data/cache/*.json
python -m catalyst.build build     # cache + roster + overlay → site/data/*.json
```

`site/data/` は `build` が直接書き出す生成物であり、唯一の生成データである（別ディレクトリへのコピーは不要）。
