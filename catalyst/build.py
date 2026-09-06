"""収集と生成の CLI。ファイル I/O はここに集める。"""
from __future__ import annotations

import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from . import api, evidence, flags, funds, geo, milestones, module, overlay, prices, profiles, projects, roster, scores, timeline, translate, value, world

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


def merge_milestones(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    """集めたマイルストーンを projects.json の行に足す。

    足すのは事実だけ。取れなかった行は何も足さない（キーを作らない）。
    「無い」と「取れていない」を混ぜないため、取得できた url の一覧も残す。
    """
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    ms = _read(cache_dir / "milestones_raw.json")
    projects = _read(out_dir / "projects.json")

    rows = ms["rows"]
    got = 0
    for r in projects["rows"]:
        m = rows.get(r.get("url"))
        if not m:
            continue
        got += 1
        # 時点。startDate が無い Fund（初期）もあるのでそのまま置く。
        if m.get("start"):
            r["start"] = m["start"][:10]
        # 段。制度の無かった Fund は 0 段なので、その事実として残す。
        r["ms"] = [m.get("ms_done") or 0, m.get("ms_total") or 0]
        # 完了報告。無ければキーを作らない。
        if m.get("report"):
            r["rep"] = m["report"]
        if m.get("video"):
            r["vid"] = m["video"]
        # 止まっている日数。判定ではなく、記録が動かなくなってからの日数。
        if m.get("stale_days") is not None:
            r["stale"] = m["stale_days"]
        if m.get("milestones"):
            r["msl"] = [
                {"n": x.get("no"), "t": x.get("title"), "d": (x.get("due") or "")[:10], "s": x.get("status")}
                for x in m["milestones"]
            ]

    projects["milestones"] = {
        "fetched_at": ms.get("fetched_at"),
        "source": "https://projectcatalyst.io/funds/… の個別ページ",
        "covered": got,
        "failed": len(ms.get("failed") or {}),
    }
    _write(out_dir / "projects.json", projects)
    return projects


def merge_flags(data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR) -> dict:
    """状態フラグを projects.json に載せる。

    マイルストーンモジュールの承認日を、slug またはタイトルの一致で結び直す。
    どちらでも結べなかった行にはフラグを付けない（無いものは無いまま）。
    """
    data_dir, out_dir = Path(data_dir), Path(out_dir)
    conf = _read(data_dir / "fund_dates.json")
    projects = _read(out_dir / "projects.json")
    module_rows = _read(out_dir / "module.json")["rows"]

    def _slug(u: str | None) -> str:
        return (u or "").rstrip("/").rsplit("/", 1)[-1].lower()

    def _norm(t: str | None) -> str:
        return "".join(ch for ch in (t or "").lower() if ch.isalnum())

    by_slug = {_slug(r["url"]): r for r in projects["rows"] if r.get("url")}
    by_title: dict[str, list] = {}
    for r in projects["rows"]:
        by_title.setdefault(_norm(r.get("n")), []).append(r)

    def _num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    linked = 0
    for m in module_rows:
        row = by_slug.get(_slug(m.get("url")))
        if row is None:
            hits = by_title.get(_norm(m.get("title")), [])
            row = hits[0] if len(hits) == 1 else None
        if row is None:
            continue
        linked += 1
        row["_signed"] = [x["signed"] for x in m["ms"] if x["signed"]]
        row["_planned"] = [v for v in (_num(x["month"]) for x in m["ms"]) if v]
        row["_unsigned"] = [
            v for v in (_num(x["month"]) for x in m["ms"] if not x["signed"]) if v
        ]
        if m.get("changes"):
            row["chg"] = m["changes"]

    counts: Counter = Counter()
    for row in projects["rows"]:
        out = flags.evaluate(
            {
                "f": row.get("f"),
                "st": row.get("st"),
                "dist": row.get("dist"),
                "done": row.get("done"),
                "signed": row.pop("_signed", None),
                "planned": row.pop("_planned", None),
                "unsigned": row.pop("_unsigned", None),
            },
            fund_dates=conf["result_dates"],
            thresholds=conf["flags"],
        )
        # 空のキーは作らない。無いものは無いまま。
        if out["flags"]:
            row["fl"] = out["flags"]
        if out.get("long_years"):
            row["ly"] = out["long_years"]
        for key, src in (("yr", "years"), ("ovr", "overrun"), ("gap", "gap_days")):
            if out.get(src) is not None:
                row[key] = out[src]
        for f in out["flags"]:
            counts[f] += 1

    projects["flags"] = {
        "labels": flags.LABELS,
        "counts": dict(counts),
        "linked": linked,
        "basis": "起点は Fund の採択結果発表日。過去は資金を一度に受領しており、その日が実質の資金受取日にあたる。",
        "caveat": "承認プロセスに乗ったマイルストーンしか記録が無いため、未提出の遅れは検出できない。",
    }
    _write(out_dir / "projects.json", projects)
    return projects


def translate_evidence(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    """約束と報告を日本語に訳す。原文は書き換えず、訳を別ファイルに置く。

    途中で止めても続きから始まる。同じ文は一度しか訳さない。
    """
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    cache_path = cache_dir / "evidence_ja.json"
    cache = _read(cache_path) if cache_path.exists() else {}

    files = sorted((out_dir / "evidence").glob("*.json"))
    todo = translate.collect(files)
    print(f"訳す対象 {len(todo)} 本／既に訳済み {len(cache)} 本", flush=True)

    def save():
        _write(cache_path, cache)

    start = time.time()

    def progress(done, total, failed):
        if done % 200 == 0 or done == total:
            rate = done / max(1e-9, time.time() - start)
            left = (total - done) / rate / 60 if rate else 0
            print(f"  {done}/{total}  失敗 {failed}  残り約 {left:.0f} 分", flush=True)

    translate.run(todo, cache, on_progress=progress, save=save)

    # 訳をプロジェクトごとのファイルへ配る。原文の隣に置くのではなく別ファイル。
    ja_dir = out_dir / "evidence-ja"
    ja_dir.mkdir(parents=True, exist_ok=True)
    for old_file in ja_dir.glob("*.json"):
        old_file.unlink()

    written = missing = 0
    for path in files:
        data = _read(path)
        rows = []
        for ms in data.get("ms") or []:
            row = {"no": ms.get("no")}
            for field in ("promise", "criteria", "report"):
                text = (ms.get(field) or "").strip()
                if not text:
                    continue
                got = cache.get(translate.key_of(text))
                if got:
                    row[field] = got
                else:
                    missing += 1
            rows.append(row)
        _write(ja_dir / path.name, {"ms": rows})
        written += 1

    return {
        "translated": len(cache),
        "files": written,
        "missing": missing,
        "source": translate.SOURCE_NOTE,
    }


def merge_value(cache_dir: Path = CACHE_DIR, data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR) -> dict:
    """約束された価値と受け取った価値を projects.json に載せる。

    Fund ごとにまとめた集計と、プロジェクトごとの値の両方を置く。
    測れなかった案件には何も足さない（無いものは無いまま）。
    """
    cache_dir, data_dir, out_dir = Path(cache_dir), Path(data_dir), Path(out_dir)
    day_prices = _read(cache_dir / "ada_prices.json")["days"]
    fund_dates = _read(data_dir / "fund_dates.json")["result_dates"]
    module_rows = _read(out_dir / "module.json")["rows"]
    projects = _read(out_dir / "projects.json")

    summary = value.summarize(module_rows, day_prices, fund_dates)
    by_project = summary.pop("by_project")

    # プロジェクトの行へ配る。突き合わせは url の末尾かタイトルの一致。
    def _slug(u):
        return (u or "").rstrip("/").rsplit("/", 1)[-1].lower()

    def _norm(t):
        return "".join(ch for ch in (t or "").lower() if ch.isalnum())

    pid_by_slug, pid_by_title = {}, {}
    for row in module_rows:
        if row.get("pid") in by_project:
            pid_by_slug[_slug(row.get("url"))] = row["pid"]
            pid_by_title.setdefault(_norm(row.get("title")), []).append(row["pid"])

    linked = 0
    for row in projects["rows"]:
        pid = pid_by_slug.get(_slug(row.get("url")))
        if pid is None:
            hits = pid_by_title.get(_norm(row.get("n")), [])
            pid = hits[0] if len(hits) == 1 else None
        got = by_project.get(pid)
        if got:
            row["val"] = [got["promised"], got["received"], got["ratio"]]
            linked += 1

    summary["linked"] = linked
    projects["value"] = summary
    _write(out_dir / "projects.json", projects)
    return summary


def build_timeline(data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR) -> dict:
    """Fund の時系列を書き出す。公式の日付を手動記録で補う。"""
    data_dir, out_dir = Path(data_dir), Path(out_dir)
    rows = _read(out_dir / "funds.json")["rows"]
    manual = _read(data_dir / "fund_dates.json")
    out = timeline.build(rows, manual)
    _write(out_dir / "timeline.json", out)
    return out


def harvest_funds(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    """Fund ごとの規模を取る。いくら用意され、いくつ応募があり、いくつ採択されたか。"""
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    ids = [str(n) for n in range(1, 16)]
    out = funds.harvest(ids)
    out["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out["source"] = "https://projectcatalyst.io/funds/{n}"
    _write(cache_dir / "funds_scale_raw.json", out)
    _write(out_dir / "funds.json", out)
    return out


def harvest_prices(cache_dir: Path = CACHE_DIR) -> None:
    """ADA の日次価格を取る。約束された価値と受け取った価値を分けて読むために使う。"""
    cache_dir = Path(cache_dir)
    got = prices.harvest()
    _write(cache_dir / "ada_prices.json", {"source": prices.SOURCE, "days": got})
    days = sorted(got)
    print(f"harvested {len(got)} days  {days[0]} → {days[-1]}")


def merge_scores(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    """事前スコアの分布と、その後の結末との対応を projects.json に載せる。"""
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    ledger = _read(cache_dir / "proposals_raw.json")
    projects = _read(out_dir / "projects.json")
    projects["scores"] = scores.summarize(ledger, projects["rows"])
    _write(out_dir / "projects.json", projects)
    return projects["scores"]


def build_evidence(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    """約束と報告をプロジェクトごとの別ファイルに書く。

    一枚にすると 10MB を超えるので切る。地図は押されたときだけ読む。
    索引は projects.json に持たせ、どのプロジェクトに現物があるかを示す。
    """
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    raw = _read(cache_dir / "module_raw.json")
    by_project = evidence.build(raw)

    ev_dir = out_dir / "evidence"
    ev_dir.mkdir(parents=True, exist_ok=True)
    for old_file in ev_dir.glob("*.json"):
        old_file.unlink()

    for pid, entry in by_project.items():
        _write(ev_dir / f"{pid}.json", entry)

    # 索引を projects.json に足す。pid は projectcatalyst.io の URL から引く。
    projects = _read(out_dir / "projects.json")
    props = {p["project_id"]: p for p in raw.get("proposals") or [] if p.get("project_id")}
    by_url = {}
    for pid, prop in props.items():
        url = (prop.get("url") or "").rstrip("/").rsplit("/", 1)[-1].lower()
        if url:
            by_url[url] = pid

    def _norm(t):
        return "".join(ch for ch in (t or "").lower() if ch.isalnum())

    by_title = {}
    for pid, prop in props.items():
        by_title.setdefault(_norm(prop.get("title")), []).append(pid)

    linked = 0
    for row in projects["rows"]:
        slug = (row.get("url") or "").rstrip("/").rsplit("/", 1)[-1].lower()
        pid = by_url.get(slug)
        if pid is None:
            hits = by_title.get(_norm(row.get("n")), [])
            pid = hits[0] if len(hits) == 1 else None
        if pid is not None and pid in by_project:
            row["ev"] = pid
            row["evn"] = len(by_project[pid]["ms"])
            linked += 1

    projects["evidence"] = {
        "dir": "data/evidence",
        "projects": len(by_project),
        "linked": linked,
        "labels": evidence.KIND_LABELS,
        "note": "約束（提案時の成果物）と報告（完了報告）を、どちらも現物のまま並べている。達成・未達の判断はしていない。",
    }
    _write(out_dir / "projects.json", projects)
    return {"projects": len(by_project), "linked": linked}


def harvest_module(cache_dir: Path = CACHE_DIR) -> None:
    """マイルストーンモジュールの公開データを取る。実際の承認日はここにしかない。"""
    cache_dir = Path(cache_dir)

    def progress(table, n):
        print(f"  {table:16} {n}", flush=True)

    print("harvesting milestone module...", flush=True)
    raw = module.harvest(on_progress=progress)
    raw["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _write(cache_dir / "module_raw.json", raw)
    print(f"harvested {len(raw.get('proposals') or [])} proposals")


def build_module(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> dict:
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    raw = _read(cache_dir / "module_raw.json")
    out = module.shape(raw)
    out["fetched_at"] = raw.get("fetched_at")
    _write(out_dir / "module.json", out)
    return out


def harvest_milestones(cache_dir: Path = CACHE_DIR, out_dir: Path = OUT_DIR) -> None:
    """個別ページからマイルストーンと完了報告を集める。時間がかかるので独立させる。"""
    cache_dir, out_dir = Path(cache_dir), Path(out_dir)
    projects = _read(out_dir / "projects.json")
    urls = [r["url"] for r in projects["rows"] if r.get("url")]

    def progress(i, ok, ng):
        if i % 50 == 0 or i == len(urls):
            print(f"  {i}/{len(urls)}  取得 {ok}  失敗 {ng}", flush=True)

    print(f"harvesting {len(urls)} project pages...", flush=True)
    out = milestones.harvest(urls, on_progress=progress)
    out["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _write(cache_dir / "milestones_raw.json", out)
    print(f"harvested {len(out['rows'])} / {len(urls)}  失敗 {len(out['failed'])}")


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
    elif cmd == "harvest-milestones":
        harvest_milestones()
    elif cmd == "harvest-module":
        harvest_module()
    elif cmd == "build-module":
        out = build_module()
        print(f"projects {len(out['rows'])}")
    elif cmd == "translate-evidence":
        print(json.dumps(translate_evidence(), ensure_ascii=False, indent=2))
    elif cmd == "merge-value":
        out = merge_value()
        print(json.dumps({k: v for k, v in out.items() if k != "funds"}, ensure_ascii=False, indent=2))
        for f in out["funds"]:
            print(f"  F{f['fund']:<3} {f['n']:4}  ${f['promised']:>12,}  ${f['received']:>12,}  {(f['ratio']-1)*100:+6.0f}%")
    elif cmd == "build-timeline":
        out = build_timeline()
        print(f"{len(out['funds'])} funds  {out['from']} → {out['to']}")
        for f in out["funds"]:
            marks = " ".join(
                f"{k}:{(v.get('from') or v.get('at'))}" for k, v in f["marks"].items()
            )
            print(f"  F{f['id']:>2} {marks}")
    elif cmd == "harvest-funds":
        out = harvest_funds()
        print(f"{len(out['rows'])} funds  失敗 {len(out['failed'])}")
    elif cmd == "harvest-prices":
        harvest_prices()
    elif cmd == "merge-scores":
        print(json.dumps(merge_scores(), ensure_ascii=False, indent=2))
    elif cmd == "build-evidence":
        print(json.dumps(build_evidence(), ensure_ascii=False, indent=2))
    elif cmd == "merge-flags":
        out = merge_flags()
        print(json.dumps(out["flags"], ensure_ascii=False, indent=2))
    elif cmd == "merge-milestones":
        out = merge_milestones()
        print(json.dumps(out["milestones"], ensure_ascii=False, indent=2))
    elif cmd == "harvest-projects":
        harvest_projects()
    elif cmd == "fix-ja":
        from catalyst import ja_fix

        rep = ja_fix.apply()
        print(json.dumps(
            {"総数": rep["総数"], "手直し": len(rep["手直し"]),
             "機械": len(rep["機械"]), "捨てた": len(rep["捨てた"])},
            ensure_ascii=False, indent=2))
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
