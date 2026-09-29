#!/usr/bin/env python3
"""
fetch-draft.py — pull a season's draft out of ESPN into drafts/<year>.json,
the file the keeper page (keepers.html) reads.

    python3 tools/drafts/fetch-draft.py --year 2027

Run it once a season, after the draft. A draft never changes once it is made,
so the file it writes is committed and never needs refreshing. Several years at
once is fine: --year 2024 --year 2025 --year 2026.

The cookies are the same two fetch-season.py uses (see the note at the top of
that file for where to find them). Pass them as --espn-s2 / --swid, or set
ESPN_S2 and ESPN_SWID in the environment. They are never written anywhere.

Needs Python 3 and requests (`pip install requests`). Nothing else.
"""

import argparse
import json
import os
import sys

import requests

LEAGUE_ID = "42024189"

BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{league_id}"
PLAYERS_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/players"

# A player's `defaultPositionId`, read straight. (fetch-season.py's POSITION_MAP
# is the lineup-slot table and comes out shifted by one against this — its
# importer undoes that. Nothing here goes through it.)
POSITION = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def session_for(espn_s2, swid):
    if not espn_s2 or not swid:
        sys.exit("ESPN cookies missing: pass --espn-s2 and --swid, or set ESPN_S2 and ESPN_SWID.")
    swid = swid if swid.startswith("{") else "{" + swid
    swid = swid if swid.endswith("}") else swid + "}"
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (compatible; espn-draft-fetcher/1.0)", "Accept": "application/json"})
    s.cookies.set("espn_s2", espn_s2, domain="fantasy.espn.com")
    s.cookies.set("SWID", swid, domain="fantasy.espn.com")
    return s


def player_info(s, year, ids):
    """id -> (full name, position). The draft itself carries only ids."""
    out = {}
    ids = sorted(ids)
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        r = s.get(PLAYERS_URL.format(year=year), params={"view": "players_wl"}, headers={
            "X-Fantasy-Filter": json.dumps({"filterIds": {"value": chunk}}),
            "X-Fantasy-Platform": "kona-PROD",
        })
        r.raise_for_status()
        for p in r.json():
            out[p["id"]] = (p.get("fullName"), POSITION.get(p.get("defaultPositionId")))
    return out


def fetch(s, year):
    r = s.get(BASE_URL.format(year=year, league_id=LEAGUE_ID),
              params={"view": ["mDraftDetail", "mSettings", "mTeam"]})
    if r.status_code in (401, 403):
        sys.exit(f"ESPN rejected the login ({r.status_code}) — the cookies have most likely expired.")
    r.raise_for_status()
    data = r.json()

    detail = data.get("draftDetail") or {}
    picks = detail.get("picks") or []
    if not detail.get("drafted") or not picks or any(p.get("playerId", -1) == -1 for p in picks):
        # 2022 is one: that season ran on Sleeper, and ESPN holds an empty
        # board of -1s. (A defence is a real pick with a negative id, -16000
        # less its club's id, so only -1 means an empty slot.)
        sys.exit(f"{year}: ESPN has no completed draft for this season — nothing written.")

    settings = (data.get("settings") or {}).get("draftSettings") or {}
    info = player_info(s, year, {p["playerId"] for p in picks})
    missing = [p["playerId"] for p in picks if p["playerId"] not in info]
    if missing:
        sys.exit(f"{year}: ESPN returned no name for player ids {missing[:5]} — nothing written.")

    teams = {}
    for t in data.get("teams", []):
        teams[str(t["id"])] = t.get("name") or f"{t.get('location', '')} {t.get('nickname', '')}".strip()

    return {
        "season": year,
        # Keepers are "drafted" into the first `keepers` rounds, so the open
        # draft starts one round after them. The keeper page's round rule is
        # counted from there.
        "keepers": settings.get("keeperCount") or 0,
        "teams": teams,
        "picks": [{
            "overall": p["overallPickNumber"],
            "round": p["roundId"],
            "pick": p["roundPickNumber"],
            "team": p["teamId"],
            "player": info[p["playerId"]][0],
            "playerId": p["playerId"],
            "pos": info[p["playerId"]][1],
            "keeper": bool(p.get("keeper")),
        } for p in sorted(picks, key=lambda p: p["overallPickNumber"])],
    }


def main():
    ap = argparse.ArgumentParser(description="Fetch an ESPN draft into drafts/<year>.json.")
    ap.add_argument("--year", type=int, action="append", required=True, help="Season (repeatable)")
    ap.add_argument("--espn-s2", default=os.environ.get("ESPN_S2"))
    ap.add_argument("--swid", default=os.environ.get("ESPN_SWID"))
    args = ap.parse_args()

    s = session_for(args.espn_s2, args.swid)
    os.makedirs(os.path.join(ROOT, "drafts"), exist_ok=True)
    for year in args.year:
        draft = fetch(s, year)
        path = os.path.join(ROOT, "drafts", f"{year}.json")
        with open(path, "w") as f:
            # One pick per line: small enough to read, and a diff shows the pick.
            f.write('{\n "season": %d,\n "keepers": %d,\n "teams": %s,\n "picks": [\n' % (
                draft["season"], draft["keepers"], json.dumps(draft["teams"], ensure_ascii=False)))
            f.write(",\n".join("  " + json.dumps(p, ensure_ascii=False) for p in draft["picks"]))
            f.write("\n ]\n}\n")
        kept = sum(p["keeper"] for p in draft["picks"])
        print(f"{year}: {len(draft['picks'])} picks, {kept} keepers -> drafts/{year}.json")


if __name__ == "__main__":
    main()
