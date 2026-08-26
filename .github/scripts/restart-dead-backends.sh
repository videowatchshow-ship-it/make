#!/usr/bin/env bash
set +e
SITES_DIR="/var/www/sites"

echo "===== 죽은 백엔드 재기동 ====="
for site in cha win second; do
  DIR="$SITES_DIR/$site"
  [ -d "$DIR" ] || { echo "$site: 디렉토리 없음"; continue; }

  # 포트 찾기
  PORT=$(grep -oP 'PORT\s*=\s*\K\d+|listen\(\s*\K\d+' "$DIR/server.js" "$DIR/index.js" 2>/dev/null | head -1)
  [ -z "$PORT" ] && PORT=$(grep -oP ':?\K\d{4}' "$DIR/server.js" 2>/dev/null | head -1)

  # 현재 프로세스 확인
  PID=$(sudo lsof -ti :"$PORT" 2>/dev/null | head -1)
  if [ -n "$PID" ]; then
    echo "$site (port=$PORT): 이미 실행중 PID=$PID"
    continue
  fi

  # systemd unit 있으면 start
  UNIT="${site}"
  if sudo systemctl list-unit-files "${UNIT}.service" 2>/dev/null | grep -q "${UNIT}.service"; then
    sudo systemctl start "${UNIT}.service"
    sleep 1
    STATUS=$(sudo systemctl is-active "${UNIT}.service")
    echo "$site: systemctl start → $STATUS"
    continue
  fi

  # unit 없으면 직접 node로 기동
  MAIN="server.js"
  [ ! -f "$DIR/server.js" ] && MAIN="index.js"
  sudo bash -c "cd '$DIR' && nohup node '$MAIN' >> /var/log/${site}-node.log 2>&1 &"
  sleep 2
  PID2=$(sudo lsof -ti :"$PORT" 2>/dev/null | head -1)
  echo "$site (port=$PORT): node 직접 기동 → PID=${PID2:-FAIL}"
done

echo ""
echo "===== 검증 ====="
for site in cha win second; do
  RESP=$(curl -sk --max-time 5 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -o /dev/null -w "%{http_code}")
  echo "  $site: $RESP"
done
