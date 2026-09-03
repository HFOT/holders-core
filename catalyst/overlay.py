"""手動追記の読み込みと適用。未記入は保留（None）のまま出す。"""
from __future__ import annotations

import json
from pathlib import Path

from . import stages

PRIMARY_LINK_FIELDS = ("link", "ideascale_link", "projectcatalyst_io_link")

ALLOWED_SCHEMES = ("http://", "https://")


def is_safe_url(url: object) -> bool:
    return isinstance(url, str) and url.strip().lower().startswith(ALLOWED_SCHEMES)


def load_overlay(path: str | Path) -> dict[str, dict]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return dict(raw.get("entries") or {})


def entry_for(overlay: dict[str, dict], proposal_id: str) -> dict:
    return overlay.get(proposal_id) or {}


def _sources(proposal: dict, entry: dict) -> list[str]:
    urls: list[str] = []
    for field in PRIMARY_LINK_FIELDS:
        url = proposal.get(field)
        if is_safe_url(url):
            urls.append(url)
    for url in entry.get("sources") or []:
        if is_safe_url(url):
            urls.append(url)
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
    out["outcome"] = stages.outcome_of(proposal)
    return out
