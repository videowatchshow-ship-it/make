#!/usr/bin/env bash
set +e

echo "===== systemd 서비스 상태 ====="
for svc in gauth; do
  echo "--- $svc ---"
  systemctl is-active "$svc"
  systemctl status "$svc" --no-pager -l | head -30
done

echo
echo "===== gauth 최근 로그 (100줄) ====="
journalctl -u gauth --no-pager -n 100 | tail -100

echo
echo "===== 서브사이트 backend 프로세스 ====="
ps -eo pid,user,cmd | grep -E "node .*(rebrowser|auto_deploy|server\.js)" | grep -v grep | head -40

echo
echo "===== 포트 리스닝 ====="
ss -ltnp 2>/dev/null | grep -E ":(4000|300[0-9])" | head -40

echo
echo "===== georgia 백엔드 직접 확인 ====="
for site in georgia; do
  echo "--- $site: /api/$site/accounts ---"
  curl -sk --max-time 5 "http://127.0.0.1:4000/api/$site/accounts" | head -c 400
  echo
done

echo
echo "===== gauth 서비스 재시작 ====="
systemctl restart gauth
sleep 3
systemctl is-active gauth
echo "재시작 후 georgia 재확인:"
curl -sk --max-time 5 "http://127.0.0.1:4000/api/georgia/accounts" | head -c 400
echo

echo
echo "===== 서브사이트 개별 서비스 (있는 것만) ====="
for f in /etc/systemd/system/*.service; do
  n=$(basename "$f" .service)
  case "$n" in gauth) continue;; esac
  if systemctl is-enabled "$n" >/dev/null 2>&1; then
    if grep -q "node" "$f" 2>/dev/null; then
      state=$(systemctl is-active "$n")
      echo "$n → $state"
      if [ "$state" != "active" ]; then
        systemctl restart "$n"
        sleep 1
        echo "  재시작 후 → $(systemctl is-active $n)"
      fi
    fi
  fi
done
