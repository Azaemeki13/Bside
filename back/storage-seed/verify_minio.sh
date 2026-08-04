#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$BACK_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }
ENDPOINT="${MINIO_SEED_ENDPOINT:-${AWS_PUBLIC_ENDPOINT_URL:-${AWS_ENDPOINT_URL:-http://127.0.0.1:9000}}}"
ACCESS_KEY="${AWS_ACCESS_KEY_ID:-${MINIO_ROOT_USER:-minioadmin}}"
SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-${MINIO_ROOT_PASSWORD:-minioadmin}}"
[[ "$ENDPOINT" == *"://minio:"* ]] && ENDPOINT="${ENDPOINT/:\/\/minio:/:\/\/127.0.0.1:}"

BODY='set -eu
mc alias set bside "$ENDPOINT" "$ACCESS_KEY" "$SECRET_KEY" >/dev/null
check() { mc stat "bside/$1" >/dev/null || { echo "MISSING: $1"; exit 1; }; echo "OK: $1"; }
check bside-tracks/audio/midnight-drive.mp3
check bside-tracks/audio/quiet-orbit.mp3
check bside-tracks/audio/blue-echo.mp3
check bside-tracks/test/websocket-test-song.wav
check bside-tracks/test/preference-song-a.mp3
check bside-tracks/test/preference-song-b.mp3
check bside-tracks/test/preference-song-c.mp3
check bside-covers/luna.jpg
check bside-covers/noah.jpg
check bside-covers/default_artist.jpg
check bside-covers/midnight-signals.jpg
check bside-covers/blue-static.jpg
check bside-covers/default_cover.jpg
check bside-covers/default_album.jpg
check bside-covers/night-coding.jpg
check bside-avatars/default-avatar.jpg
echo "All expected MinIO objects are present."
'

if command -v mc >/dev/null 2>&1; then
  ENDPOINT="$ENDPOINT" ACCESS_KEY="$ACCESS_KEY" SECRET_KEY="$SECRET_KEY" sh -c "$BODY"
else
  DOCKER_ENDPOINT="${ENDPOINT/:\/\/127.0.0.1:/:\/\/host.docker.internal:}"
  DOCKER_ENDPOINT="${DOCKER_ENDPOINT/:\/\/localhost:/:\/\/host.docker.internal:}"
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    --entrypoint /bin/sh \
    -e ENDPOINT="$DOCKER_ENDPOINT" -e ACCESS_KEY="$ACCESS_KEY" -e SECRET_KEY="$SECRET_KEY" \
    minio/mc:latest -c "$BODY"
fi
