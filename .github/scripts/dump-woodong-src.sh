#!/usr/bin/env bash
set +e
for s in woodong romi win; do
  echo "===== $s server.js (전체 라인번호) ====="
  sudo cat -n /var/www/sites/$s/server.js 2>/dev/null
  echo
  echo "----- $s: 백업 목록 -----"
  ls -1t /var/www/sites/$s/server.js.* 2>/dev/null | head -10
  echo
done
