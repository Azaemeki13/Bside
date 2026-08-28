#!/usr/bin/env python3
"""End-to-end smoke check for B-Side ML showcase users.

Logs in as showcase01..showcase15 and requests /users/me/daily-mix. This both
verifies the seeded accounts and materializes today's Daily Mix for each user.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any

DEFAULT_PASSWORD = "Password123!"


def request_json(
    method: str,
    url: str,
    *,
    token: str | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url}: HTTP {exc.code}: {text}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {url}: {exc.reason}") from exc


def login(api: str, email: str, password: str) -> str:
    response = request_json(
        "POST",
        f"{api}/login",
        payload={"identifier": email, "password": password},
    )
    if not isinstance(response, dict) or not response.get("token"):
        raise RuntimeError(f"Login response for {email} contains no token: {response}")
    return str(response["token"])


def summarize_mix(mix: dict[str, Any]) -> str:
    songs = mix.get("songs") if isinstance(mix, dict) else None
    songs = songs if isinstance(songs, list) else []
    top = []
    for item in songs[:5]:
        if not isinstance(item, dict):
            continue
        title = item.get("title", "?")
        reason = item.get("selection_reason", "?")
        top.append(f"{title} [{reason}]")
    discovery = mix.get("discovery_count", "?") if isinstance(mix, dict) else "?"
    familiar = mix.get("familiar_count", "?") if isinstance(mix, dict) else "?"
    return f"{len(songs)} songs | discovery={discovery}, familiar={familiar} | " + "; ".join(top)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check ML showcase Daily Mix results.")
    parser.add_argument("--api", default="https://localhost/api", help="Backend API URL.")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Showcase account password.")
    parser.add_argument("--from-user", type=int, default=1, choices=range(1, 16), metavar="1-15")
    parser.add_argument("--to-user", type=int, default=15, choices=range(1, 16), metavar="1-15")
    parser.add_argument("--insecure", action="store_true", help="Accept the local development TLS certificate.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.from_user > args.to_user:
        raise SystemExit("--from-user must be <= --to-user")
    if args.insecure:
        context = ssl._create_unverified_context()
        urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=context)))

    api = args.api.rstrip("/")
    failures = 0
    for number in range(args.from_user, args.to_user + 1):
        email = f"showcase{number:02d}@bside.local"
        try:
            token = login(api, email, args.password)
            mix = request_json("GET", f"{api}/users/me/daily-mix", token=token)
            print(f"[{number:02d}] {email}: {summarize_mix(mix)}")
        except Exception as exc:  # noqa: BLE001 - smoke checker should continue to the next account.
            failures += 1
            print(f"[{number:02d}] {email}: ERROR - {exc}", file=sys.stderr)

    if failures:
        print(f"\n{failures} showcase account(s) failed.", file=sys.stderr)
        return 1
    print("\nAll selected showcase accounts returned a Daily Mix.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
