#!/usr/bin/env python3
"""Upload a local folder of test albums/songs to B-Side.

Expected folder layout:

songs/
  Album Name/
    cover.png              # optional: png, jpg, jpeg, webp
    tag.txt                # optional: album genre/tag, defaults to "Test"
    01 - First Track.wav
    02 - Second Track.flac

Each direct child folder of --root is treated as one album. Audio files inside
that folder are uploaded as songs in sorted filename order.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

AUDIO_EXTENSIONS = {".wav", ".flac"}
COVER_NAMES = (
    "cover.png",
    "cover.jpg",
    "cover.jpeg",
    "cover.webp",
    "album.png",
    "album.jpg",
    "album.jpeg",
    "album.webp",
    "albumart.jpg",
    "albumart.jpeg",
    "albumart.png",
    "albumart.webp",
)
TAG_NAMES = ("tag.txt", "genre.txt")
DEFAULT_DURATION_SECONDS = 180
DEFAULT_TAG = "Test"


@dataclass(frozen=True)
class AlbumFolder:
    path: Path
    title: str
    tag: str
    cover: Path | None
    songs: list[Path]


def natural_key(path: Path) -> list[int | str]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def read_text_file(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


def find_tag(album_dir: Path) -> str:
    for name in TAG_NAMES:
        value = read_text_file(album_dir / name)
        if value:
            return value
    return DEFAULT_TAG


def find_cover(album_dir: Path) -> Path | None:
    for name in COVER_NAMES:
        candidate = album_dir / name
        if candidate.is_file():
            return candidate
    return None


def discover_albums(root: Path) -> list[AlbumFolder]:
    if not root.exists():
        raise SystemExit(f"Root folder does not exist: {root}")
    if not root.is_dir():
        raise SystemExit(f"Root path is not a directory: {root}")

    albums: list[AlbumFolder] = []
    for album_dir in sorted((item for item in root.iterdir() if item.is_dir()), key=natural_key):
        songs = sorted(
            (item for item in album_dir.iterdir() if item.is_file() and item.suffix.lower() in AUDIO_EXTENSIONS),
            key=natural_key,
        )
        if not songs:
            print(f"Skipping {album_dir.name}: no .wav or .flac files found")
            continue
        albums.append(
            AlbumFolder(
                path=album_dir,
                title=album_dir.name,
                tag=find_tag(album_dir),
                cover=find_cover(album_dir),
                songs=songs,
            )
        )
    return albums


def token_from_args(args: argparse.Namespace) -> str:
    if args.token:
        return args.token.strip()
    if args.token_file:
        value = read_text_file(Path(args.token_file).expanduser())
        if value:
            return value
    env_token = os.environ.get("BSIDE_TOKEN", "").strip()
    if env_token:
        return env_token
    raise SystemExit(
        "Missing auth token. Pass --token, --token-file, or set BSIDE_TOKEN. "
        "You can copy it from the browser console with localStorage.getItem('auth_token')."
    )


def request_json(
    method: str,
    url: str,
    *,
    token: str | None = None,
    body: bytes | None = None,
    content_type: str | None = None,
) -> Any:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            payload = response.read()
            if not payload:
                return None
            return json.loads(payload.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with HTTP {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {url} failed: {exc.reason}") from exc


def put_file(url: str, path: Path, content_type: str) -> None:
    req = urllib.request.Request(
        url,
        data=path.read_bytes(),
        headers={"Content-Type": content_type},
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"PUT {path} failed with HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"PUT {path} failed with HTTP {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"PUT {path} failed: {exc.reason}") from exc


def multipart_body(fields: dict[str, str], files: dict[str, Path]) -> tuple[bytes, str]:
    boundary = f"bside-boundary-{time.time_ns()}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )

    for name, path in files.items():
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode(),
                f"Content-Type: {content_type}\r\n\r\n".encode(),
                path.read_bytes(),
                b"\r\n",
            ]
        )

    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"

def create_artist(api_url: str, token: str, name: str) -> str:
    body, content_type = multipart_body({"name": name, "bio": ""}, {})
    try:
        response = request_json("POST", f"{api_url}/artists", token=token, body=body, content_type=content_type)
        artist_id = response.get("id") if isinstance(response, dict) else None
        if not artist_id:
            raise RuntimeError(f"Artist creation returned no id: {response}")
        return str(artist_id)
    except RuntimeError as e:
        if "409" not in str(e):
            raise
        print(f"  Artist '{name}' already exists, looking up id...")
        artists = request_json("GET", f"{api_url}/artists", token=token)
        if not isinstance(artists, list):
            raise RuntimeError(f"Failed to fetch artists: {artists}")
        match = next((a for a in artists if a.get("name") == name), None)
        if not match:
            raise RuntimeError(f"Artist '{name}' not found after 409 conflict")
        return str(match["id"])

def create_album(api_url: str, token: str, album: AlbumFolder, artist_id: str) -> str:
    body, content_type = multipart_body(
        {"title": album.title, "genre": album.tag},
        {"cover": album.cover} if album.cover else {},
    )
    response = request_json("POST", f"{api_url}/admin/artists/{artist_id}/albums", token=token, body=body, content_type=content_type)
    album_id = response.get("id") if isinstance(response, dict) else None
    if not album_id:
        raise RuntimeError(f"Album creation returned no id: {response}")
    return str(album_id)

def create_song(api_url: str, token: str, album_id: str, song_path: Path, duration: int) -> tuple[str, str]:
    fmt = song_path.suffix.lower().lstrip(".")
    payload = {
        "title": song_title(song_path),
        "album_id": album_id,
        "duration_seconds": duration,
        "format": fmt,
        "ml_features": None,
    }
    response = request_json(
        "POST",
        f"{api_url}/songs",
        token=token,
        body=json.dumps(payload).encode("utf-8"),
        content_type="application/json",
    )
    if not isinstance(response, dict):
        raise RuntimeError(f"Song creation returned invalid response: {response}")
    song = response.get("song")
    upload_url = response.get("upload_url")
    song_id = song.get("id") if isinstance(song, dict) else None
    if not song_id or not upload_url:
        raise RuntimeError(f"Song creation returned missing fields: {response}")
    return str(song_id), str(upload_url)


def verify_song(api_url: str, token: str, song_id: str) -> None:
    request_json("PUT", f"{api_url}/songs/{song_id}/verify", token=token, body=b"{}", content_type="application/json")


def audio_content_type(path: Path) -> str:
    if path.suffix.lower() == ".flac":
        return "audio/flac"
    return "audio/wav"


def song_title(path: Path) -> str:
    title = path.stem.strip()
    title = re.sub(r"^\d+\s*[-_. ]\s*", "", title).strip()
    return title or path.stem


def read_duration_seconds(path: Path) -> int:
    if path.suffix.lower() == ".wav":
        duration = read_wav_duration(path)
    elif path.suffix.lower() == ".flac":
        duration = read_flac_duration(path)
    else:
        duration = None
    return max(1, round(duration)) if duration else DEFAULT_DURATION_SECONDS


def read_wav_duration(path: Path) -> float | None:
    try:
        with wave.open(str(path), "rb") as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            if rate <= 0:
                return None
            return frames / float(rate)
    except (wave.Error, OSError):
        return None


def read_flac_duration(path: Path) -> float | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if not data.startswith(b"fLaC") or len(data) < 42:
        return None

    offset = 4
    while offset + 4 <= len(data):
        header = data[offset]
        block_type = header & 0x7F
        block_length = int.from_bytes(data[offset + 1 : offset + 4], "big")
        block_start = offset + 4
        block_end = block_start + block_length
        if block_end > len(data):
            return None
        if block_type == 0 and block_length >= 34:
            stream_info = data[block_start:block_end]
            packed = int.from_bytes(stream_info[10:18], "big")
            sample_rate = (packed >> 44) & 0xFFFFF
            total_samples = packed & 0xFFFFFFFFF
            if sample_rate > 0 and total_samples > 0:
                return total_samples / float(sample_rate)
            return None
        offset = block_end
        if header & 0x80:
            break
    return None


def upload_library(args: argparse.Namespace) -> None:
    root = Path(args.root).expanduser().resolve()
    token = token_from_args(args)
    api_url = args.api.rstrip("/")
    albums = discover_albums(root)

    if not albums:
        print(f"No uploadable albums found in {root}")
        return

    print(f"Discovered {len(albums)} album folder(s) in {root}")

    if not args.dry_run:
        artist_id = create_artist(api_url, token, args.artist_name)
        print(f"Created artist {artist_id} ({args.artist_name})")

    for album in albums:
        print(f"\nAlbum: {album.title} [{album.tag}] ({len(album.songs)} song(s))")
        if args.dry_run:
            for song in album.songs:
                print(f"  - {song_title(song)} ({song.suffix.lower().lstrip('.')}, {read_duration_seconds(song)}s)")
            continue

        album_id = create_album(api_url, token, album, artist_id)
        print(f"  Created album {album_id}")

        for song_path in album.songs:
            title = song_title(song_path)
            duration = read_duration_seconds(song_path)
            song_id, upload_url = create_song(api_url, token, album_id, song_path, duration)
            print(f"  Uploading {title} ({duration}s)")
            put_file(upload_url, song_path, audio_content_type(song_path))
            verify_song(api_url, token, song_id)
            print(f"  Verified {song_id}")

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload local test albums and songs to B-Side.")
    parser.add_argument("--artist-name", required=True, help="Artist name to create and upload albums under.")
    parser.add_argument("--root", default="songs", help="Root folder containing one folder per album. Default: songs")
    parser.add_argument("--api", default="http://localhost:8080", help="Backend API URL. Default: http://localhost:8080")
    parser.add_argument("--token", help="JWT auth token. Alternatively set BSIDE_TOKEN.")
    parser.add_argument("--token-file", help="Path to a file containing the JWT auth token.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be uploaded without calling the API.")
    return parser.parse_args()


def main() -> int:
    try:
        upload_library(parse_args())
        return 0
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    except Exception as exc:  # noqa: BLE001 - command-line scripts should surface concise failures.
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
