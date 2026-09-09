#!/usr/bin/env python3
"""
fetch-week.py — pull ONE week of box scores out of ESPN and save it as the
weekly export the rest of this repo reads.

    python3 tools/boxscores/fetch-week.py            # the week set below
    python3 tools/boxscores/fetch-week.py --week 3   # override for one run

It writes espn_boxscores_<year>/week_NN.json, which is exactly what
tools/boxscores/week.mjs and tools/boxscores/import.mjs take as --in, and
exactly what belongs in the Drive weekly_box folder.

  ┌───────────────────────────────────────────────────────────────────┐
  │ EDIT THESE THREE LINES. That is the whole weekly ritual.          │
  └───────────────────────────────────────────────────────────────────┘
"""

WEEK = 1
YEAR = 2026
LEAGUE_ID = "42024189"

# ---------------------------------------------------------------------------
# YOUR ESPN LOGIN
#
# The league is private, so ESPN needs two cookies from a logged-in browser
# session. THIS REPOSITORY IS PUBLIC, so they are deliberately not written
# here — anything committed to this file is on the internet, and an espn_s2
# cookie is a live login to your ESPN account.
#
# Put them in tools/boxscores/espn-cookies.json instead, which .gitignore
# keeps out of git:
#
#     {
#       "swid": "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}",
#       "espn_s2": "AEB...long-string..."
#     }
#
# To find them: log in to fantasy.espn.com, open DevTools (F12) ->
# Application/Storage -> Cookies -> https://fantasy.espn.com, and copy
# "SWID" (with its curly braces) and "espn_s2".
#
# They last a few months. When the script starts returning 401, refresh that
# file — nothing else changes. The environment variables ESPN_S2 and
# ESPN_SWID work too, and --espn-s2 / --swid override everything.
# ---------------------------------------------------------------------------

import argparse
import json
import os
import sys

import requests

COOKIE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "espn-cookies.json")

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


def load_cookies(cli_s2, cli_swid):
    """--flag, then the environment, then the untracked cookie file."""
    s2 = cli_s2 or os.environ.get("ESPN_S2")
    swid = cli_swid or os.environ.get("ESPN_SWID")
    if s2 and swid:
        return s2, swid

    if os.path.exists(COOKIE_FILE):
        try:
            with open(COOKIE_FILE) as f:
                saved = json.load(f)
        except json.JSONDecodeError as e:
            sys.exit(f"{COOKIE_FILE} is not valid JSON ({e}).")
        s2 = s2 or saved.get("espn_s2")
        swid = swid or saved.get("swid") or saved.get("SWID")

    if not (s2 and swid):
        sys.exit(
            "No ESPN cookies found, and this league is private.\n\n"
            f"Create {COOKIE_FILE} with:\n\n"
            '    {\n'
            '      "swid": "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}",\n'
            '      "espn_s2": "AEB...long-string..."\n'
            '    }\n\n'
            "Both come from a logged-in fantasy.espn.com session: DevTools (F12)\n"
            "-> Application/Storage -> Cookies -> https://fantasy.espn.com.\n"
            "That file is gitignored — do not paste the cookies into a tracked file,\n"
            "this repository is public."
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


def get_teams(session, league_id, year):
    url = BASE_URL.format(year=year, league_id=league_id)
    resp = session.get(url, params={"view": ["mTeam", "mSettings", "mStatus"]})
    resp.raise_for_status()
    data = resp.json()

    teams = {}
    for t in data.get("teams", []):
        name = t.get("name") or f"{t.get('location', '')} {t.get('nickname', '')}".strip()
        teams[t["id"]] = name or f"Team {t['id']}"
    return teams


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
        description="Fetch one week of ESPN fantasy box scores as JSON.",
        epilog="With no flags it uses the WEEK / YEAR / LEAGUE_ID set at the top of this file.",
    )
    parser.add_argument("--week", type=int, default=WEEK, help=f"Week to fetch (default: {WEEK})")
    parser.add_argument("--year", type=int, default=YEAR, help=f"Season year (default: {YEAR})")
    parser.add_argument("--league-id", default=os.environ.get("ESPN_LEAGUE_ID", LEAGUE_ID),
                        help=f"ESPN league ID (default: {LEAGUE_ID})")
    parser.add_argument("--espn-s2", default=None, help="espn_s2 cookie, overriding the cookie file")
    parser.add_argument("--swid", default=None, help="SWID cookie, overriding the cookie file")
    parser.add_argument("--out-dir", default=None, help="Output directory (default: ./espn_boxscores_<year>)")
    parser.add_argument("--force", action="store_true",
                        help="Write the file even if the week looks unfinished")
    args = parser.parse_args()

    espn_s2, swid = load_cookies(args.espn_s2, args.swid)
    session = build_session(espn_s2, swid)

    out_dir = args.out_dir or f"espn_boxscores_{args.year}"
    os.makedirs(out_dir, exist_ok=True)

    print(f"League {args.league_id}, {args.year}, week {args.week}")

    try:
        teams = get_teams(session, args.league_id, args.year)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status in (401, 403):
            sys.exit(
                f"ESPN rejected the login ({status}).\n"
                f"Your cookies have most likely expired — refresh {COOKIE_FILE}."
            )
        sys.exit(f"Failed to fetch league info ({e}).")

    print(f"  {len(teams)} teams: {', '.join(teams.values())}")

    try:
        raw = fetch_week(session, args.league_id, args.year, args.week)
    except requests.HTTPError as e:
        sys.exit(f"Failed to fetch week {args.week} ({e}).")

    week_data = parse_week(raw, args.week, teams)

    if not week_data["matchups"]:
        sys.exit(
            f"\nNo matchups for week {args.week} — that week has not been played yet,\n"
            f"or the week number is wrong. Nothing was written."
        )

    warnings = check_finished(week_data)
    if warnings and not args.force:
        print(f"\nWeek {args.week} does not look finished:")
        for w in sorted(set(warnings)):
            print(f"  - {w}")
        sys.exit(
            "\nNothing was written. Wait for the week to finish and run this again,\n"
            "or pass --force if you are sure this is right."
        )
    if warnings:
        print(f"\n  writing anyway (--force), despite: {'; '.join(sorted(set(warnings)))}")

    path = os.path.join(out_dir, f"week_{args.week:02d}.json")
    with open(path, "w") as f:
        json.dump(week_data, f, indent=2)

    print(f"\n  {len(week_data['matchups'])} matchups -> {path}")
    for m in week_data["matchups"]:
        home, away = m.get("home"), m.get("away")
        if home and away:
            print(f"    {home['team_name']} {home['score']} — {away['team_name']} {away['score']}")

    print(f"\nNext: upload {path} to the Drive weekly_box folder, then")
    print(f"  node tools/boxscores/week.mjs --season {args.year} --in {out_dir} --write")
    print(f"  node tools/boxscores/import.mjs --season {args.year} --in {out_dir}")


if __name__ == "__main__":
    main()
