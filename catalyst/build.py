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
