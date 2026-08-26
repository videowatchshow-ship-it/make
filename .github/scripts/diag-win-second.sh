#!/usr/bin/env bash
set +e

echo "===== 포트 443 리스닝 확인 ====="
sudo ss -tlnp | grep ':443'

echo ""
echo "===== sites-enabled 전체 목록 ====="
sudo ls -la /etc/apache2/sites-enabled/

echo ""
echo "===== second vhost 확인 ====="
SECOND_CONF=$(sudo find /etc/apache2/sites-enabled/ -name 'second*' 2>/dev/null | head -3)
echo "second 관련: ${SECOND_CONF:-없음}"
sudo find /etc/apache2/sites-available/ -name 'second*' 2>/dev/null

echo ""
echo "second vhost 내용 (sites-available):"
SAVAIL=$(sudo find /etc/apache2/sites-available/ -name 'second*' 2>/dev/null | head -1)
if [ -n "$SAVAIL" ]; then
  sudo cat "$SAVAIL"
fi

echo ""
echo "===== DNS 및 curl 직접 테스트 ====="
echo "--- win 로컬 직접 ---"
curl -sk --max-time 5 http://127.0.0.1:4001/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L -w "\nhttp=%{http_code}\n"

echo ""
echo "--- second 포트 찾기 ---"
SECOND_JS="/var/www/sites/second/server.js"
sudo grep -n 'listen\|PORT\|port' "$SECOND_JS" 2>/dev/null | head -10
SECOND_PORT=$(sudo grep -hoP 'listen\(\s*\K\d+|PORT\s*=\s*\K\d+' "$SECOND_JS" 2>/dev/null | head -1)
[ -z "$SECOND_PORT" ] && SECOND_PORT="3023"
echo "second 포트: $SECOND_PORT"
curl -sk --max-time 5 "http://127.0.0.1:${SECOND_PORT}/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\nhttp=%{http_code}\n"

echo ""
echo "===== Apache VirtualHost *:443 목록 ====="
sudo apache2ctl -S 2>&1 | grep -i '443\|ssl\|second\|win'

echo ""
echo "===== second.conf SSL 여부 ====="
sudo grep -r 'second\.cent-solution\|ServerName.*second' /etc/apache2/sites-available/ 2>/dev/null | head -10

echo ""
echo "===== win SSL 인증서 확인 ====="
sudo cat /etc/apache2/sites-enabled/win-le-ssl.conf 2>/dev/null | grep -i 'ssl\|cert\|ServerName'

echo ""
echo "===== 인증서 목록 ====="
sudo ls /etc/letsencrypt/live/ 2>/dev/null

echo ""
echo "===== Apache error log (최근 10줄) ====="
sudo tail -10 /var/log/apache2/error.log 2>/dev/null
