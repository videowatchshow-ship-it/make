#!/usr/bin/env bash
set +e

echo "===== win: 프로세스/포트/unit 실체 ====="
ps -eo pid,cmd | grep -E "sites/win/server.js" | grep -v grep
ss -ltnp 2>/dev/null | grep -E ":4001|win"
echo "--- win unit 후보 ---"
systemctl list-units --all --type=service 2>/dev/null | grep -iE "win" | head
ls -la /var/www/sites/win/ 2>/dev/null
echo "--- win이 Apache 정적/프록시? vhost ---"
grep -rl "win" /etc/apache2/sites-enabled/ 2>/dev/null | head
echo

for s in woodong romi; do
  echo "===== $s: crash 원인 ====="
  echo "--- unit ExecStart ---"
  systemctl cat "$s" 2>/dev/null | grep -E "ExecStart|WorkingDirectory|Environment"
  echo "--- 최근 journal (20줄) ---"
  journalctl -u "$s" --no-pager -n 20 2>/dev/null | tail -20
  echo "--- server.js 포트 ---"
  grep -nE "PORT|listen\(" /var/www/sites/$s/server.js 2>/dev/null | head -3
  echo
done
