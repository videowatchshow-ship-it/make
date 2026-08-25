#!/usr/bin/env bash
set +e
echo "=== win unit files ==="
systemctl list-unit-files 2>/dev/null | grep -iE "win" | head
echo "=== win 관련 프로세스 ==="
ps -eo pid,cmd 2>/dev/null | grep "sites/win" | grep -v grep
echo "=== port 4001 ==="
ss -ltnp 2>/dev/null | grep 4001
echo "=== win vhost/프록시 ==="
grep -rlE "win\.cent-solution|:4001" /etc/apache2/sites-enabled/ 2>/dev/null | head

echo "=== unit 후보 start 시도 ==="
for u in win win.service site-win.service win-site.service subsite-win.service win-backend.service; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${u%.service}"; then
    systemctl restart "$u" 2>/dev/null
    echo "  $u → $(systemctl is-active ${u%.service} 2>/dev/null)"
  fi
done

echo "=== 포트 4001 미확보 시 직접 기동 ==="
if ! ss -ltnp 2>/dev/null | grep -q 4001; then
  fuser -k 4001/tcp >/dev/null 2>&1; sleep 1
  cd /var/www/sites/win && setsid nohup node server.js > /var/log/win-manual.log 2>&1 < /dev/null &
  sleep 3
  echo "  직접 기동 후 port 4001:"; ss -ltnp 2>/dev/null | grep 4001
  echo "  로그:"; tail -6 /var/log/win-manual.log 2>/dev/null
fi

echo
echo "=== win 로컬 응답 ==="
curl -s --max-time 5 "http://127.0.0.1:4001/api/win/accounts" | head -c 200
echo
echo DONE
