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
  FULLURL=$(echo "$ROW" | jq -r '.fullUrl')
  # fullUrl:true — 페이스북 Live Video API 처럼 rtmpUrl 자체가 이미 완전한 1회성 URL(쿼리스트링
  # 포함, /streamKey 를 못 붙임)인 경우. 이땐 streamKey 가 비어있는 게 정상이라 스킵하면 안 됨.
  if [ "$FULLURL" = "true" ]; then
    case "$URL" in "") continue;; esac
    FULL="$URL"
  else
    case "$KEY" in ""|*PUT_KEY_HERE*) continue;; esac
    FULL="${URL%/}/${KEY}"
  fi
  # enabled:false 대상은 건너뜀 (UI 토글 off). 미지정(null)/true 는 송출.
  case "$ENABLED" in false) echo "[$(date -Is)] skip ${TAG} (disabled)" >> "$LOG"; continue;; esac
  # 대상별 프로파일: bitrate(kbps)·resolution(WxH)·preset·gop·rateControl·bframes 중 하나라도 있으면
  # 재인코딩, 아무것도 없으면 -c copy(무손실 패스스루). (193/197/198/200/203/204)
  BR=$(echo "$ROW" | jq -r '.bitrate // empty')
  RES=$(echo "$ROW" | jq -r '.resolution // empty')
  PRESET=$(echo "$ROW" | jq -r '.preset // empty')
  GOP=$(echo "$ROW" | jq -r '.gop // empty')
  RC=$(echo "$ROW" | jq -r '.rateControl // empty')
  BF=$(echo "$ROW" | jq -r '.bframes // empty')
  if [ -n "$BR" ] || [ -n "$RES" ] || [ -n "$PRESET" ] || [ -n "$GOP" ] || [ -n "$RC" ] || [ -n "$BF" ]; then
    VF=""; [ -n "$RES" ] && VF="-s ${RES}"
    PRE="${PRESET:-veryfast}"                                              # 인코더 프리셋(200)
    # rateControl(cbr/vbr)만 지정되고 bitrate 가 없으면 libx264 가 조용히 CRF23 로 빠짐 → 기본 비트레이트 강제
    if [ -n "$RC" ] && [ -z "$BR" ]; then BR=4500; echo "[$(date -Is)] ⚠️ ${TAG}: rateControl 지정됐으나 bitrate 없음 → 기본 ${BR}k 적용" >> "$LOG"; fi
    # 키프레임 간격 초(197): force_key_frames + -g 상한(키int 250 기본 제한 회피) + sc_threshold 0(고정 GOP)
    KF="-g 120"; [ -n "$GOP" ] && KF="-force_key_frames expr:gte(t,n_forced*${GOP}) -g $((GOP*60)) -sc_threshold 0"
    BFOPT=""; [ -n "$BF" ] && BFOPT="-bf ${BF}"                            # B-프레임 수(198)
    if [ "$RC" = "cbr" ] && [ -n "$BR" ]; then                            # CBR(193): 고정 비트레이트
      BV="-b:v ${BR}k -minrate ${BR}k -maxrate ${BR}k -bufsize ${BR}k -x264-params nal-hrd=cbr:force-cfr=1"
    elif [ -n "$BR" ]; then                                               # VBR(193): 상한만
      BV="-b:v ${BR}k -maxrate ${BR}k -bufsize $((BR*2))k"
    else
      BV=""
    fi
    echo "[$(date -Is)] fanout ${TAG} -> ${URL} (재인코딩 ${RES:-원본}/${BR:-원본}k preset=${PRE} gop=${GOP:-기본} rc=${RC:-vbr} bf=${BF:-기본})" >> "$LOG"
    # -re 제거: 라이브 입력(rtmp 루프백)에 -re 는 패킷손실/지연 유발 (FFmpeg 공식 경고)
    exec -a "fanout-${PATH_NAME}-${TAG}" ffmpeg -i "$SRC" \
      -c:v libx264 -preset "$PRE" -pix_fmt yuv420p $VF $BV $KF $BFOPT \
      -c:a aac -b:a 128k -f flv "$FULL" >>"$LOG" 2>&1 &
  else
    echo "[$(date -Is)] fanout ${TAG} -> ${URL} (-c copy)" >> "$LOG"
    exec -a "fanout-${PATH_NAME}-${TAG}" ffmpeg -i "$SRC" -c copy -f flv "$FULL" >>"$LOG" 2>&1 &
  fi
done
wait
