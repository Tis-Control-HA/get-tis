#!/bin/bash
set -euo pipefail

export PYTHONUNBUFFERED=1

echo "════════════════════════════════════════"
echo "      WebRTC Voice Add-on Starting      "
echo "════════════════════════════════════════"

export LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)
export AUDIO_PORT=$(jq -r '.audio_port // "8081"' /data/options.json)
export HA_ADDRESS=$(jq -r '.ha_address // "http://homeassistant:8123"' /data/options.json)

echo "[SERVER] Starting HTTP on port 8099 (behind Ingress)"

export PORT=8099

exec python3 /app/webrtc_server_relay.py
