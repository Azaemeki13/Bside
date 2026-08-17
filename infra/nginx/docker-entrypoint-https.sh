#!/bin/sh
set -eu

certificate_dir=/etc/nginx/certs
certificate_file="$certificate_dir/localhost.crt"
private_key_file="$certificate_dir/localhost.key"

mkdir -p "$certificate_dir"

if [ ! -s "$certificate_file" ] || [ ! -s "$private_key_file" ]; then
    echo "Generating a local TLS certificate for localhost..."
    openssl req \
        -x509 \
        -nodes \
        -newkey rsa:2048 \
        -days 365 \
        -keyout "$private_key_file" \
        -out "$certificate_file" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
    chmod 600 "$private_key_file"
fi

exec "$@"
