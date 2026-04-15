#!/bin/sh

until(/usr/bin/mc alias set bside_minio http://minio:9000 "${AWS_ACCESS_KEY_ID}" "${AWS_SECRET_ACCESS_KEY}") do
	echo "Waiting for MinIO at http://minio::9000..."
	sleep 2
done

echo "Minio is setup ! Starting bucket provisioning..."
/usr/bin/mc mb --ignore-existing bside_minio/bside-tracks
/usr/bin/mc mb --ignore-existing bside_minio/bside-covers
/usr/bin/mc mb anonymous set download bside_minio/bside-covers

echo "Provisioning done !"


