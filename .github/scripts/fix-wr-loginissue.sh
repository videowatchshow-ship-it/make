#!/usr/bin/env bash
# woodong/romi: http.createServer 기반인데 LOGIN_ISSUE_PATCH가 app.use를 잘못 붙여 crash.
# 그 패치 블록(마커부터 파일 끝까지)을 제거 → 원래 TOTP 서버로 복구.
# 안 뜨면 가장 오래된 .bak 복원. win: 좀비 정리 후 재시작. (모든 출력 억제로 SSH 끊김 방지)
set +e

restart_and_check(){
  local s="$1" dir="/var/www/sites/$1"
  # 포트 좀비 정리 (출력 완전 억제)
  for pt in $(grep -oE "PORT *=? *[0-9]{3,5}|:[0-9]{4}" "$dir/server.js" 2>/dev/null | grep -oE "[0-9]{3,5}" | sort -u | head -3); do
    fuser -k "${pt}/tcp" >/dev/null 2>&1
  done
  pkill -f "sites/$s/server.js" >/dev/null 2>&1
  sleep 1
  timeout 25 systemctl restart "$s" >/dev/null 2>&1
  sleep 2
  systemctl is-active "$s" 2>/dev/null
}

for s in woodong romi; do
  dir="/var/www/sites/$s"
  echo "==== $s ===="
  cp "$dir/server.js" "$dir/server.js.prewrfix.$(date +%s)" 2>/dev/null
  # LOGIN_ISSUE_PATCH 마커부터 파일 끝까지 삭제
  if grep -qE "LOGIN_ISSUE_PATCH" "$dir/server.js"; then
    sed -i '/LOGIN_ISSUE_PATCH/,$d' "$dir/server.js"
    echo "  LOGIN_ISSUE 블록 제거"
  fi
  st=$(restart_and_check "$s")
  echo "  1차 state: $st"
  if [ "$st" != "active" ]; then
    # fallback: 가장 오래된 .bak 복원
    oldest=$(ls -1tr "$dir"/server.js.bak.* 2>/dev/null | head -1)
    if [ -n "$oldest" ]; then
      cp "$oldest" "$dir/server.js"
      echo "  fallback 복원: $(basename $oldest)"
      st=$(restart_and_check "$s")
      echo "  2차 state: $st"
    fi
  fi
  journalctl -u "$s" --no-pager -n 5 2>/dev/null | grep -iE "listening|error|EADDR|not defined" | head -3
done

echo "==== win ===="
fuser -k "4001/tcp" >/dev/null 2>&1
pkill -f "sites/win/server.js" >/dev/null 2>&1
sleep 1
timeout 25 systemctl restart win >/dev/null 2>&1
sleep 2
echo "  win state: $(systemctl is-active win 2>/dev/null)"

echo
echo "===== 최종 ====="
for s in georgia simmani poten bacad win woodong romi sunbi aura james misskim rambo woodong2 hanrabong gain cha second camstouch; do
  echo "$s: $(systemctl is-active $s 2>/dev/null)"
done
echo DONE
