#!/usr/bin/env bash
set +e
echo "########## georgia: codes/secret 필드 ##########"
sudo grep -nE "var codes|codes\[|twofa_secret|totp_secret|Promise.all|/codes/" /var/www/sites/georgia/public/index.html 2>/dev/null | head -15
echo "--- georgia accounts.json 필드 (첫 계정) ---"
sudo head -c 500 /var/www/sites/georgia/accounts.json 2>/dev/null; echo

for s in rambo hanrabong cha cham woodong2; do
  echo "########## $s: 렌더 구조 ##########"
  echo "--- server type ---"
  sudo grep -cE "createServer" /var/www/sites/$s/server.js 2>/dev/null | sed 's/^/createServer=/'
  sudo grep -nE "totp-code|tdcode|var codes|renderCards|/codes/|innerHTML.*계정|account-list" /var/www/sites/$s/public/index.html 2>/dev/null | head -12
  echo "--- accounts 첫 계정 필드 ---"
  sudo head -c 300 /var/www/sites/$s/accounts.json 2>/dev/null; echo
  echo
done

echo "########## camstouch: HTTP 526 (CF SSL) ##########"
echo "--- 인증서 확인 ---"
sudo ls -la /etc/letsencrypt/live/camstouch.cent-solution.online/ 2>/dev/null || echo "  인증서 없음"
sudo systemctl is-active camstouch 2>/dev/null | sed 's/^/  service: /'

echo "########## win service 상태 ##########"
sudo systemctl is-active win 2>/dev/null | sed 's/^/  win: /'
ss -ltnp 2>/dev/null | grep 4001 | sed 's/^/  /'
