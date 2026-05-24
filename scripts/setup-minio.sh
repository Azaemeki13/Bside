#!/bin/sh
set -o allexport
source ../.env
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"; echo "Cleaned up temporary files."' EXIT

MC_CMD="sudo docker run --rm --network host -v $TEMP_DIR/.mc_data:/root/.mc minio/mc"
until $MC_CMD alias set bside_minio http://localhost:9000 "${AWS_ACCESS_KEY_ID}" "${AWS_SECRET_ACCESS_KEY}"; do
	echo "Waiting for MinIO at http://minio:9000..."
	sleep 2
done
echo "Minio is setup ! Starting bucket provisioning..."
$MC_CMD mb --ignore-existing bside_minio/bside-tracks
$MC_CMD mb --ignore-existing bside_minio/bside-covers
$MC_CMD mb --ignore-existing bside_minio/bside-avatars
$MC_CMD anonymous set download bside_minio/bside-covers
$MC_CMD anonymous set download bside_minio/bside-avatars

echo "Provisioning done !"