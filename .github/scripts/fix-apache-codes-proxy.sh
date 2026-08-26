#!/usr/bin/env bash
set +e
# Apache vhost에 /codes/ ProxyPass 누락된 사이트 전부 수정

echo "===== 각 사이트 포트 및 vhost 확인 ====="
SITES_DIR="/var/www/sites"
VHOST_DIR="/etc/apache2/sites-enabled"

for site in $(ls "$SITES_DIR"); do
  # 포트 찾기: server.js or index.js
  PORT=""
  for f in "$SITES_DIR/$site/server.js" "$SITES_DIR/$site/index.js" "$SITES_DIR/$site/app.js"; do
    if [ -f "$f" ]; then
      PORT=$(grep -oP 'PORT\s*=\s*\K\d+|listen\(\s*\K\d+' "$f" 2>/dev/null | head -1)
      [ -n "$PORT" ] && break
    fi
  done
  [ -z "$PORT" ] && continue

  # vhost 파일 찾기
  VHOST=$(sudo grep -rl "$site\.cent-solution" "$VHOST_DIR" 2>/dev/null | head -1)
  [ -z "$VHOST" ] && continue

  # /codes/ ProxyPass 있는지 확인
  HAS_CODES=$(sudo grep -c "ProxyPass.*/codes" "$VHOST" 2>/dev/null)

  echo "$site (port=$PORT, vhost=$VHOST): codes_proxy=$HAS_CODES"

  if [ "$HAS_CODES" -eq 0 ]; then
    echo "  → /codes/ ProxyPass 추가"
    # /api/$site/ ProxyPass 줄 바로 뒤에 /codes/ 추가
    # 또는 </VirtualHost> 바로 앞에 삽입
    sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:${PORT}/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:${PORT}/codes/" "$VHOST"
    echo "  → 삽입 완료"
  fi
done

echo ""
echo "===== Apache 설정 테스트 ====="
sudo apache2ctl configtest

echo ""
echo "===== Apache 리로드 ====="
sudo systemctl reload apache2

echo ""
echo "===== 검증: 각 사이트 /codes/ 응답 ====="
for site in georgia bacad simmani poten aura james misskim rambo sunbi woodong woodong2 hanrabong gain cha romi win cham second camstouch; do
  RESP=$(curl -sk --max-time 5 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -o /dev/null -w "%{http_code}")
  echo "  $site: $RESP"
done
