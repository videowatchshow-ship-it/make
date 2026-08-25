#!/usr/bin/env bash
set +e
echo "===== georgia server.js 전체 ====="
sudo cat -n /var/www/sites/georgia/server.js 2>/dev/null
echo
echo "===== 유형 힌트 ====="
grep -cE "createServer" /var/www/sites/georgia/server.js | sed 's/^/createServer: /'
grep -cE "express" /var/www/sites/georgia/server.js | sed 's/^/express: /'
grep -nE "/codes|listen\(|PORT" /var/www/sites/georgia/server.js | head
