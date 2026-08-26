#!/usr/bin/env bash
set +e

echo "===== 1) cha: vhost /codes/ 포트 3035→3022 수정 ====="
CHA_VHOST="/etc/apache2/sites-enabled/cha.conf"
if sudo test -f "$CHA_VHOST"; then
  # /codes/ 가 3035를 가리키면 3022로 교체
  sudo sed -i 's|ProxyPass /codes/ http://127\.0\.0\.1:3035/codes/|ProxyPass /codes/ http://127.0.0.1:3022/codes/|g' "$CHA_VHOST"
  sudo sed -i 's|ProxyPassReverse /codes/ http://127\.0\.0\.1:3035/codes/|ProxyPassReverse /codes/ http://127.0.0.1:3022/codes/|g' "$CHA_VHOST"
  echo "cha vhost /codes/ 포트 수정 완료"
  sudo grep -E 'ProxyPass.*/codes' "$CHA_VHOST"
else
  echo "cha.conf 없음"
fi

echo ""
echo "===== 2) win: vhost 파일 탐색 ====="
WIN_VHOST=$(sudo grep -rl "win" /etc/apache2/sites-enabled/ 2>/dev/null | head -3)
echo "win 관련 vhost 파일들: $WIN_VHOST"
# 전체 목록 확인
sudo ls /etc/apache2/sites-enabled/ 2>/dev/null

echo ""
echo "win.cent-solution 포함 파일:"
sudo grep -rl "win.cent-solution\|win\.cent" /etc/apache2/sites-available/ 2>/dev/null

echo ""
echo "===== 3) second: server.js /codes 라우트 추가 ====="
SECOND_DIR="/var/www/sites/second"
SECOND_JS="$SECOND_DIR/server.js"
[ ! -f "$SECOND_JS" ] && SECOND_JS="$SECOND_DIR/index.js"

echo "second server 파일: $SECOND_JS"
echo "현재 내용 (처음 80줄):"
sudo head -80 "$SECOND_JS" 2>/dev/null

echo ""
echo "포트 확인:"
sudo grep -hoP 'PORT\s*=\s*\K\d+|listen\(\s*\K\d+' "$SECOND_JS" 2>/dev/null | head -5
sudo grep -n 'listen\|PORT\|port\|3023' "$SECOND_JS" 2>/dev/null | head -10
