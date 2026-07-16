#!/usr/bin/env bash
# MediaMTX runOnReady 훅. 한 아바타 경로로 publish 되면 destinations.json의
# 모든 대상으로 재인코딩 없이(-c copy) fan-out 한다.
PATH_NAME="$1"
SRC="rtmp://127.0.0.1:1935/${PATH_NAME}"
DEST="${DEST_FILE:-/opt/centbeam/server/data/destinations.json}"
LOG="${LOG_DIR:-/opt/centbeam/server/data}/${PATH_NAME}.log"

jq -c --arg p "$PATH_NAME" '.[$p][]?' "$DEST" 2>/dev/null | while read -r ROW; do
  URL=$(echo "$ROW" | jq -r '.rtmpUrl')
  KEY=$(echo "$ROW" | jq -r '.streamKey')
  TAG=$(echo "$ROW" | jq -r '.name' | tr -c 'A-Za-z0-9_-' '_')
  case "$KEY" in ""|*PUT_KEY_HERE*) continue;; esac
  FULL="${URL%/}/${KEY}"
  echo "[$(date -Is)] fanout ${TAG} -> ${URL}" >> "$LOG"
  exec -a "fanout-${PATH_NAME}-${TAG}" ffmpeg -re -i "$SRC" -c copy -f flv "$FULL" >>"$LOG" 2>&1 &
done
wait
