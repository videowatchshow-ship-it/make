#!/usr/bin/env bash
set +e

echo "===== 진단: cha / win / second ====="
for site in cha win second; do
  DIR="/var/www/sites/$site"
  echo ""
  echo "--- $site ---"
  echo "디렉토리 존재: $([ -d "$DIR" ] && echo YES || echo NO)"

  # port 추출 (-h 로 파일명 제거)
  PORT=$(sudo grep -hoP 'PORT\s*=\s*\K\d+' "$DIR/server.js" "$DIR/index.js" 2>/dev/null | head -1)
  [ -z "$PORT" ] && PORT=$(sudo grep -hoP 'listen\(\s*\K\d+' "$DIR/server.js" "$DIR/index.js" 2>/dev/null | head -1)
  [ -z "$PORT" ] && PORT=$(sudo grep -hoP ':\K\d{4,5}' "$DIR/server.js" 2>/dev/null | head -1)
  echo "감지된 포트: ${PORT:-UNKNOWN}"

  # 현재 프로세스 상태
  if [ -n "$PORT" ]; then
    PID=$(sudo lsof -ti :"$PORT" 2>/dev/null | head -1)
    echo "포트 $PORT PID: ${PID:-없음}"
  fi

  # systemd 상태
  STATUS=$(sudo systemctl is-active "${site}.service" 2>/dev/null || echo "no-unit")
  echo "systemd: $STATUS"

  # /codes/ endpoint 내장 여부
  HAS_CODES=$(sudo grep -c '/codes' "$DIR/server.js" "$DIR/index.js" 2>/dev/null | awk -F: '{sum+=$2} END{print sum+0}')
  echo "/codes 라우트 수: $HAS_CODES"

  # Apache vhost /codes/ ProxyPass 여부
  VHOST=$(sudo grep -rl "${site}.cent-solution" /etc/apache2/sites-enabled/ 2>/dev/null | head -1)
  echo "vhost 파일: ${VHOST:-없음}"
  if [ -n "$VHOST" ]; then
    HAS_PROXY=$(sudo grep -c 'ProxyPass.*/codes' "$VHOST" 2>/dev/null || echo 0)
    echo "vhost /codes ProxyPass 수: $HAS_PROXY"
    sudo grep -E 'ProxyPass|Listen|:30' "$VHOST" 2>/dev/null | head -5
  fi

  # 로컬 직접 테스트 (포트 알면)
  if [ -n "$PORT" ]; then
    LOCAL=$(curl -sk --max-time 5 "http://127.0.0.1:${PORT}/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -o /dev/null -w "%{http_code}")
    echo "localhost:$PORT /codes/ → $LOCAL"
  fi
done

echo ""
echo "===== win 백엔드 강제 기동 ====="
WIN_DIR="/var/www/sites/win"
WIN_PORT=$(sudo grep -hoP 'PORT\s*=\s*\K\d+' "$WIN_DIR/server.js" "$WIN_DIR/index.js" 2>/dev/null | head -1)
[ -z "$WIN_PORT" ] && WIN_PORT=$(sudo grep -hoP 'listen\(\s*\K\d+' "$WIN_DIR/server.js" "$WIN_DIR/index.js" 2>/dev/null | head -1)
[ -z "$WIN_PORT" ] && WIN_PORT=$(sudo grep -hoP ':\K\d{4,5}' "$WIN_DIR/server.js" 2>/dev/null | head -1)
echo "win 포트: ${WIN_PORT:-UNKNOWN}"

if [ -n "$WIN_PORT" ]; then
  WIN_PID=$(sudo lsof -ti :"$WIN_PORT" 2>/dev/null | head -1)
  if [ -z "$WIN_PID" ]; then
    MAIN="server.js"
    [ ! -f "$WIN_DIR/server.js" ] && MAIN="index.js"
    sudo bash -c "cd '$WIN_DIR' && nohup node '$MAIN' >> /var/log/win-node.log 2>&1 &"
    sleep 3
    WIN_PID2=$(sudo lsof -ti :"$WIN_PORT" 2>/dev/null | head -1)
    echo "기동 결과 PID: ${WIN_PID2:-FAIL}"
  else
    echo "이미 실행중 PID=$WIN_PID"
  fi
fi

echo ""
echo "===== Apache vhost /codes/ ProxyPass 추가 (cha/win/second) ====="
for site in cha win second; do
  DIR="/var/www/sites/$site"
  VHOST=$(sudo grep -rl "${site}.cent-solution" /etc/apache2/sites-enabled/ 2>/dev/null | head -1)
  [ -z "$VHOST" ] && echo "$site: vhost 없음" && continue

  PORT=$(sudo grep -hoP 'ProxyPass\s+\S+\s+http://127\.0\.0\.1:\K\d+' "$VHOST" 2>/dev/null | head -1)
  [ -z "$PORT" ] && echo "$site: vhost에서 포트 추출 실패" && continue

  HAS=$(sudo grep -c 'ProxyPass.*/codes' "$VHOST" 2>/dev/null || echo 0)
  if [ "$HAS" -gt 0 ] 2>/dev/null; then
    echo "$site: /codes/ ProxyPass 이미 있음"
  else
    sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:${PORT}/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:${PORT}/codes/" "$VHOST"
    echo "$site: ProxyPass /codes/ 추가 (port=$PORT)"
  fi
done

echo ""
echo "===== Apache 설정 테스트 & 리로드 ====="
sudo apache2ctl configtest
sudo systemctl reload apache2
echo "리로드 완료"

echo ""
echo "===== 최종 검증 ====="
for site in cha win second; do
  RESP=$(curl -sk --max-time 8 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -o /dev/null -w "%{http_code}")
  echo "  $site: $RESP"
done
