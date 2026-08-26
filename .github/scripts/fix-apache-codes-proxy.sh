#!/usr/bin/env bash
set +e
VHOST_DIR="/etc/apache2/sites-enabled"

echo "===== /codes/ ProxyPass 누락 사이트 수정 ====="
for VHOST in $(sudo ls "$VHOST_DIR"); do
  F="$VHOST_DIR/$VHOST"

  # 기존 ProxyPass에서 포트 추출 (http://127.0.0.1:PORT 패턴)
  PORT=$(sudo grep -oP 'ProxyPass\s+\S+\s+http://127\.0\.0\.1:\K\d+' "$F" 2>/dev/null | head -1)
  [ -z "$PORT" ] && continue

  # /codes/ 이미 있으면 스킵
  HAS=$(sudo grep -c 'ProxyPass.*/codes' "$F" 2>/dev/null || echo 0)
  if [ "$HAS" -gt 0 ]; then
    echo "  SKIP $VHOST (이미 있음)"
    continue
  fi

  # </VirtualHost> 바로 앞에 삽입
  sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:${PORT}/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:${PORT}/codes/" "$F"
  echo "  FIXED $VHOST port=$PORT"
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
