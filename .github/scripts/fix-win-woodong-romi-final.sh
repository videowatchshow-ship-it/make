#!/usr/bin/env bash
# win: 코드 정상 → 포트 좀비 정리 후 재시작.
# woodong/romi: app 참조하는데 app 정의 없는 crash → app정의가 온전한 최신 백업으로 복원.
set +e

# app.을 쓰면서 app 정의가 없으면 broken (crash 확정)
is_broken(){
  local f="$1"
  node --check "$f" 2>/dev/null || return 0   # 문법 에러 = broken
  if grep -qE '(^|[^A-Za-z_.])app\.' "$f"; then
    grep -qE '(const|let|var)[[:space:]]+app[[:space:]]*=|[^A-Za-z_.]app[[:space:]]*=[[:space:]]*express' "$f" || return 0
  fi
  return 1  # ok
}

restart_site(){
  local s="$1" dir="/var/www/sites/$1"
  local port=$(grep -oE "PORT *= *[0-9]{3,5}|PORT *\|\| *[0-9]{3,5}|createServer|listen\([0-9]{3,5}" "$dir/server.js" 2>/dev/null; grep -oE "[0-9]{4}" "$dir/server.js" | head -1)
  # 포트 정리
  for pt in $(grep -oE "PORT *=? *[0-9]{3,5}|[0-9]{4}" "$dir/server.js" 2>/dev/null | grep -oE "[0-9]{3,5}" | sort -u | head -3); do
    fuser -k "${pt}/tcp" 2>/dev/null
  done
  pkill -f "$dir/server.js" 2>/dev/null
  sleep 1
  timeout 25 systemctl restart "$s" 2>/dev/null
  sleep 2
}

for s in woodong romi win; do
  dir="/var/www/sites/$s"
  echo "==== $s ===="
  if is_broken "$dir/server.js"; then
    echo "  현재 server.js broken → 정상 백업 탐색"
    picked=""
    for cand in $(ls -1t "$dir"/server.js.bak.* "$dir"/server.js.totp.bak.* "$dir"/server.js.codesbak.* 2>/dev/null); do
      if ! is_broken "$cand"; then picked="$cand"; break; fi
    done
    if [ -n "$picked" ]; then
      cp "$dir/server.js" "$dir/server.js.broken.$(date +%s)"
      cp "$picked" "$dir/server.js"
      echo "  복원: $(basename $picked)"
    else
      echo "  !! 정상 백업 없음 — 수동 필요"
    fi
  else
    echo "  현재 server.js OK"
  fi
  restart_site "$s"
  echo "  state: $(systemctl is-active $s 2>/dev/null)"
  journalctl -u "$s" --no-pager -n 4 2>/dev/null | grep -iE "listen|error|EADDR|not defined" | head -3
done

echo
echo "===== 전체 실사용 최종 상태 ====="
for s in georgia simmani poten bacad win woodong romi aura james misskim rambo sunbi woodong2 hanrabong gain cha second camstouch; do
  echo "$s: $(systemctl is-active $s 2>/dev/null)"
done
echo DONE
