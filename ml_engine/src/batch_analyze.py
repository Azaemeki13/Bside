#!/usr/bin/env python3
"""Offline batch runner for the B-Side audio analyzer.

Walks a local folder of audio files and runs the *exact* same feature
extraction the live ``/analyze`` endpoint uses (``analyzer.compute_audio_features``),
writing one JSON per track into a cache directory plus a combined ``index.json``.

Why: model inference (Essentia / MusiCNN / DEAM) is slow. Running the whole
catalogue once, offline, on the GPU and freezing the results means the demo
database can be rebuilt instantly - the live pipeline then serves these cached
vectors via ``ML_RESULT_CACHE_DIR`` (see ``analyzer._cached_features``).

Run inside the built ml_service image so the model files and library versions
match production exactly:

    docker compose -f docker-compose.yml -f docker-compose.gpu.yml \
        run --rm --entrypoint python ml_service -m src.batch_analyze \
        /data --out /data/ml_cache

The cache key is the SHA-256 of the decoded 16 kHz mono signal, so it does not
matter that the catalogue is FLAC here and uploads may arrive as WAV.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import traceback
from pathlib import Path

import librosa
import numpy as np

try:
    import soundfile as sf
except Exception:  # pragma: no cover - soundfile ships with librosa
    sf = None

from src.analyzer import ESSENTIA_SAMPLE_RATE, compute_audio_features, signal_key

AUDIO_EXTENSIONS = {".flac", ".wav", ".mp3", ".m4a", ".ogg", ".opus"}
_TRACK_NUM_DISC = re.compile(r"^\s*\d+[\s._-]+\d+\s+(.+)$")
_TRACK_NUM = re.compile(r"^\s*\d+\s*[-.\s]+\s*(.+)$")


def derive_metadata(path: Path, root: Path) -> tuple[str, str, str]:
    """Best-effort (artist, album, title) from an ``Artist/Album/NN Title`` tree."""
    parts = path.relative_to(root).parts
    if len(parts) >= 3:
        artist, album = parts[0], parts[1]
    elif len(parts) == 2:
        artist, album = parts[0], parts[0]
    else:
        artist, album = "Unknown Artist", "Unknown Album"

    stem = path.stem
    for pattern in (_TRACK_NUM_DISC, _TRACK_NUM):
        match = pattern.match(stem)
        if match:
            title = match.group(1).strip()
            break
    else:
        title = stem.strip()
    # "Artist - Title" -> "Title" when the artist prefix repeats the folder.
    if " - " in title:
        head, tail = title.split(" - ", 1)
        if head.strip().casefold() == artist.strip().casefold():
            title = tail.strip()
    return artist.strip(), album.strip(), title or stem


def track_duration(path: Path, samples: int, sr: int) -> int:
    if sf is not None:
        try:
            return max(1, round(float(sf.info(str(path)).duration)))
        except Exception:
            pass
    return max(1, round(samples / sr))


def load_index(index_path: Path) -> dict[str, dict]:
    if not index_path.is_file():
        return {}
    try:
        raw = json.loads(index_path.read_text(encoding="utf-8"))
        return {entry["key"]: entry for entry in raw.get("entries", [])}
    except Exception:
        print(f"warning: could not parse existing {index_path}, starting fresh", file=sys.stderr)
        return {}


def write_index(index_path: Path, index: dict[str, dict]) -> None:
    payload = {
        "generated_at": int(time.time()),
        "count": len(index),
        "entries": sorted(index.values(), key=lambda e: e["source_relpath"]),
    }
    tmp = index_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(index_path)


INDEX_FIELDS = (
    "key",
    "source_relpath",
    "artist",
    "album",
    "title",
    "duration_seconds",
    "normalized_vector",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("root", help="Folder to scan recursively for audio files.")
    parser.add_argument("--out", default="ml_cache", help="Cache output directory. Default: ml_cache")
    parser.add_argument("--limit", type=int, help="Only process the first N files (smoke test).")
    parser.add_argument("--reanalyze", action="store_true", help="Recompute even if a cache file already exists.")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        parser.error(f"root is not a directory: {root}")
    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    index_path = out_dir / "index.json"

    files = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS)
    if args.limit:
        files = files[: args.limit]
    if not files:
        parser.error(f"no audio files ({', '.join(sorted(AUDIO_EXTENSIONS))}) under {root}")

    index = load_index(index_path)
    print(f"{len(files)} audio file(s) under {root}")
    print(f"cache dir: {out_dir}  ({len(index)} already indexed)")

    analyzed = cached = failed = 0
    started = time.time()
    for position, path in enumerate(files, start=1):
        rel = str(path.relative_to(root))
        try:
            audio_arr, sr = librosa.load(str(path), sr=ESSENTIA_SAMPLE_RATE, mono=True)
            audio_arr = audio_arr.astype(np.float32)
            key = signal_key(audio_arr)
            cache_file = out_dir / f"{key}.json"
            artist, album, title = derive_metadata(path, root)
            duration = track_duration(path, len(audio_arr), sr)

            if cache_file.is_file() and not args.reanalyze:
                entry = json.loads(cache_file.read_text(encoding="utf-8"))
                entry.update(source_relpath=rel, artist=artist, album=album, title=title)
                cache_file.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
                cached += 1
                tag = "cached"
            else:
                result = compute_audio_features(str(path), audio_arr=audio_arr, sr=sr)
                entry = {
                    "key": key,
                    "source_relpath": rel,
                    "artist": artist,
                    "album": album,
                    "title": title,
                    "duration_seconds": duration,
                    "dsp_analysis": result["dsp_analysis"],
                    "ml_features": result["ml_features"],
                    "normalized_vector": result["normalized_vector"],
                }
                cache_file.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
                analyzed += 1
                tag = "analyzed"

            index[key] = {field: entry[field] for field in INDEX_FIELDS}
            elapsed = time.time() - started
            eta = (len(files) - position) * (elapsed / position)
            vector = [round(v, 3) for v in entry["normalized_vector"]]
            print(
                f"[{position:>3}/{len(files)}] {tag:<8} {rel}  "
                f"mood={entry['ml_features'].get('mood', '?'):<10} vec={vector}  eta={eta/60:5.1f}m",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001 - one bad file must not abort the batch.
            failed += 1
            print(f"[{position:>3}/{len(files)}] FAILED   {rel}: {exc}", file=sys.stderr, flush=True)
            traceback.print_exc()

        if position % 20 == 0:
            write_index(index_path, index)

    write_index(index_path, index)
    total = (time.time() - started) / 60
    print(
        f"\ndone in {total:.1f}m - analyzed={analyzed} cached={cached} failed={failed} "
        f"indexed={len(index)}\nindex: {index_path}"
    )
    return 1 if failed and analyzed == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
