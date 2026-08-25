#!/usr/bin/env bash
# win/woodong/cham 등 죽은 실사용 서비스 되살리기: 포트 좀비 정리 후 재시작
set +e

revive(){
  local site="$1"
  echo "==== $site ===="
  # unit 존재 확인
  if ! systemctl cat "$site" >/dev/null 2>&1; then
    echo "  unit 없음 (정적 사이트일 수 있음) — skip"
    return
  fi
  # ExecStart의 포트 추정: 최근 .codesbak 없이 현재 server.js에서 PORT 추출
  local dir="/var/www/sites/$site"
  local port=$(grep -oE "PORT *\|\| *[0-9]{3,5}|listen\(([0-9]{3,5})" "$dir/server.js" 2>/dev/null | grep -oE '[0-9]{3,5}' | head -1)
  echo "  추정 포트: ${port:-?}"
  # 해당 포트 좀비 프로세스 kill
  if [ -n "$port" ]; then
    fuser -k "${port}/tcp" 2>/dev/null
    sleep 1
  fi
  # 혹시 남은 node server.js (이 디렉터리) kill
  pkill -f "$dir/server.js" 2>/dev/null
  sleep 1
  timeout 25 systemctl restart "$site" 2>/dev/null
  sleep 2
  echo "  state: $(systemctl is-active $site)"
  systemctl status "$site" --no-pager -l 2>/dev/null | grep -iE "Active:|error|listen|EADDR" | head -5
}

for s in win woodong cham; do revive "$s"; done

echo
echo "===== 전체 실사용 사이트 상태 ====="
for s in georgia simmani poten bacad win woodong cham aura james misskim rambo sunbi woodong2 hanrabong gain cha romi second camstouch; do
  echo "$s: $(systemctl is-active $s 2>/dev/null)"
done
echo DONE
