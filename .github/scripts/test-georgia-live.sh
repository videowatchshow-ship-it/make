#!/usr/bin/env bash
set +e
echo "=== georgia 포트 ==="
PORT=$(grep -oE "PORT *= *[0-9]{3,5}" /var/www/sites/georgia/server.js | grep -oE '[0-9]+' | head -1)
echo "  PORT=$PORT"
echo "=== georgia MainPID / 리스닝 ==="
GPID=$(systemctl show -p MainPID georgia --value)
echo "  MainPID=$GPID"
ss -ltnp 2>/dev/null | grep "pid=$GPID," | head -3

echo "=== /api/georgia/accounts (실제 응답) ==="
curl -s --max-time 5 "http://127.0.0.1:$PORT/api/georgia/accounts" | head -c 800
echo
echo "=== ACCOUNTS_PATH 확인 ==="
grep -nE "ACCOUNTS_PATH|accounts.json|readFileSync" /var/www/sites/georgia/server.js | head -5
echo "--- 실제 accounts.json 경로들 ---"
ls -la /var/www/sites/georgia/*.json 2>/dev/null
echo "--- accounts.json 내용 크기 ---"
wc -c /var/www/sites/georgia/accounts.json 2>/dev/null

echo "=== /codes 테스트 (psond17fd 시크릿) ==="
curl -s --max-time 5 "http://127.0.0.1:$PORT/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" | head -c 200
echo
