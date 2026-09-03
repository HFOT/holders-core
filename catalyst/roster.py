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
