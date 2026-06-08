#!/bin/sh
set -eu

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"; echo "Cleaned up temporary files."' EXIT

MC_CONFIG_DIR="$TEMP_DIR/.mc_data"
MC_HOST="${MINIO_HOST:-http://minio:9000}"

until mc --config-dir "$MC_CONFIG_DIR" alias set bside_minio "$MC_HOST" "${AWS_ACCESS_KEY_ID}" "${AWS_SECRET_ACCESS_KEY}"; do
    echo "Waiting for MinIO at $MC_HOST..."
    sleep 2
done

echo "Minio is setup ! Starting bucket provisioning..."
mc --config-dir "$MC_CONFIG_DIR" mb --ignore-existing bside_minio/bside-tracks
mc --config-dir "$MC_CONFIG_DIR" mb --ignore-existing bside_minio/bside-covers
mc --config-dir "$MC_CONFIG_DIR" mb --ignore-existing bside_minio/bside-avatars
mc --config-dir "$MC_CONFIG_DIR" anonymous set download bside_minio/bside-covers
mc --config-dir "$MC_CONFIG_DIR" anonymous set download bside_minio/bside-avatars

if [ -d "/defaults" ]; then
    echo "Uploading default placeholder assets..."
    if [ -f "/defaults/default_cover.jpg" ]; then
        mc --config-dir "$MC_CONFIG_DIR" cp /defaults/default_cover.jpg bside_minio/bside-covers/default_cover.jpg
    fi
    if [ -f "/defaults/default_artist.jpg" ]; then
        mc --config-dir "$MC_CONFIG_DIR" cp /defaults/default_artist.jpg bside_minio/bside-covers/default_artist.jpg
    fi
fi

mc --config-dir "$MC_CONFIG_DIR" cors set bside_minio/bside-tracks /setup-cors.json
