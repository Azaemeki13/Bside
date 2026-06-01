#!/bin/sh
set -eu

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"; echo "Cleaned up temporary files."' EXIT

MC_CONFIG_DIR="$TEMP_DIR/.mc_data"
# Si MINIO_HOST n'est pas défini, on utilise le nom du service Docker "minio" par défaut
MC_HOST="${MINIO_HOST:-http://minio:9000}"

# Docker a déjà injecté AWS_ACCESS_KEY_ID et AWS_SECRET_ACCESS_KEY grâce au env_file !
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

# Attention à ce fichier json, il doit être accessible dans le conteneur !
mc --config-dir "$MC_CONFIG_DIR" cors set bside_minio/bside-tracks /setup-cors.json
