#!/usr/bin/env bash
set +e

echo "===== DNS 확인 ====="
for site in win second; do
  IP=$(dig +short "${site}.cent-solution.online" A 2>/dev/null | tail -1)
  echo "$site.cent-solution.online → ${IP:-NXDOMAIN}"
done

SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || ip route get 1 2>/dev/null | grep -oP 'src \K\S+')
echo "이 서버 IP: $SERVER_IP"

echo ""
echo "===== win HTTP 직접 테스트 ====="
curl -s --max-time 5 "http://win.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\nhttp=%{http_code}\n" 2>/dev/null | tail -2

echo ""
echo "===== second: SSL 인증서 취득 ====="
# certbot으로 second.cent-solution.online 인증서 발급
# --apache 플러그인 사용 (자동으로 second.conf를 HTTP 인증에 활용)
SECOND_EMAIL="videowatch.show@gmail.com"
sudo certbot --apache \
  -d second.cent-solution.online \
  --non-interactive \
  --agree-tos \
  -m "$SECOND_EMAIL" \
  --redirect 2>&1 | tail -20

SECOND_CERT_DIR="/etc/letsencrypt/live/second.cent-solution.online"
echo ""
echo "인증서 존재: $(sudo test -d '$SECOND_CERT_DIR' && echo '있음' || echo '없음')"
sudo ls "$SECOND_CERT_DIR" 2>/dev/null

echo ""
echo "===== second-le-ssl.conf 확인 및 /codes 추가 ====="
SECOND_SSL=$(sudo find /etc/apache2/sites-enabled/ -name 'second-le-ssl*' 2>/dev/null | head -1)
echo "second SSL vhost: ${SECOND_SSL:-없음}"

if [ -n "$SECOND_SSL" ]; then
  HAS=$(sudo grep -c '/codes' "$SECOND_SSL" 2>/dev/null)
  echo "/codes count: $HAS"
  if [ "${HAS:-0}" = "0" ]; then
    # 기존 ProxyPass / 유지하면서 /codes/ 라우트 추가
    # </VirtualHost> 앞에 삽입
    sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:3023/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:3023/codes/" "$SECOND_SSL"
    echo "second SSL: /codes/ ProxyPass 추가"
  else
    echo "second SSL: /codes 이미 있음"
    sudo grep '/codes' "$SECOND_SSL"
  fi
fi

echo ""
echo "===== win 인증서 문제 해결 ====="
# win.cent-solution.online 전용 certbot 시도
sudo certbot --apache \
  -d win.cent-solution.online \
  --non-interactive \
  --agree-tos \
  -m "$SECOND_EMAIL" 2>&1 | tail -20

WIN_CERT_DIR="/etc/letsencrypt/live/win.cent-solution.online"
echo "win 인증서: $(sudo test -d '$WIN_CERT_DIR' && echo '있음' || echo '없음')"

# win-le-ssl.conf가 gain 인증서를 쓰고 있으면, win 전용으로 업데이트
if sudo test -d "$WIN_CERT_DIR"; then
  WIN_SSL="/etc/apache2/sites-enabled/win-le-ssl.conf"
  sudo sed -i "s|/etc/letsencrypt/live/gain.cent-solution.online/fullchain.pem|/etc/letsencrypt/live/win.cent-solution.online/fullchain.pem|g" "$WIN_SSL" 2>/dev/null
  sudo sed -i "s|/etc/letsencrypt/live/gain.cent-solution.online/privkey.pem|/etc/letsencrypt/live/win.cent-solution.online/privkey.pem|g" "$WIN_SSL" 2>/dev/null
  echo "win SSL: 인증서 경로 업데이트 완료"
fi

echo ""
echo "===== Apache configtest + reload ====="
sudo apache2ctl configtest 2>&1 | tail -5
sudo systemctl reload apache2 && echo "reload 완료"

echo ""
echo "===== 최종 검증 ====="
for site in cha win second; do
  RESP=$(curl -sk --max-time 8 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\n  http=%{http_code}" 2>/dev/null | tail -2)
  RESP_HTTP=$(curl -s --max-time 8 "http://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\n  http=%{http_code}" 2>/dev/null | tail -2)
  echo "  $site HTTPS: $RESP"
  echo "  $site HTTP:  $RESP_HTTP"
done
