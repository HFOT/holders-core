"""収集と生成の CLI。ファイル I/O はここに集める。"""
from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from . import api, geo, overlay, profiles, projects, roster, world

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "cache"
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "site" / "data"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_funds(path: Path) -> list[dict]:
    payload = _read(path)
    if isinstance(payload, dict):
        return payload.get("data") or []
    return payload


def _fund_slug(label: str) -> str:
    return (label or "unknown").strip().lower().replace(" ", "-")


DISPLAY_FIELDS = (
    "id",
    "title",
    "stage",
    "pending",
    "used",
    "outcome",
    "outcome_type",
    "note",
    "sources",
    "jp",
    "funding_status",
    "status",
    "amount_requested",
    "amount_received",
)


def _display(row: dict) -> dict:
    """シャードに書く表示用レコード。生の長文フィールドは載せない。"""
    out = {k: row.get(k) for k in DISPLAY_FIELDS}
    out["fund"] = {"label": (row.get("fund") or {}).get("label")}
    out["users"] = [
        {"id": u.get("id"), "name": roster.display_name(u)} for u in (row.get("users") or [])
    ]
    return out


PROFILE_DROP_FIELDS = ("proposal_ids",)


def _profile_rows(profs: list[dict], decorated: list[dict]) -> list[dict]:
    """書き出し用のプロフィール。proposal_ids を落とし、jp タグを付ける。"""
    jp_users: set[str] = set()
    for d in decorated:
        if not d.get("jp"):
            continue
        for u in d.get("users") or []:
            if u.get("id"):
                jp_users.add(u["id"])
    rows = []
    for p in profs:
        row = {k: v for k, v in p.items() if k not in PROFILE_DROP_FIELDS}
        row["jp"] = p["user_id"] in jp_users
        rows.append(row)
    return rows


def harvest_geo(cache_dir: Path = CACHE_DIR) -> None:
    """公式 global map の埋め込みデータを取る。台帳とは別の情報源なので別コマンドにする。"""
    cache_dir = Path(cache_dir)
    continents = geo.harvest()
    _write(
        cache_dir / "global_map_raw.json",
        {
            "url": geo.SOURCE_URL,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "continents": continents,
        },
    )
    rows = sum(len(c.get("countries") or []) for c in continents)
    print(f"harvested {len(continents)} continents / {rows} country rows")


def build_geo(
    cache_dir: Path = CACHE_DIR, data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR
) -> dict:
    """地域の層を書き出す。値は直さない。欠陥に印を付け、台帳との差をそのまま載せる。"""
    cache_dir, data_dir, out_dir = Path(cache_dir), Path(data_dir), Path(out_dir)
    raw = _read(cache_dir / "global_map_raw.json")
    notes_file = data_dir / "geo_notes.json"
    conf = _read(notes_file) if notes_file.exists() else {}

    shaped = geo.shape(raw["continents"], conf.get("notes", {}), conf.get("aliases", {}))

    meta_file = out_dir / "meta.json"
    if not meta_file.exists():
        raise FileNotFoundError(
            "site/data/meta.json が無い。台帳との差を出せないため中止する。先に build を実行すること。"
        )
    meta = _read(meta_file)
    stages = meta.get("stage_counts") or {}
    ledger = {
        "total_proposals": meta.get("total_proposals"),
        "funded_or_beyond": sum(int(stages.get(str(s)) or 0) for s in (2, 3, 4)),
        "generated_at": meta.get("generated_at"),
    }

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {"url": raw["url"], "fetched_at": raw["fetched_at"]},
        "ledger": ledger,
        **shaped,
    }
    _write(out_dir / "geo.json", out)
    return out


def harvest_projects(cache_dir: Path = CACHE_DIR) -> None:
    """projectcatalyst.io の GraphQL から国つき project 一覧を取る。151 リクエスト・数分かかる。"""
    cache_dir = Path(cache_dir)
    out = projects.harvest(progress=lambda m: print(m, flush=True))
    out["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _write(cache_dir / "pcio_projects_raw.json", out)
    total = sum(len(c.get("projects") or []) for c in out["challenges"])
    print(f"harvested {len(out['challenges'])} challenges / {total} project rows / {len(out['failures'])} failures")


def _money_unit(entry) -> dict | None:
    """{amount, code, exp} を {v: 整数の主単位, code: 通貨} に落とす。無ければ None。"""
    if not entry or entry.get("amount") is None:
        return None
    exp = int(entry.get("exp") or 0)
    v = int(entry["amount"]) // (10**exp)
    code = (entry.get("code") or "").replace("$", "") or "?"
    return {"v": v, "code": code}


def build_projects(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    """project 行を台帳と突き合わせ、表示用の一枚に落とす。

    国は projectcatalyst.io の記録をそのまま使う。提案者名は台帳（Catalyst Explorer）
    から、projectcatalyst_io_link の一致で引く。一致しなかった行は名前なしのまま出す。
    推測で埋めない。
    """
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    raw = _read(cache_dir / "pcio_projects_raw.json")
    ledger = _read(cache_dir / "proposals_raw.json")

    # 台帳側の突き合わせ表。第一キーは projectcatalyst.io リンクの一致（確実）。
    # 第二キーは同じ Fund 内でのタイトル一致。同名が複数あれば採らない。推測で選ばない。
    def _entry(prop: dict) -> dict:
        return {
            "users": [
                n
                for n in ((u.get("name") or u.get("username") or "").strip() for u in prop.get("users") or [])
                if n
            ],
            "explorer": f"https://www.catalystexplorer.com/en/proposals/{prop['slug']}"
            if prop.get("slug")
            else None,
        }

    def _norm(t: str) -> str:
        return "".join(ch for ch in (t or "").lower() if ch.isalnum())

    def _fund_no(label: str) -> str:
        return "".join(ch for ch in (label or "") if ch.isdigit())

    by_link: dict[str, dict] = {}
    by_title: dict[tuple, list[dict]] = {}
    for prop in ledger:
        link = prop.get("projectcatalyst_io_link")
        if link:
            by_link[link.rstrip("/").lower()] = _entry(prop)
        title_key = (_fund_no((prop.get("fund") or {}).get("label")), _norm(prop.get("title")))
        if title_key[0] and title_key[1]:
            by_title.setdefault(title_key, []).append(_entry(prop))

    fund_names = {f["_id"]: f.get("fundName") or f"Fund{f['_id']}" for f in raw.get("nav") or []}

    rows = []
    seen: set[tuple] = set()
    matched = 0
    for ch in raw["challenges"]:
        for pr in ch.get("projects") or []:
            funded = bool(pr.get("_fundingId")) or ((pr.get("voting") or {}).get("status") == "Funded")
            if not funded:
                continue
            key = (pr.get("fundId"), pr.get("projectSlug"))
            if key in seen:
                continue
            seen.add(key)
            fund_id = pr.get("fundId")
            ch_slug = ((pr.get("challenge") or {}).get("slug")) or ch.get("slug")
            url = f"https://projectcatalyst.io/funds/{fund_id}/{ch_slug}/{pr.get('projectSlug')}"
            hit = by_link.get(url.lower())
            if not hit:
                candidates = by_title.get((str(fund_id), _norm(pr.get("projectName")))) or []
                if len(candidates) == 1:
                    hit = candidates[0]
            if hit:
                matched += 1
            funding = pr.get("funding") or {}
            voting = pr.get("voting") or {}
            rows.append(
                {
                    "n": pr.get("projectName", "").strip(),
                    "f": fund_id,
                    "fund": fund_names.get(fund_id, f"Fund{fund_id}"),
                    "cat": ch.get("name"),
                    "c": pr.get("country"),
                    "ct": pr.get("continent"),
                    "g": pr.get("horizonGroup"),
                    "tg": pr.get("tags") or [],
                    "st": pr.get("projectStatus"),
                    "done": (pr.get("completed") or {}).get("date"),
                    "req": _money_unit(funding.get("requested")),
                    "dist": _money_unit(funding.get("distributedToDate")),
                    "yes": _money_unit(voting.get("yes")),
                    "votes": voting.get("votesCast"),
                    "url": url,
                    "who": (hit or {}).get("users") or [],
                    "x": (hit or {}).get("explorer"),
                }
            )

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {
            "url": "https://projectcatalyst.io/api/v1/graphql",
            "fetched_at": raw.get("fetched_at"),
            "note": "projectcatalyst.io の GraphQL（公式 global map と同じ CMS）。国は record のまま。",
        },
        "counts": {
            "rows": len(rows),
            "with_country": sum(1 for r in rows if r["c"]),
            "with_names": matched,
        },
        "failures": raw.get("failures") or [],
        "rows": rows,
    }
    # このファイルだけ大きいので、字下げ無しで書く。
    path = out_dir / "projects.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def harvest_world(cache_dir: Path = CACHE_DIR) -> None:
    """国境の形を取る。Catalyst のデータではない。めったに変わらない。"""
    cache_dir = Path(cache_dir)
    topo = world.harvest()
    _write(cache_dir / "world_50m_raw.json", topo)
    print(f"harvested {len(topo['objects']['countries']['geometries'])} country shapes")


def build_world(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    out = world.build(_read(cache_dir / "world_50m_raw.json"))
    _write(out_dir / "world.json", out)
    return out


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
    funds = _read_funds(cache_dir / "funds_raw.json")
    known = roster.load_roster(data_dir / "roster.json")
    ov = overlay.load_overlay(data_dir / "overlay.json")

    decorated = []
    for p in raw:
        d = overlay.decorate(p, ov)
        # 一次情報リンクを持たないものは出力しない（Global Constraints）
        if not d["sources"]:
            continue
        d["jp"] = known.match(p)
        decorated.append(d)

    labels = profiles.fund_order(funds)
    if not labels:
        raise ValueError(
            "funds_raw.json から Fund ラベルが1件も取れない。"
            "分類が誤って fade_out に倒れるため中止する。harvest をやり直すこと。"
        )
    profs = profiles.build_profiles(decorated, labels)

    by_fund: dict[str, list[dict]] = {}
    for d in decorated:
        label = (d.get("fund") or {}).get("label") or "unknown"
        by_fund.setdefault(label, []).append(d)

    prop_dir = out_dir / "proposals"
    index = []
    seen_labels = set()
    for label in labels:
        rows = by_fund.get(label, [])
        slug = _fund_slug(label)
        _write(prop_dir / f"{slug}.json", [_display(d) for d in rows])
        index.append({"fund": label, "file": f"{slug}.json", "count": len(rows)})
        seen_labels.add(label)
    for label in sorted(set(by_fund) - seen_labels):
        rows = by_fund[label]
        slug = _fund_slug(label)
        _write(prop_dir / f"{slug}.json", [_display(d) for d in rows])
        index.append({"fund": label, "file": f"{slug}.json", "count": len(rows)})
    _write(prop_dir / "index.json", index)

    counts = Counter(str(d["stage"]) for d in decorated)
    outcome_counts = Counter(d["outcome"] for d in decorated if d["outcome"])
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total_proposals": len(decorated),
        "proposers": len(profs),
        "jp_proposals": sum(1 for d in decorated if d["jp"]),
        "funds": labels,
        "stage_counts": {str(s): counts.get(str(s), 0) for s in (1, 2, 3, 4)},
        "pending_used": sum(1 for d in decorated if d["stage"] >= 2 and d["used"] is None),
        "outcome_counts": {
            name: outcome_counts.get(name, 0) for name in ("withdrawn", "terminated", "paused")
        },
    }

    _write(out_dir / "profiles.json", _profile_rows(profs, decorated))
    _write(out_dir / "meta.json", meta)
    return {"proposals": decorated, "profiles": profs, "meta": meta}


def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    cmd = argv[1] if len(argv) > 1 else "build"
    if cmd == "harvest":
        harvest()
    elif cmd == "harvest-geo":
        harvest_geo()
    elif cmd == "harvest-world":
        harvest_world()
    elif cmd == "harvest-projects":
        harvest_projects()
    elif cmd == "build-projects":
        out = build_projects()
        print(json.dumps({"counts": out["counts"], "failures": out["failures"]}, ensure_ascii=False, indent=2))
    elif cmd == "build-world":
        out = build_world()
        print(json.dumps({k: v for k, v in out.items() if k != "countries"}, ensure_ascii=False, indent=2))
        print(f"countries: {len(out['countries'])}")
    elif cmd == "build-geo":
        out = build_geo()
        print(json.dumps({"source": out["source"], "ledger": out["ledger"], "totals": out["totals"]},
                         ensure_ascii=False, indent=2))
    elif cmd == "candidates":
        for c in candidates():
            users = ", ".join(
                f"{roster.display_name(u) or '?'}({u.get('id')})" for u in c.get("users") or []
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
