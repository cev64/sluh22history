#!/usr/bin/env python3
"""
fetch-season.py — pull every week of the season that has been played out of
ESPN, into ONE file.

Download this file, fill in the settings below, and run it:

    python3 fetch-season.py

There is no week to set. It walks the season from week 1 and stops at the first
week that has not finished, so a run in October writes weeks 1 through whatever
the newest completed week is. Run it again next week and it writes the same file
with one more week in it.

It writes season_<year>.json, holding every week it found. Upload that ONE file
to the Drive weekly_box folder, replacing the copy already there — the site is
rebuilt from whatever that file says, so a stat ESPN restated in an old week
travels along with it and fixes itself.

Needs Python 3 and requests (`pip install requests`). Nothing else.
"""

# ===========================================================================
#  EDIT THIS BLOCK. Nothing else in this file needs touching.
# ===========================================================================

YEAR = 2026
LEAGUE_ID = "42024189"

# --- your ESPN login, set once and refreshed when it expires -----------------
#
# The league is private, so ESPN needs two cookies from a logged-in browser
# session. To find them: log in to fantasy.espn.com, open DevTools (F12) ->
# Application (or Storage) -> Cookies -> https://fantasy.espn.com, and copy:
#
#   SWID     looks like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} — keep the braces
#   espn_s2  a very long string of letters, digits and %-escapes
#
# They last a few months. When the script starts failing with 401, come back
# here and paste fresh ones.
#
#   ⚠  ONCE YOU PASTE THESE IN, THIS FILE HOLDS A LIVE LOGIN TO YOUR ESPN
#      ACCOUNT. Keep your filled-in copy on your own machine. The version in
#      the repository is public and must keep the placeholders below — never
#      commit or share a copy with the real values in it.

SWID = "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
ESPN_S2 = "PASTE_YOUR_ESPN_S2_COOKIE_HERE"

# ===========================================================================
#  Nothing below here needs editing.
# ===========================================================================

import argparse
import json
import os
import sys

import requests


# ---------------------------------------------------------------------------
# ESPN's static ID -> name lookup tables (football). These IDs are stable
# and undocumented but well known from the fantasy football community.
#
# Note that `position` comes out shifted by one against what it claims — a
# tight end reports "WR", a receiver reports "RB/WR", a quarterback reports
# "TQB". That is ESPN's, not a bug here, and tools/boxscores/import.mjs
# translates it and checks the translation against the slot each starter
# actually started in. Do not "fix" it here; the importer would then reject
# every file this writes.
# ---------------------------------------------------------------------------

PRO_TEAM_MAP = {
    0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL",
    7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV",
    14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG",
    20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF",
    26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL",
    34: "HOU",
}

POSITION_MAP = {
    0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE",
    7: "OP", 8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S",
    14: "DB", 15: "DP", 16: "D/ST", 17: "K", 18: "P", 19: "HC",
    20: "BE", 21: "IR", 23: "FLEX", 24: "EDR",
}

LINEUP_SLOT_MAP = {
    0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE",
    7: "OP", 8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S",
    14: "DB", 15: "DP", 16: "D/ST", 17: "K", 18: "P", 19: "HC",
    20: "BE", 21: "IR", 22: "UNKNOWN", 23: "FLEX",
}

BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{league_id}"


def looks_like_placeholder(value):
    """Recognised by shape, not by matching a copy of the placeholder text —
    a find-and-replace that edits the settings at the top must not be able to
    quietly move the goalposts as well."""
    if not value:
        return True
    v = value.strip()
    return v.startswith("PASTE_") or "XXXX" in v


def load_cookies(cli_s2, cli_swid):
    """A --flag wins, then the environment, then the block at the top."""
    s2 = cli_s2 or os.environ.get("ESPN_S2") or ESPN_S2
    swid = cli_swid or os.environ.get("ESPN_SWID") or SWID

    if looks_like_placeholder(s2) or looks_like_placeholder(swid):
        sys.exit(
            "This league is private and the ESPN cookies are still placeholders.\n\n"
            "Open this file and fill in SWID and ESPN_S2 near the top. Both come\n"
            "from a logged-in fantasy.espn.com session: DevTools (F12) ->\n"
            "Application/Storage -> Cookies -> https://fantasy.espn.com.\n"
            "Copy SWID with its curly braces, and espn_s2 whole.\n\n"
            "Keep your filled-in copy to yourself — it is a live login to your\n"
            "ESPN account, and this script lives in a public repository."
        )
    return s2, swid


def build_session(espn_s2, swid):
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; espn-boxscore-fetcher/1.0)",
        "Accept": "application/json",
    })
    # The SWID cookie must include the surrounding curly braces.
    if not swid.startswith("{"):
        swid = "{" + swid
    if not swid.endswith("}"):
        swid = swid + "}"
    session.cookies.set("espn_s2", espn_s2, domain="fantasy.espn.com")
    session.cookies.set("SWID", swid, domain="fantasy.espn.com")
    return session


def get_league(session, league_id, year):
    """Team names, and how many weeks the season could possibly hold — the walk
    below needs an upper bound so a broken season cannot loop forever."""
    url = BASE_URL.format(year=year, league_id=league_id)
    resp = session.get(url, params={"view": ["mTeam", "mSettings", "mStatus"]})
    resp.raise_for_status()
    data = resp.json()

    teams = {}
    for t in data.get("teams", []):
        name = t.get("name") or f"{t.get('location', '')} {t.get('nickname', '')}".strip()
        teams[t["id"]] = name or f"Team {t['id']}"

    status = data.get("status", {}) or {}
    last = status.get("finalScoringPeriod") or status.get("latestScoringPeriod") or 18
    return teams, min(int(last), 18)


def fetch_week(session, league_id, year, week):
    url = BASE_URL.format(year=year, league_id=league_id)
    resp = session.get(url, params={
        "view": ["mMatchup", "mMatchupScore", "mBoxscore"],
        "scoringPeriodId": week,
    })
    resp.raise_for_status()
    return resp.json()


def extract_player(entry, week):
    ppe = entry.get("playerPoolEntry", {}) or {}
    player = ppe.get("player", {}) or {}

    points = ppe.get("appliedStatTotal")
    if points is None:
        points = entry.get("appliedStatTotal")

    projected = None
    for stat_block in player.get("stats", []) or []:
        if (
            stat_block.get("scoringPeriodId") == week
            and stat_block.get("statSourceId") == 1  # 1 = projected
        ):
            projected = stat_block.get("appliedTotal")
            break
    if points is None:
        for stat_block in player.get("stats", []) or []:
            if (
                stat_block.get("scoringPeriodId") == week
                and stat_block.get("statSourceId") == 0  # 0 = actual
            ):
                points = stat_block.get("appliedTotal")
                break

    lineup_slot_id = entry.get("lineupSlotId")
    lineup_slot = LINEUP_SLOT_MAP.get(lineup_slot_id, str(lineup_slot_id))

    return {
        "player_id": player.get("id"),
        "name": player.get("fullName"),
        "position": POSITION_MAP.get(player.get("defaultPositionId"), None),
        "pro_team": PRO_TEAM_MAP.get(player.get("proTeamId"), None),
        "lineup_slot": lineup_slot,
        "points": points,
        "projected_points": projected,
        "is_starter": lineup_slot not in ("BE", "IR"),
        "injury_status": player.get("injuryStatus"),
    }


def extract_side(side, week, teams):
    team_id = side.get("teamId")
    roster = side.get("rosterForCurrentScoringPeriod") or side.get("rosterForMatchupPeriod") or {}
    entries = roster.get("entries", []) or []
    return {
        "team_id": team_id,
        "team_name": teams.get(team_id, f"Team {team_id}"),
        "score": side.get("totalPoints"),
        "players": [extract_player(e, week) for e in entries],
    }


def parse_week(data, week, teams):
    matchups = []
    for m in data.get("schedule", []) or []:
        if m.get("matchupPeriodId") != week:
            continue
        home = m.get("home")
        away = m.get("away")
        matchups.append({
            "matchup_id": m.get("id"),
            "playoff_tier_type": m.get("playoffTierType", "NONE"),
            "home": extract_side(home, week, teams) if home else None,
            "away": extract_side(away, week, teams) if away else None,
        })
    return {"year": data.get("seasonId"), "week": week, "matchups": matchups}


def check_finished(week_data):
    """A week still being played will happily export as zeroes, and a file of
    zeroes posted to the site is worse than no file at all. Report anything
    that does not look like a finished week and let the caller decide."""
    warnings = []
    for m in week_data["matchups"]:
        for where in ("home", "away"):
            side = m.get(where)
            if not side:
                continue                        # a playoff bye
            if side["score"] is None:
                warnings.append(f"{side['team_name']} has no score at all")
            elif side["score"] == 0:
                warnings.append(f"{side['team_name']} scored 0.00")
            if not side["players"]:
                warnings.append(f"{side['team_name']} has an empty roster")
    return warnings


def main():
    parser = argparse.ArgumentParser(
        description="Fetch every completed week of an ESPN fantasy season into one JSON file.",
        epilog="With no flags it uses the settings at the top of this file.",
    )
    parser.add_argument("--year", type=int, default=YEAR, help=f"Season year (default: {YEAR})")
    parser.add_argument("--league-id", default=os.environ.get("ESPN_LEAGUE_ID", LEAGUE_ID),
                        help=f"ESPN league ID (default: {LEAGUE_ID})")
    parser.add_argument("--espn-s2", default=None, help="espn_s2 cookie, overriding the one set above")
    parser.add_argument("--swid", default=None, help="SWID cookie, overriding the one set above")
    parser.add_argument("--out", default=None, help="Output file (default: ./season_<year>.json)")
    args = parser.parse_args()

    espn_s2, swid = load_cookies(args.espn_s2, args.swid)
    session = build_session(espn_s2, swid)

    out_path = args.out or f"season_{args.year}.json"

    print(f"League {args.league_id}, {args.year}")

    try:
        teams, last_possible = get_league(session, args.league_id, args.year)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status in (401, 403):
            sys.exit(
                f"ESPN rejected the login ({status}).\n"
                "Your cookies have most likely expired — paste fresh SWID and\n"
                "ESPN_S2 values into the block at the top of this file."
            )
        sys.exit(f"Failed to fetch league info ({e}).")

    print(f"  {len(teams)} teams: {', '.join(teams.values())}\n")

    # Walk forward and stop at the first week that is not finished. Stopping
    # rather than skipping is deliberate: weeks arrive in order, so the first
    # unfinished one is the live week and everything past it is the future.
    weeks = []
    for week in range(1, last_possible + 1):
        try:
            raw = fetch_week(session, args.league_id, args.year, week)
        except requests.HTTPError as e:
            sys.exit(f"Failed to fetch week {week} ({e}).")

        week_data = parse_week(raw, week, teams)

        if not week_data["matchups"]:
            print(f"  week {week}: not played yet — stopping here")
            break

        warnings = check_finished(week_data)
        if warnings:
            print(f"  week {week}: still in progress ({sorted(set(warnings))[0]}) — stopping here")
            break

        weeks.append(week_data)
        print(f"  week {week}: {len(week_data['matchups'])} matchups")

    if not weeks:
        sys.exit(
            "\nNo completed week yet, so nothing was written. The file already in\n"
            "Drive is still the right one — leave it there."
        )

    # Written compact rather than pretty: a whole season of lineups is a big
    # file, it travels through Google Drive as base64, and nobody reads it by
    # hand — the tools that do read it do not care about whitespace.
    with open(out_path, "w") as f:
        json.dump({"year": args.year, "weeks": weeks}, f, separators=(",", ":"))

    size = os.path.getsize(out_path)
    print(f"\n  weeks 1-{weeks[-1]['week']} -> {out_path}  ({size // 1024} KB)")
    for m in weeks[-1]["matchups"]:
        home, away = m.get("home"), m.get("away")
        if home and away:
            print(f"    week {weeks[-1]['week']}: {home['team_name']} {home['score']} — {away['team_name']} {away['score']}")

    print(f"\nNext: upload {out_path} to the Drive weekly_box folder, replacing the copy")
    print("      already there. The Tuesday task rebuilds the site from it.")


if __name__ == "__main__":
    main()
