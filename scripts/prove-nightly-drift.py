#!/usr/bin/env python3
"""Demonstrate that showcase preference vectors + Daily Mixes move every night.

Sequence:
  1. build Daily Mixes for --day-one (runs the worker, which now also refreshes
     every user's preference vector first)
  2. snapshot each showcase user's preference_vector + mix
  3. run scripts/simulate-night.py for --night (a burst of new listening)
  4. build Daily Mixes for --day-two
  5. snapshot again and print the per-user delta

Everything talks to the running docker-compose stack. Read-only against the app;
the only writes are the simulated interactions and the worker's own output.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys

SHOWCASE_FILTER = "u.email LIKE 'showcase%@bside.local'"


def sh(*args: str, check: bool = True) -> str:
    return subprocess.run(list(args), capture_output=True, text=True, check=check).stdout


def psql(container, db_user, db_name, sql: str) -> str:
    return sh("docker", "exec", "-i", container, "psql", "-U", db_user, "-d", db_name, "-tAF|", "-c", sql)


def run_worker(day: str) -> str:
    print(f"--- running Daily Mix worker for {day} ---")
    out = sh(
        "docker", "compose", "run", "--rm", "--no-deps", "daily-mix-worker",
        "/app/daily_mix_worker", "--date", day, "--once", check=False,
    )
    for line in out.splitlines():
        if line.startswith("Daily Mix worker") or "Preference refresh failed" in line:
            print("   ", line)
    return out


def snapshot(container, db_user, db_name, day: str) -> dict[str, dict]:
    pref_rows = psql(
        container, db_user, db_name,
        f"SELECT u.email, up.preference_vector::text "
        f"FROM user_preferences up JOIN users u ON u.id = up.user_id WHERE {SHOWCASE_FILTER}",
    )
    mix_rows = psql(
        container, db_user, db_name,
        "SELECT u.email, dms.position, s.title, ar.name, dms.is_discovery, dms.selection_reason "
        "FROM daily_mixes dm JOIN users u ON u.id = dm.user_id "
        "JOIN daily_mix_songs dms ON dms.daily_mix_id = dm.id "
        "JOIN songs s ON s.id = dms.song_id "
        "JOIN albums al ON al.id = s.album_id JOIN artists ar ON ar.id = al.artist_id "
        f"WHERE {SHOWCASE_FILTER} AND dm.generation_date = '{day}' ORDER BY u.email, dms.position",
    )
    snap: dict[str, dict] = {}
    for row in pref_rows.splitlines():
        if not row.strip():
            continue
        email, vec = row.split("|", 1)
        vec = [float(x) for x in vec.strip("{}").split(",")] if vec.strip("{}") else []
        snap[email] = {"pref": vec, "mix": []}
    for row in mix_rows.splitlines():
        if not row.strip():
            continue
        email, pos, title, artist, disc, reason = row.split("|")
        snap.setdefault(email, {"pref": [], "mix": []})
        snap[email]["mix"].append(
            {"pos": int(pos), "title": title, "artist": artist,
             "discovery": disc == "t", "reason": reason}
        )
    return snap


def l2(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return float("nan")
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return float("nan")
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else float("nan")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--day-one", default="2026-09-02")
    ap.add_argument("--day-two", default="2026-09-03")
    ap.add_argument("--night", type=int, default=1)
    ap.add_argument("--api", default="https://localhost/api")
    ap.add_argument("--insecure", action="store_true")
    ap.add_argument("--container", default="bside_db_dev")
    ap.add_argument("--db-user", default="bside_admin")
    ap.add_argument("--db-name", default="bside_db")
    ap.add_argument("--skip-night", action="store_true", help="Only re-snapshot/diff, do not simulate.")
    args = ap.parse_args()

    run_worker(args.day_one)
    before = snapshot(args.container, args.db_user, args.db_name, args.day_one)

    if not args.skip_night:
        print(f"\n--- simulating night {args.night} ---")
        cmd = [sys.executable, "scripts/simulate-night.py", "--night", str(args.night), "--api", args.api]
        if args.insecure:
            cmd.append("--insecure")
        print(sh(*cmd, check=False))

    run_worker(args.day_two)
    after = snapshot(args.container, args.db_user, args.db_name, args.day_two)

    print("\n" + "=" * 92)
    print(f"{'persona':<26}{'|Δpref| (L2)':>14}{'cos(before,after)':>20}{'mix songs changed':>20}")
    print("-" * 92)
    moved = []
    for email in sorted(before):
        b, a = before[email], after.get(email, {"pref": [], "mix": []})
        d = l2(b["pref"], a["pref"])
        c = cosine(b["pref"], a["pref"])
        b_titles = [m["title"] for m in b["mix"]]
        a_titles = [m["title"] for m in a["mix"]]
        changed = len(set(b_titles) ^ set(a_titles)) // 2 if b_titles and a_titles else 0
        name = email.split("@")[0]
        dstr = "cold-start" if math.isnan(d) else f"{d:.4f}"
        cstr = "-" if math.isnan(c) else f"{c:.4f}"
        print(f"{name:<26}{dstr:>14}{cstr:>20}{changed:>20}")
        if not math.isnan(d) and d > 0:
            moved.append((d, name, b, a))

    moved.sort(reverse=True)
    print("\n--- biggest movers: mix before -> after (top 6 tracks) ---")
    for d, name, b, a in moved[:4]:
        print(f"\n{name}   |Δpref|={d:.4f}")
        print("  before:", ", ".join(f"{m['title']}" for m in b["mix"][:6]))
        print("  after :", ", ".join(f"{m['title']}" for m in a["mix"][:6]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
