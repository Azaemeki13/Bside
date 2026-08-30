#!/usr/bin/env python3
"""Upload a local test/showcase music library to B-Side.

Supported layouts
=================

1) Flat showcase folder (recommended for demo music):

    songs/
      Black Eyed Peas - I Gotta Feeling.mp3
      Britney Spears - Womanizer.mp3
      CANT STOP THE FEELING!.mp3

   For files named ``Artist - Title.ext`` the filename wins for artist/title.
   Missing values (and album/genre) are filled from ffprobe metadata when
   available. Files without an artist in either place use --fallback-artist.

2) Album folders:

    songs/
      Album Name/
        cover.jpg              # optional
        tag.txt                # optional genre, defaults to --default-genre
        01 - First Track.wav
        02 - Second Track.flac

   Artist and album names are read from embedded metadata. Use --artist-name
   only when all folders should be forced under one artist.

B-Side currently accepts WAV/FLAC uploads only. MP3 files are therefore valid
*input* for this script, but are transparently transcoded to WAV with ffmpeg
before the API upload. The original MP3 is never modified.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

INPUT_AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3"}
BACKEND_AUDIO_EXTENSIONS = {".wav", ".flac"}
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
DEFAULT_GENRE = "Pop"
DEFAULT_FLAT_ALBUM = "ML Showcase"
GENRE_ALIASES = {
    "alternative & indie": "Indie",
    "hardcore hip hop": "Hip-Hop",
    "hip hop": "Hip-Hop",
    "hip-hop/rap": "Hip-Hop",
    "rap": "Hip-Hop",
}


@dataclass(frozen=True)
class TrackInput:
    source: Path
    artist: str
    album: str
    title: str
    genre: str
    cover: Path | None
    duration_seconds: int


@dataclass(frozen=True)
class AlbumGroup:
    artist: str
    title: str
    genre: str
    cover: Path | None
    songs: list[TrackInput]


@dataclass
class UploadedSong:
    song_id: str
    artist: str
    album: str
    title: str
    genre: str
    source_file: str
    uploaded_format: str
    transcoded: bool


def natural_key(path: Path) -> list[int | str]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def read_text_file(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


def find_tag(album_dir: Path, default_genre: str) -> str:
    for name in TAG_NAMES:
        value = read_text_file(album_dir / name)
        if value:
            return value
    return default_genre


def normalize_genre(value: str) -> str:
    return GENRE_ALIASES.get(value.strip().casefold(), value.strip())


def find_cover(album_dir: Path) -> Path | None:
    supported = {name.casefold() for name in COVER_NAMES}
    for candidate in album_dir.iterdir():
        if candidate.is_file() and candidate.name.casefold() in supported:
            return candidate
    return None


def clean_track_stem(path: Path) -> str:
    title = path.stem.strip()
    title = re.sub(r"^\d+\s*[-_. ]\s*", "", title).strip()
    return title or path.stem


def split_artist_title_from_filename(path: Path) -> tuple[str | None, str | None]:
    stem = clean_track_stem(path)
    if " - " not in stem:
        return None, None
    artist, title = stem.split(" - ", 1)
    artist = artist.strip()
    title = title.strip()
    return (artist or None), (title or None)


def ffprobe_info(path: Path) -> tuple[float | None, dict[str, str]]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None, {}
    command = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration:format_tags=artist,album_artist,title,album,genre,track",
        "-of",
        "json",
        str(path),
    ]
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
        payload = json.loads(completed.stdout or "{}")
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError):
        return None, {}

    fmt = payload.get("format") if isinstance(payload, dict) else None
    if not isinstance(fmt, dict):
        return None, {}
    duration: float | None = None
    try:
        raw_duration = fmt.get("duration")
        duration = float(raw_duration) if raw_duration is not None else None
    except (TypeError, ValueError):
        duration = None

    tags_raw = fmt.get("tags")
    tags: dict[str, str] = {}
    if isinstance(tags_raw, dict):
        for key, value in tags_raw.items():
            if isinstance(value, str) and value.strip():
                tags[key.lower()] = value.strip()
    return duration, tags


def duration_seconds(path: Path, probed_duration: float | None = None) -> int:
    duration = probed_duration
    if duration is None:
        duration, _ = ffprobe_info(path)
    return max(1, round(duration)) if duration and duration > 0 else DEFAULT_DURATION_SECONDS


def discover_flat_tracks(root: Path, args: argparse.Namespace) -> list[TrackInput]:
    files = sorted(
        (item for item in root.iterdir() if item.is_file() and item.suffix.lower() in INPUT_AUDIO_EXTENSIONS),
        key=natural_key,
    )
    tracks: list[TrackInput] = []
    for path in files:
        probed_duration, tags = ffprobe_info(path)
        filename_artist, filename_title = split_artist_title_from_filename(path)
        artist = filename_artist or tags.get("artist") or args.fallback_artist
        title = filename_title or tags.get("title") or clean_track_stem(path)
        album = tags.get("album") or args.flat_album
        genre = tags.get("genre") or args.default_genre
        if not artist:
            raise SystemExit(
                f"Cannot determine artist for {path.name}. Rename it to 'Artist - Title.ext', "
                "add artist metadata, or pass --fallback-artist."
            )
        tracks.append(
            TrackInput(
                source=path,
                artist=artist.strip(),
                album=album.strip() or args.flat_album,
                title=title.strip() or clean_track_stem(path),
                genre=genre.strip() or args.default_genre,
                cover=None,
                duration_seconds=duration_seconds(path, probed_duration),
            )
        )
    return tracks


def discover_legacy_tracks(root: Path, args: argparse.Namespace) -> list[TrackInput]:
    tracks: list[TrackInput] = []
    for album_dir in sorted((item for item in root.iterdir() if item.is_dir()), key=natural_key):
        songs = sorted(
            (item for item in album_dir.iterdir() if item.is_file() and item.suffix.lower() in INPUT_AUDIO_EXTENSIONS),
            key=natural_key,
        )
        if not songs:
            continue
        probed = [(path, *ffprobe_info(path)) for path in songs]
        album_artist = args.artist_name or next(
            (
                tags.get("album_artist") or tags.get("artist")
                for _, _, tags in probed
                if tags.get("album_artist") or tags.get("artist")
            ),
            None,
        )
        if not album_artist:
            raise SystemExit(
                f"Cannot determine album artist for {album_dir}. Add embedded metadata or pass --artist-name."
            )
        album_title = next(
            (tags.get("album") for _, _, tags in probed if tags.get("album")),
            album_dir.name.strip(),
        )
        embedded_genre = next((tags.get("genre") for _, _, tags in probed if tags.get("genre")), None)
        genre = normalize_genre(find_tag(album_dir, embedded_genre or args.default_genre))
        cover = find_cover(album_dir)
        if not cover:
            raise SystemExit(f"Missing cover image in album folder: {album_dir}")

        candidates: list[tuple[TrackInput, dict[str, str]]] = []
        for path, probed_duration, tags in probed:
            candidates.append(
                (
                    TrackInput(
                        source=path,
                        artist=album_artist.strip(),
                        album=album_title.strip(),
                        title=(tags.get("title") or clean_track_stem(path)).strip(),
                        genre=genre,
                        cover=cover,
                        duration_seconds=duration_seconds(path, probed_duration),
                    ),
                    tags,
                )
            )

        unique: dict[str, tuple[TrackInput, dict[str, str]]] = {}
        for candidate, tags in candidates:
            identity = candidate.title
            track_artist = tags.get("artist", "")
            if track_artist and track_artist.casefold() != album_artist.casefold():
                identity = f"{track_artist} - {identity}"
            identity = re.sub(r"[^\w]+", "", identity.casefold())
            current = unique.get(identity)
            score = sum(bool(tags.get(key)) for key in ("title", "track", "genre", "album_artist"))
            current_score = (
                sum(bool(current[1].get(key)) for key in ("title", "track", "genre", "album_artist"))
                if current
                else -1
            )
            if score > current_score:
                unique[identity] = (candidate, tags)

        tracks.extend(candidate for candidate, _ in unique.values())
    return tracks


def discover_tracks(root: Path, args: argparse.Namespace) -> list[TrackInput]:
    if not root.exists():
        raise SystemExit(f"Root folder does not exist: {root}")
    if not root.is_dir():
        raise SystemExit(f"Root path is not a directory: {root}")

    flat = discover_flat_tracks(root, args)
    legacy = discover_legacy_tracks(root, args)
    tracks = flat + legacy
    if not tracks:
        expected = ", ".join(sorted(INPUT_AUDIO_EXTENSIONS))
        raise SystemExit(f"No uploadable audio files ({expected}) found in {root}.")
    return tracks


def group_tracks(tracks: Iterable[TrackInput]) -> list[AlbumGroup]:
    grouped: dict[tuple[str, str, str, str | None], list[TrackInput]] = {}
    covers: dict[tuple[str, str, str, str | None], Path | None] = {}
    for track in tracks:
        cover_key = str(track.cover.resolve()) if track.cover else None
        key = (track.artist, track.album, track.genre, cover_key)
        grouped.setdefault(key, []).append(track)
        covers[key] = track.cover

    albums: list[AlbumGroup] = []
    for (artist, album, genre, _), songs in grouped.items():
        albums.append(
            AlbumGroup(
                artist=artist,
                title=album,
                genre=genre,
                cover=covers[(artist, album, genre, str(songs[0].cover.resolve()) if songs[0].cover else None)],
                songs=sorted(songs, key=lambda song: natural_key(song.source)),
            )
        )
    return sorted(albums, key=lambda item: (item.artist.lower(), item.title.lower()))


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
        "Missing admin auth token. Pass --token, --token-file, or set BSIDE_TOKEN. "
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
    body, content_type = multipart_body({"name": name, "bio": "Showcase artist"}, {})
    try:
        response = request_json("POST", f"{api_url}/artists", token=token, body=body, content_type=content_type)
        artist_id = response.get("id") if isinstance(response, dict) else None
        if not artist_id:
            raise RuntimeError(f"Artist creation returned no id: {response}")
        return str(artist_id)
    except RuntimeError as exc:
        if "409" not in str(exc):
            raise
        artists = request_json("GET", f"{api_url}/artists", token=token)
        if not isinstance(artists, list):
            raise RuntimeError(f"Failed to fetch artists: {artists}") from exc
        match = next((artist for artist in artists if artist.get("name", "").casefold() == name.casefold()), None)
        if not match:
            raise RuntimeError(f"Artist '{name}' not found after 409 conflict") from exc
        print(f"  Reusing existing artist {match['id']} ({name})")
        return str(match["id"])


def create_album(api_url: str, token: str, album: AlbumGroup, artist_id: str) -> str:
    body, content_type = multipart_body(
        {"title": album.title, "genre": album.genre},
        {"cover": album.cover} if album.cover else {},
    )
    response = request_json(
        "POST",
        f"{api_url}/admin/artists/{artist_id}/albums",
        token=token,
        body=body,
        content_type=content_type,
    )
    album_id = response.get("id") if isinstance(response, dict) else None
    if not album_id:
        raise RuntimeError(f"Album creation returned no id: {response}")
    return str(album_id)


def create_song(
    api_url: str,
    token: str,
    album_id: str,
    title: str,
    upload_path: Path,
    duration: int,
) -> tuple[str, str]:
    fmt = upload_path.suffix.lower().lstrip(".")
    if f".{fmt}" not in BACKEND_AUDIO_EXTENSIONS:
        raise RuntimeError(f"Backend upload format must be WAV or FLAC, got: {upload_path.name}")
    payload = {
        "title": title,
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


def prepare_upload_file(source: Path, temp_dir: Path) -> tuple[Path, bool]:
    if source.suffix.lower() in BACKEND_AUDIO_EXTENSIONS:
        return source, False
    if source.suffix.lower() != ".mp3":
        raise RuntimeError(f"Unsupported input format: {source.suffix}")

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            f"{source.name} is MP3 but B-Side currently accepts only WAV/FLAC. Install ffmpeg "
            "or convert the file manually."
        )

    target = temp_dir / f"{source.stem}.wav"
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        str(target),
    ]
    subprocess.run(command, check=True)
    return target, True


def write_manifest(path: Path, uploaded: list[UploadedSong]) -> None:
    payload = {
        "generated_at_epoch": int(time.time()),
        "song_count": len(uploaded),
        "songs": [asdict(song) for song in uploaded],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def print_plan(albums: list[AlbumGroup]) -> None:
    print(f"Discovered {sum(len(album.songs) for album in albums)} track(s) in {len(albums)} album group(s):")
    for album in albums:
        print(f"\n{album.artist} — {album.title} [{album.genre}]")
        for song in album.songs:
            conversion = " -> WAV" if song.source.suffix.lower() == ".mp3" else ""
            print(f"  - {song.title} ({song.source.suffix.lower().lstrip('.')}{conversion}, {song.duration_seconds}s)")


def upload_library(args: argparse.Namespace) -> None:
    if args.insecure:
        context = ssl._create_unverified_context()
        urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=context)))

    root = Path(args.root).expanduser().resolve()
    api_url = args.api.rstrip("/")
    albums = group_tracks(discover_tracks(root, args))
    print_plan(albums)
    if args.dry_run:
        return

    token = token_from_args(args)
    manifest_path = Path(args.manifest).expanduser().resolve()
    uploaded: list[UploadedSong] = []
    artist_ids: dict[str, str] = {}

    with tempfile.TemporaryDirectory(prefix="bside-showcase-") as tmp:
        temp_dir = Path(tmp)
        for album in albums:
            artist_id = artist_ids.get(album.artist.casefold())
            if artist_id is None:
                artist_id = create_artist(api_url, token, album.artist)
                artist_ids[album.artist.casefold()] = artist_id
                print(f"\nArtist: {album.artist} ({artist_id})")

            album_id = create_album(api_url, token, album, artist_id)
            print(f"  Album: {album.title} ({album_id})")
            for track in album.songs:
                upload_path, transcoded = prepare_upload_file(track.source, temp_dir)
                song_id, upload_url = create_song(
                    api_url,
                    token,
                    album_id,
                    track.title,
                    upload_path,
                    track.duration_seconds,
                )
                action = "Transcoding + uploading" if transcoded else "Uploading"
                print(f"    {action}: {track.title}")
                put_file(upload_url, upload_path, audio_content_type(upload_path))
                verify_song(api_url, token, song_id)
                print(f"    Verified / ML queued: {song_id}")
                uploaded.append(
                    UploadedSong(
                        song_id=song_id,
                        artist=track.artist,
                        album=track.album,
                        title=track.title,
                        genre=track.genre,
                        source_file=str(track.source),
                        uploaded_format=upload_path.suffix.lower().lstrip("."),
                        transcoded=transcoded,
                    )
                )

    write_manifest(manifest_path, uploaded)
    print(f"\nUpload complete: {len(uploaded)} song(s).")
    print(f"Manifest: {manifest_path}")
    print("Wait for the ML callback to mark every song Ready with a 6D normalized_vector, then run seed_ml_showcase.sql.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload local test/showcase songs to B-Side.")
    parser.add_argument("--root", default="songs", help="Root folder containing audio files or album folders. Default: songs")
    parser.add_argument(
        "--api",
        default="https://localhost/api",
        help="Backend API URL. Default: https://localhost/api",
    )
    parser.add_argument(
        "--artist-name",
        help="Album-folder override: put every album folder under this artist instead of using embedded metadata.",
    )
    parser.add_argument(
        "--fallback-artist",
        default="B-Side Showcase",
        help="Artist used only when a flat file has neither 'Artist - Title' nor artist metadata.",
    )
    parser.add_argument(
        "--flat-album",
        default=DEFAULT_FLAT_ALBUM,
        help=f"Album used for flat files without album metadata. Default: {DEFAULT_FLAT_ALBUM}",
    )
    parser.add_argument(
        "--default-genre",
        default=DEFAULT_GENRE,
        help=f"Genre used when no metadata/tag.txt exists. Default: {DEFAULT_GENRE}",
    )
    parser.add_argument("--token", help="Admin JWT auth token. Alternatively set BSIDE_TOKEN.")
    parser.add_argument("--token-file", help="Path to a file containing the admin JWT auth token.")
    parser.add_argument(
        "--manifest",
        default="showcase-upload-manifest.json",
        help="Where to write the uploaded song IDs. Default: showcase-upload-manifest.json",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print parsed metadata/conversions without calling the API.")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Accept the generated localhost certificate. Use only for local development.",
    )
    return parser.parse_args()


def main() -> int:
    try:
        upload_library(parse_args())
        return 0
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    except subprocess.CalledProcessError as exc:
        print(f"ffmpeg/ffprobe failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - CLI scripts should surface concise failures.
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
