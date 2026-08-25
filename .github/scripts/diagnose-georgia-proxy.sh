#!/usr/bin/env bash
set +e

echo "===== 모든 node 리스닝 포트 ====="
ss -ltnp 2>/dev/null | awk '/node/'

echo
echo "===== georgia systemd 유닛 ====="
cat /etc/systemd/system/georgia.service 2>/dev/null

echo
echo "===== georgia server.js 시작부 (포트) ====="
grep -nE "PORT|listen\(|port" /var/www/sites/georgia/server.js | head -20

echo
echo "===== Apache vhost: georgia ====="
grep -rnE "ServerName|ProxyPass|DocumentRoot" /etc/apache2/sites-enabled/ 2>/dev/null | grep -iE "georgia|proxy" | head -30

echo
echo "===== georgia 서비스 재시작 후 포트 확인 ====="
systemctl restart georgia
sleep 3
systemctl is-active georgia
ss -ltnp 2>/dev/null | grep -E "node" | head -30

echo
echo "===== georgia 프로세스가 리스닝 하는 포트 알아내기 ====="
GPID=$(systemctl show -p MainPID georgia --value)
echo "georgia MainPID=$GPID"
if [ -n "$GPID" ] && [ "$GPID" != "0" ]; then
  ss -ltnp 2>/dev/null | grep "pid=$GPID," | head -5
  echo "---"
  ls -la /proc/$GPID/cwd 2>/dev/null
  cat /proc/$GPID/cmdline 2>/dev/null; echo
fi

echo
echo "===== georgia 최근 로그 ====="
journalctl -u georgia --no-pager -n 60 | tail -60

echo
echo "===== 로컬 curl 테스트 (여러 포트) ====="
for P in 3000 3001 3002 3003 3010 3020 3100 4001 4010 5000 8080 8081; do
  R=$(curl -sk --max-time 2 -o /tmp/gr -w "%{http_code}" "http://127.0.0.1:$P/api/accounts" 2>/dev/null)
  [ "$R" != "000" ] && [ -n "$R" ] && echo "port $P → $R  $(head -c 120 /tmp/gr 2>/dev/null)"
done
