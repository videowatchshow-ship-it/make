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
  ENABLED=$(echo "$ROW" | jq -r '.enabled')
  case "$KEY" in ""|*PUT_KEY_HERE*) continue;; esac
  # enabled:false 대상은 건너뜀 (UI 토글 off). 미지정(null)/true 는 송출.
  case "$ENABLED" in false) echo "[$(date -Is)] skip ${TAG} (disabled)" >> "$LOG"; continue;; esac
  FULL="${URL%/}/${KEY}"
  # 대상별 프로파일 (203/204): bitrate(kbps)·resolution(WxH) 지정 시 재인코딩, 아니면 -c copy(무손실 패스스루)
  BR=$(echo "$ROW" | jq -r '.bitrate // empty')
  RES=$(echo "$ROW" | jq -r '.resolution // empty')
  if [ -n "$BR" ] || [ -n "$RES" ]; then
    VF=""; [ -n "$RES" ] && VF="-s ${RES}"
    BV=""; [ -n "$BR" ] && BV="-b:v ${BR}k -maxrate ${BR}k -bufsize $((BR*2))k"
    echo "[$(date -Is)] fanout ${TAG} -> ${URL} (재인코딩 ${RES:-원본}/${BR:-원본}k)" >> "$LOG"
    exec -a "fanout-${PATH_NAME}-${TAG}" ffmpeg -re -i "$SRC" \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p $VF $BV -g 60 \
      -c:a aac -b:a 128k -f flv "$FULL" >>"$LOG" 2>&1 &
  else
    echo "[$(date -Is)] fanout ${TAG} -> ${URL} (-c copy)" >> "$LOG"
    exec -a "fanout-${PATH_NAME}-${TAG}" ffmpeg -re -i "$SRC" -c copy -f flv "$FULL" >>"$LOG" 2>&1 &
  fi
done
wait
