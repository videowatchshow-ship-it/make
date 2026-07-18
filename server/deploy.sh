#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CENTBEAM 원클릭 서버 배포 — panda-avata.cc (Apache vhost + certbot)
#
# 서버(34.104.233.35 / my-site-1)에서 sudo 로 1회 실행. 멱등(여러 번 돌려도 안전).
# 기존 Apache/참교육카지노.info vhost 는 건드리지 않고 panda-avata vhost 만 추가.
#
# 사용:
#   sudo bash deploy.sh
# 또는 원격 한 방(맥에서):
#   gcloud compute ssh my-site-1 --zone=asia-northeast1-a --command \
#     'set -e; rm -rf /tmp/cb && git clone -b claude/sleepy-goodall-per69w https://github.com/videowatchshow-ship-it/make.git /tmp/cb && sudo bash /tmp/cb/server/deploy.sh'
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="panda-avata.cc"
IP="34.104.233.35"
EMAIL="videowatch.show@gmail.com"
WEBROOT="/var/www/sites/studio/public"
BRANCH="claude/sleepy-goodall-per69w"
REPO="https://github.com/videowatchshow-ship-it/make.git"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo 루트 추정

echo "== [1/7] 필요한 Apache 모듈 =="
a2enmod proxy proxy_http headers rewrite ssl >/dev/null 2>&1 || true

echo "== [2/7] 스튜디오 파일 배치 ($WEBROOT) =="
mkdir -p "$WEBROOT"
if [ -f "$SELF_DIR/client/studio.html" ]; then
  cp -r "$SELF_DIR/client/." "$WEBROOT/"
else
  # 스크립트만 단독 실행된 경우 저장소를 임시로 받아서 복사
  TMP="$(mktemp -d)"; git clone -b "$BRANCH" "$REPO" "$TMP" >/dev/null 2>&1
  cp -r "$TMP/client/." "$WEBROOT/"; rm -rf "$TMP"
fi
chown -R www-data:www-data "$WEBROOT"
test -f "$WEBROOT/studio.html" && echo "  studio.html 배치 OK ($(wc -l < "$WEBROOT/studio.html") 줄)"

echo "== [3/7] Apache vhost 작성 =="
cat > /etc/apache2/sites-available/panda-avata.conf <<EOF
<VirtualHost *:80>
  ServerName $DOMAIN
  ServerAlias www.$DOMAIN
  DocumentRoot $WEBROOT
  <Directory $WEBROOT>
    Require all granted
    Options -Indexes
  </Directory>

  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)"

  ProxyPreserveHost On
  ProxyPass        /whip/ http://127.0.0.1:8889/
  ProxyPassReverse /whip/ http://127.0.0.1:8889/
  ProxyPass        /hls/  http://127.0.0.1:8888/
  ProxyPassReverse /hls/  http://127.0.0.1:8888/
  ProxyPass        /api/  http://127.0.0.1:3000/api/
  ProxyPassReverse /api/  http://127.0.0.1:3000/api/
</VirtualHost>
EOF
a2ensite panda-avata >/dev/null 2>&1 || true
apachectl configtest
systemctl reload apache2
echo "  vhost 활성 + reload OK"

echo "== [4/7] SSL 발급 (certbot) =="
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq certbot python3-certbot-apache
fi
certbot --apache -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring || {
    echo "  ⚠️ certbot 실패: DNS A레코드(@,www→$IP)가 아직 전파 안 됐을 수 있음. dig +short $DOMAIN 확인 후 재실행."; }

echo "== [5/7] 릴레이 API (Node server.js → :3000) 기동 =="
API_DIR="/opt/centbeam/server"
mkdir -p "$API_DIR"
if [ -d "$SELF_DIR/server" ]; then
  cp -r "$SELF_DIR/server/." "$API_DIR/"
else
  TMP2="$(mktemp -d)"; git clone -b "$BRANCH" "$REPO" "$TMP2" >/dev/null 2>&1
  cp -r "$TMP2/server/." "$API_DIR/"; rm -rf "$TMP2"
fi
# Node 없으면 설치 (NodeSource 22 LTS)
if ! command -v node >/dev/null 2>&1; then
  echo "  Node 미설치 → NodeSource 22 설치"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || true
  apt-get install -y -qq nodejs || true
fi
( cd "$API_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --production >/dev/null 2>&1 || true )
# destinations.json 없으면 예시로 초기화
mkdir -p "$API_DIR/data"
if [ ! -f "$API_DIR/data/destinations.json" ]; then
  if [ -f "$API_DIR/destinations.example.json" ]; then cp "$API_DIR/destinations.example.json" "$API_DIR/data/destinations.json";
  else echo '{}' > "$API_DIR/data/destinations.json"; fi
fi
chown -R www-data:www-data "$API_DIR/data"
# systemd 서비스 (재부팅 후 자동 기동, 실패 시 자동 재시작)
cat > /etc/systemd/system/centbeam-api.service <<UNIT
[Unit]
Description=CENTBEAM relay API
After=network.target

[Service]
WorkingDirectory=$API_DIR
Environment=PORT=3000
Environment=DEST_FILE=$API_DIR/data/destinations.json
ExecStart=$(command -v node) $API_DIR/server.js
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now centbeam-api >/dev/null 2>&1 || true
systemctl restart centbeam-api || true
sleep 1
if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  echo "  ✅ API :3000 health OK (systemd: centbeam-api)"
else
  echo "  ⚠️ API :3000 응답 없음 — 'journalctl -u centbeam-api -n 40' 확인"
fi

echo "== [6/7] MediaMTX 상태 확인 =="
if command -v ss >/dev/null 2>&1; then
  ss -ltnup 2>/dev/null | grep -E ':(1935|8888|8889)' && echo "  MediaMTX 포트(1935/8888/8889) 리슨 중" \
    || echo "  ⚠️ MediaMTX 포트가 안 보임 — mediamtx 실행 여부 확인(server/mediamtx.yml)."
fi
echo "  ℹ️ WebRTC 미디어(UDP 8189)는 GCP 방화벽에서 열어야 함:"
echo "     gcloud compute firewall-rules create centbeam-webrtc --allow udp:8189 --source-ranges 0.0.0.0/0"

echo "== [7/7] 검증 =="
sleep 1
echo -n "  studio.html: "; curl -sI "https://$DOMAIN/studio.html" 2>/dev/null | head -1 || true
echo -n "  api/health : "; curl -s "https://$DOMAIN/api/health" 2>/dev/null | head -c 80; echo ""
echo ""
echo "✅ 완료 → 폰에서 https://$DOMAIN/studio.html (카메라 허용 → 홈화면 추가로 앱 설치)"
echo "   WHIP 엔드포인트: https://$DOMAIN/whip/tak/whip"
