#!/usr/bin/env python3
"""Simulate one night of listening for the ML showcase users.

Each showcase persona gets a scripted burst of new play/complete/replay/skip
interactions, POSTed through the real API (``POST /songs/{id}/interactions``),
so the per-interaction preference refresh runs exactly as in production. Re-run
the Daily Mix worker for the *next* date afterwards:

    docker compose run --rm --no-deps daily-mix-worker \\
        /app/daily_mix_worker --date 2026-09-03 --once

and compare each user's ``preference_vector`` and Daily Mix against the day
before - that is the "vectors change every night" demonstration.

Song ids are read straight from Postgres (this is a local showcase tool, like
the seed script); only the interactions themselves go through the API.
"""
from __future__ import annotations

import argparse
import json
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_PASSWORD = "Password123!"

# night -> list of (persona_email, artist_ilike, interaction, count)
#   interaction in {play, complete, replay, skip}
NIGHTS: dict[int, list[tuple[str, str, str, int]]] = {
    1: [
        # cross-cluster drift
        ("showcase06@bside.local", "Chopin", "complete", 4),   # indie rock -> piano
        ("showcase08@bside.local", "Daft Punk", "replay", 4),   # classical  -> electronic
        ("showcase11@bside.local", "ACDC", "replay", 4),        # pop        -> hard rock
        # lane reinforcement
        ("showcase01@bside.local", "David Guetta", "replay", 2),
        ("showcase04@bside.local", "Red Hot Chilli Peppers", "complete", 2),
        ("showcase14@bside.local", "Hans Zimmer", "complete", 3),
        ("showcase09@bside.local", "Ludovico Einaudi", "replay", 2),
    ],
    2: [
        ("showcase06@bside.local", "Ludovico Einaudi", "replay", 4),   # deepen the drift
        ("showcase08@bside.local", "David Guetta", "complete", 3),
        ("showcase11@bside.local", "Red Hot Chilli Peppers", "replay", 3),
        ("showcase03@bside.local", "Daft Punk", "replay", 3),
        ("showcase07@bside.local", "Artic Monkeys", "skip", 2),        # psych pop cools on indie
        ("showcase12@bside.local", "ACDC", "complete", 3),
        ("showcase13@bside.local", "Charlotte de Witte", "replay", 1),
    ],
}


def psql(container: str, db_user: str, db_name: str, sql: str) -> list[str]:
    out = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-U", db_user, "-d", db_name, "-tAc", sql],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line for line in out.splitlines() if line.strip()]


def songs_for_artist(container, db_user, db_name, artist_ilike: str, limit: int) -> list[tuple[str, int]]:
    rows = psql(
        container, db_user, db_name,
        "SELECT s.id || '|' || s.duration_seconds "
        "FROM songs s JOIN albums a ON a.id=s.album_id JOIN artists ar ON ar.id=a.artist_id "
        f"WHERE ar.name ILIKE '%{artist_ilike}%' AND s.status='Ready' "
        f"ORDER BY a.title, s.title LIMIT {limit}",
    )
    result = []
    for row in rows:
        sid, dur = row.split("|")
        result.append((sid, int(dur)))
    return result


def request_json(method, url, token=None, payload=None, ctx=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="https://localhost/api")
    ap.add_argument("--insecure", action="store_true")
    ap.add_argument("--night", type=int, default=1, choices=sorted(NIGHTS))
    ap.add_argument("--container", default="bside_db_dev")
    ap.add_argument("--db-user", default="bside_admin")
    ap.add_argument("--db-name", default="bside_db")
    args = ap.parse_args()

    ctx = None
    if args.insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    api = args.api.rstrip("/")
    plan = NIGHTS[args.night]
    tokens: dict[str, str] = {}
    sent = failed = 0

    for email, artist, interaction, count in plan:
        if email not in tokens:
            status, data = request_json(
                "POST", f"{api}/login",
                payload={"identifier": email, "password": DEFAULT_PASSWORD}, ctx=ctx,
            )
            if status != 200 or not isinstance(data, dict) or not data.get("token"):
                print(f"login failed for {email}: {status} {data}", file=sys.stderr)
                return 1
            tokens[email] = data["token"]

        picks = songs_for_artist(args.container, args.db_user, args.db_name, artist, count)
        if not picks:
            print(f"  {email}: no Ready songs for artist ~ {artist!r}", file=sys.stderr)
            continue

        for song_id, duration in picks:
            payload = {"interaction_type": interaction}
            if interaction in ("complete", "skip"):
                payload["listened_seconds"] = duration if interaction == "complete" else max(5, duration // 5)
            elif interaction == "replay":
                payload["listened_seconds"] = duration
            status, data = request_json(
                "POST", f"{api}/songs/{song_id}/interactions",
                token=tokens[email], payload=payload, ctx=ctx,
            )
            if status in (200, 201):
                sent += 1
            else:
                failed += 1
                print(f"  {email} {interaction} {song_id}: {status} {data}", file=sys.stderr)
        print(f"  {email}: {interaction} x{len(picks)} of {artist}")

    print(f"\nNight {args.night}: {sent} interaction(s) recorded, {failed} failed.")
    print("Now run the Daily Mix worker for the next date and diff the vectors.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
