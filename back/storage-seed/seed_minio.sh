#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$BACK_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
RESET=false

if [[ "${1:-}" == "--reset" ]]; then
  RESET=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--reset]"
  exit 2
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

ENDPOINT="${MINIO_SEED_ENDPOINT:-${AWS_PUBLIC_ENDPOINT_URL:-${AWS_ENDPOINT_URL:-http://127.0.0.1:9000}}}"
ACCESS_KEY="${AWS_ACCESS_KEY_ID:-${MINIO_ROOT_USER:-minioadmin}}"
SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-${MINIO_ROOT_PASSWORD:-minioadmin}}"

# This script runs from the host. Internal Docker hostnames such as "minio"
# are usually not reachable there, so prefer AWS_PUBLIC_ENDPOINT_URL or set:
# MINIO_SEED_ENDPOINT=http://127.0.0.1:9000
if [[ "$ENDPOINT" == *"://minio:"* ]]; then
  ENDPOINT="${ENDPOINT/:\/\/minio:/:\/\/127.0.0.1:}"
fi

TRACKS_DIR="$SCRIPT_DIR/buckets/bside-tracks"
COVERS_DIR="$SCRIPT_DIR/buckets/bside-covers"
AVATARS_DIR="$SCRIPT_DIR/buckets/bside-avatars"

for dir in "$TRACKS_DIR" "$COVERS_DIR" "$AVATARS_DIR"; do
  [[ -d "$dir" ]] || { echo "Missing seed directory: $dir"; exit 1; }
done

MC_BODY='set -eu
for attempt in $(seq 1 20); do
  if mc alias set bside "$ENDPOINT" "$ACCESS_KEY" "$SECRET_KEY" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    echo "Unable to connect to MinIO at $ENDPOINT" >&2
    exit 1
  fi
  sleep 2
done

mc mb --ignore-existing bside/bside-tracks >/dev/null
mc mb --ignore-existing bside/bside-covers >/dev/null
mc mb --ignore-existing bside/bside-avatars >/dev/null

MIRROR_FLAGS="--overwrite"
if [ "$RESET" = "true" ]; then
  MIRROR_FLAGS="--overwrite --remove"
fi

mc mirror $MIRROR_FLAGS /seed/bside-tracks bside/bside-tracks
mc mirror $MIRROR_FLAGS /seed/bside-covers bside/bside-covers
mc mirror $MIRROR_FLAGS /seed/bside-avatars bside/bside-avatars

# Covers and avatars are referenced by direct public URLs in the database.
mc anonymous set download bside/bside-covers >/dev/null
mc anonymous set download bside/bside-avatars >/dev/null
# Audio remains private and is served through presigned URLs.
mc anonymous set none bside/bside-tracks >/dev/null || true

echo ""
echo "MinIO seed completed."
echo "Endpoint: $ENDPOINT"
echo "Tracks:  $(mc find bside/bside-tracks --type f | wc -l | tr -d " ")"
echo "Covers:  $(mc find bside/bside-covers --type f | wc -l | tr -d " ")"
echo "Avatars: $(mc find bside/bside-avatars --type f | wc -l | tr -d " ")"
'

if command -v mc >/dev/null 2>&1; then
  ENDPOINT="$ENDPOINT" ACCESS_KEY="$ACCESS_KEY" SECRET_KEY="$SECRET_KEY" RESET="$RESET" \
    sh -c "$MC_BODY"
elif command -v docker >/dev/null 2>&1; then
  DOCKER_ENDPOINT="${ENDPOINT/:\/\/127.0.0.1:/:\/\/host.docker.internal:}"
  DOCKER_ENDPOINT="${DOCKER_ENDPOINT/:\/\/localhost:/:\/\/host.docker.internal:}"
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    --entrypoint /bin/sh \
    -e ENDPOINT="$DOCKER_ENDPOINT" \
    -e ACCESS_KEY="$ACCESS_KEY" \
    -e SECRET_KEY="$SECRET_KEY" \
    -e RESET="$RESET" \
    -v "$SCRIPT_DIR/buckets:/seed:ro" \
    minio/mc:latest -c "$MC_BODY"
else
  echo "Neither the MinIO client (mc) nor Docker is available."
  exit 1
fi
