#!/usr/bin/env python3
"""Build the vendored seed dataset for the World Cup What-If Machine.

Sources (fetched live, validated, then frozen into src/data/):
  - openfootball/worldcup.json 2026  — fixtures (104 matches) + teams/FIFA codes
    (public domain football data)
  - zvizdo/fifa-wc-2026-simulation   — FIFA ranking snapshot per team
  - FIFA Competition Regulations Annex C (via the same repo / Wikipedia
    template) — the 495-row third-place R32 allocation table

Outputs:
  src/data/seed.json      — teams + all 104 fixtures with knockout slot refs
  src/data/r32table.json  — 495-row allocation lookup (validated here)

Data pipeline (run rarely; outputs are committed):

  openfootball 2026 ──┐
  zvizdo fifa_rank ───┼─▶ normalize names ─▶ validate ─▶ seed.json
  Annex C 495 table ──┘                      (bijection, pools,   r32table.json
                                              no same-group rematch)
"""
import itertools
import json
import re
import urllib.request
from pathlib import Path

OF = "https://raw.githubusercontent.com/openfootball/worldcup.json/HEAD/2026"
ZV = "https://raw.githubusercontent.com/zvizdo/fifa-wc-2026-simulation/HEAD"
OUT = Path(__file__).resolve().parent.parent / "src" / "data"

# zvizdo team name -> openfootball team name (sources agree on all but one)
NAME_FIX = {
    "Bosnia and Herzegovina": "Bosnia & Herzegovina",
}

# The 8 R32 matches hosting a third-placed team -> winner group + allowed pool
# (pools are the union over all 495 official rows; used for validation only)
THIRD_SLOTS = {
    "74": ("E", set("ABCDF")),
    "77": ("I", set("CDFGH")),
    "79": ("A", set("CEFHI")),
    "80": ("L", set("EHIJK")),
    "81": ("D", set("BEFIJ")),
    "82": ("G", set("AEHIJ")),
    "85": ("B", set("EFGIJ")),
    "87": ("K", set("DEIJL")),
}
THIRD_PLACE_MATCH_ORDER = ["74", "77", "79", "80", "81", "82", "85", "87"]

ROUND_STAGE = {
    "Round of 32": "R32",
    "Round of 16": "R16",
    "Quarter-final": "QF",
    "Semi-final": "SF",
    "Match for third place": "THIRD",
    "Final": "FINAL",
}


def fetch(url: str) -> str:
    with urllib.request.urlopen(url) as r:
        return r.read().decode("utf-8")


def build_r32_table() -> dict:
    src = fetch(f"{ZV}/engine/third_place_table.py")
    rows = dict(re.findall(r'"([A-L]{8})":\s*"([A-L]{8})"', src))
    expected = {"".join(c) for c in itertools.combinations("ABCDEFGHIJKL", 8)}
    assert set(rows) == expected and len(rows) == 495, "table incomplete"
    table = {}
    for key, val in rows.items():
        assert sorted(val) == sorted(key), f"{key}: not a bijection"
        entry = {}
        for match, group in zip(THIRD_PLACE_MATCH_ORDER, val):
            winner, pool = THIRD_SLOTS[match]
            assert group in pool, f"{key}: 3{group} outside pool of match {match}"
            assert group != winner, f"{key}: same-group rematch in match {match}"
            entry[match] = group
        table[key] = entry
    return dict(sorted(table.items()))


def build_seed() -> dict:
    of_teams = json.loads(fetch(f"{OF}/worldcup.teams.json"))
    of_matches = json.loads(fetch(f"{OF}/worldcup.json"))["matches"]
    zv = json.loads(fetch(f"{ZV}/data/wc_2026_teams.json"))["groups"]

    rank_by_name = {
        NAME_FIX.get(t["name"], t["name"]): t["fifa_rank"]
        for group in zv.values()
        for t in group
    }

    teams, code_by_name = [], {}
    for t in of_teams:
        code_by_name[t["name"]] = t["fifa_code"]
        rank = rank_by_name.get(t["name"])
        assert rank is not None, f"no FIFA rank for {t['name']}"
        teams.append({
            "id": t["fifa_code"],
            "name": t["name"],
            "group": t["group"],
            "fifaRank": rank,
            "flag": t["flag_icon"],
        })
    assert len(teams) == 48, f"expected 48 teams, got {len(teams)}"

    def slot(ref: str) -> dict:
        """Knockout slot ref -> typed slot. '1E' winner, '2A' runner-up,
        '3A/B/C/D/F' third-place pool, 'W73' match winner, 'L101' match loser."""
        if ref in code_by_name:
            return {"type": "team", "team": code_by_name[ref]}
        if m := re.fullmatch(r"([12])([A-L])", ref):
            return {"type": "groupWinner" if m[1] == "1" else "groupRunnerUp", "group": m[2]}
        if m := re.fullmatch(r"3((?:[A-L]/)+[A-L])", ref):
            return {"type": "thirdPlace", "pool": m[1].split("/")}
        if m := re.fullmatch(r"([WL])(\d+)", ref):
            return {"type": "matchWinner" if m[1] == "W" else "matchLoser", "match": int(m[2])}
        raise ValueError(f"unrecognized slot ref: {ref}")

    group_matches = [m for m in of_matches if "group" in m]
    knockout_matches = [m for m in of_matches if "group" not in m]
    assert len(group_matches) == 72 and len(knockout_matches) == 32

    fixtures = []
    # Group fixtures: ids 1-72 in schedule order (engine never keys on these;
    # the bracket and r32 table key only on knockout nums 73-104)
    for i, m in enumerate(sorted(group_matches, key=lambda m: (m["date"], m["time"])), start=1):
        fixtures.append({
            "id": i,
            "stage": "GROUP",
            "group": m["group"].removeprefix("Group "),
            "date": m["date"],
            "time": m["time"],
            "venue": m["ground"],
            "home": {"type": "team", "team": code_by_name[m["team1"]]},
            "away": {"type": "team", "team": code_by_name[m["team2"]]},
        })
    for m in knockout_matches:
        num = m.get("num") or {"Match for third place": 103, "Final": 104}[m["round"]]
        fixtures.append({
            "id": num,
            "stage": ROUND_STAGE[m["round"]],
            "date": m["date"],
            "time": m["time"],
            "venue": m["ground"],
            "home": slot(m["team1"]),
            "away": slot(m["team2"]),
        })
    fixtures.sort(key=lambda f: f["id"])
    assert [f["id"] for f in fixtures] == list(range(1, 105))

    return {
        "version": 1,
        "tournament": "FIFA World Cup 2026",
        "source": "openfootball/worldcup.json + FIFA Annex C (via Wikipedia template)",
        "teams": teams,
        "fixtures": fixtures,
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    r32 = build_r32_table()
    seed = build_seed()
    (OUT / "r32table.json").write_text(json.dumps(r32, separators=(",", ":")) + "\n")
    (OUT / "seed.json").write_text(json.dumps(seed, indent=1, ensure_ascii=False) + "\n")
    print(f"r32table.json: {len(r32)} rows")
    print(f"seed.json: {len(seed['teams'])} teams, {len(seed['fixtures'])} fixtures")
