#!/usr/bin/env bash
set +e
echo "===== georgia renderCards 부분 (치환 후 현재 상태) ====="
sudo awk 'NR>=100 && NR<=180' /var/www/sites/georgia/public/index.html | cat -n
echo
echo "===== 'codes' 관련 라인 ====="
sudo grep -nE "var codes|Promise.all|\}\)\)|codes\[|codes =|ALL.map" /var/www/sites/georgia/public/index.html | head -30
