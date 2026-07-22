#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CENTBEAM 원클릭 서버 배포 — cent-solutions.info (Apache vhost + certbot)
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

DOMAIN="cent-solutions.info"
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

echo "== [3/7] Apache 모듈 + 인증서(certonly) =="
a2enmod ssl proxy proxy_http headers rewrite >/dev/null 2>&1 || true
# (a) ACME HTTP-01(webroot) 용 최소 :80 vhost 먼저
cat > /etc/apache2/sites-available/panda-avata.conf <<EOF
<VirtualHost *:80>
  ServerName $DOMAIN
  ServerAlias www.$DOMAIN
  DocumentRoot $WEBROOT
  <Directory $WEBROOT>
    Require all granted
    Options -Indexes
  </Directory>
</VirtualHost>
EOF
a2ensite panda-avata >/dev/null 2>&1 || true
# certbot --apache 가 예전에 만든 낡은 SSL vhost(-le-ssl.conf, 옛 ProxyPass 보유) 폐기 → deploy 가 직접 관리
a2dissite panda-avata-le-ssl >/dev/null 2>&1 || true
rm -f /etc/apache2/sites-enabled/panda-avata-le-ssl.conf
apachectl configtest && systemctl reload apache2
if ! command -v certbot >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq certbot; fi
# --apache 설치기 대신 certonly: vhost 는 우리가 소유(HTTPS 설정 드리프트 방지)
certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --keep-until-expiring \
  || echo "  ⚠️ certbot 실패: DNS A레코드(@,www→$IP) 전파 확인 후 재실행."

echo "== [4/7] vhost 작성 (:80→HTTPS 리다이렉트 + :443 프록시/헤더/SSL — HTTP·HTTPS 양쪽 deploy 소유) =="
CERT="/etc/letsencrypt/live/$DOMAIN"
if [ -f "$CERT/fullchain.pem" ]; then
  SSLINC=""; [ -f /etc/letsencrypt/options-ssl-apache.conf ] && SSLINC="Include /etc/letsencrypt/options-ssl-apache.conf"
  cat > /etc/apache2/sites-available/panda-avata.conf <<EOF
<VirtualHost *:80>
  ServerName $DOMAIN
  ServerAlias www.$DOMAIN
  DocumentRoot $WEBROOT
  RewriteEngine On
  RewriteRule ^/\.well-known/ - [L]
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>
<VirtualHost *:443>
  ServerName $DOMAIN
  ServerAlias www.$DOMAIN
  DocumentRoot $WEBROOT
  <Directory $WEBROOT>
    Require all granted
    Options -Indexes
  </Directory>
  SSLEngine on
  SSLCertificateFile $CERT/fullchain.pem
  SSLCertificateKeyFile $CERT/privkey.pem
  $SSLINC
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Content-Security-Policy "frame-ancestors 'self'"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()"
  Header always set Cross-Origin-Opener-Policy "same-origin-allow-popups"
  Header always set Cross-Origin-Resource-Policy "same-origin"
  Header always set X-Robots-Tag "noindex, nofollow"
  # sw.js/HTML/manifest 는 항상 서버에 재확인 — 캐시 서비스워커 갱신 지연(최대 24h) 방지
  # (W3C Service Workers spec §Update algorithm 권고, MDN "Service worker caching and HTTP caching")
  <FilesMatch "(\.html|sw\.js|\.webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  ProxyPreserveHost On
  ProxyPass        /whip/ http://127.0.0.1:8889/
  ProxyPassReverse /whip/ http://127.0.0.1:8889/
  ProxyPass        /hls/  http://127.0.0.1:8888/
  ProxyPassReverse /hls/  http://127.0.0.1:8888/
  ProxyPass        /api/  http://127.0.0.1:3000/api/
  ProxyPassReverse /api/  http://127.0.0.1:3000/api/
</VirtualHost>
EOF
else
  echo "  ⚠️ 인증서 없음 → HTTP-only 유지(전파 후 재실행)"
fi
a2ensite panda-avata >/dev/null 2>&1 || true
apachectl configtest
systemctl reload apache2
echo "  vhost 활성 + reload OK"

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
Environment=OAUTH_SECRET_FILE=/var/secrets/oauth-nodetube.json
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

echo "== [6/7] MediaMTX 설치 + systemd 상시 기동 =="
# fanout.sh(publish 감지 시 유튜브 등으로 실제 재전송하는 스크립트)는 매 줄 jq 로
# destinations.json 을 파싱하고 ffmpeg 로 RTMP 재전송한다 — 이 둘이 서버에 없으면
# destinations.json 이 아무리 정확해도 fanout.sh 가 조용히 전부 실패해 어디에도 안 나간다.
# deploy.sh 가 지금까지 이 둘을 설치한 적이 없었음(certbot/node 만 설치).
if ! command -v jq >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  echo "  jq/ffmpeg 설치 중..."
  apt-get update -qq && apt-get install -y -qq jq ffmpeg
fi
command -v jq >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1 \
  && echo "  ✅ jq $(jq --version 2>/dev/null), ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}') 확인됨" \
  || echo "  ⚠️ jq/ffmpeg 설치 실패 — fan-out 이 절대 작동 안 함, 수동 설치 필요: apt-get install -y jq ffmpeg"
chmod +x "$API_DIR/fanout.sh" 2>/dev/null || true   # mediamtx.yml 이 실제로 실행하는 배포 위치

# mediamtx.yml 은 위 [5/7]의 "cp -r server/." 로 이미 $API_DIR/mediamtx.yml 에 최신본이 있음.
MTX_VERSION="v1.19.2"   # server/README.md 로컬 실행 안내와 동일 버전(공식 GitHub 릴리스)
if ! command -v mediamtx >/dev/null 2>&1; then
  echo "  MediaMTX 미설치 → 공식 릴리스 $MTX_VERSION 설치"
  MTX_TMP="$(mktemp -d)"
  if curl -fsSL "https://github.com/bluenviron/mediamtx/releases/download/${MTX_VERSION}/mediamtx_${MTX_VERSION}_linux_amd64.tar.gz" \
      | tar xz -C "$MTX_TMP" 2>/dev/null; then
    mv "$MTX_TMP/mediamtx" /usr/local/bin/mediamtx
    chmod +x /usr/local/bin/mediamtx
    echo "  ✅ /usr/local/bin/mediamtx 설치됨"
  else
    echo "  ⚠️ MediaMTX 다운로드 실패 — 수동 설치 필요(server/README.md §3 참고)"
  fi
  rm -rf "$MTX_TMP"
fi
# 예전엔 mediamtx 를 systemd 없이 수동/nohup 으로만 띄워놔서, 서버가 재부팅되거나
# 프로세스가 죽으면(메모리 부족 등) 아무 것도 자동으로 안 살아나 방송이 영구적으로
# 안 나가는데도 deploy.sh 는 경고 문구만 찍고 아무 조치를 안 했다. centbeam-api 와
# 동일하게 systemd 서비스(Restart=always)로 등록해 재부팅/크래시 자동복구를 보장한다.
if command -v mediamtx >/dev/null 2>&1; then
  MTX_BIN="$(command -v mediamtx)"
  # 기존에 systemd 로 관리되던 게 아니면(수동/nohup 프로세스) 포트 충돌 방지를 위해 먼저 정리
  if ! systemctl is-active --quiet mediamtx 2>/dev/null; then
    OLD_PID="$(pgrep -x mediamtx | head -1 || true)"
    [ -n "$OLD_PID" ] && { echo "  기존 수동 실행 mediamtx(pid $OLD_PID) 정리"; kill "$OLD_PID" 2>/dev/null; sleep 1; }
  fi
  cat > /etc/systemd/system/mediamtx.service <<UNIT
[Unit]
Description=MediaMTX (CENTBEAM WHIP/RTMP relay)
After=network.target

[Service]
WorkingDirectory=$API_DIR
ExecStart=$MTX_BIN $API_DIR/mediamtx.yml
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now mediamtx >/dev/null 2>&1 || true
  systemctl restart mediamtx || true
  sleep 2
  if ss -ltnup 2>/dev/null | grep -qE ':8889\s'; then
    echo "  ✅ MediaMTX systemd 기동 성공(재부팅/크래시 자동복구) — 아무 방송 이름이나 받음"
  else
    echo "  ⚠️ MediaMTX 재시작 후 포트 응답 없음 — 'journalctl -u mediamtx -n 40' 확인"
  fi
fi
if command -v ss >/dev/null 2>&1; then
  ss -ltnup 2>/dev/null | grep -E ':(1935|8888|8889)' && echo "  MediaMTX 포트(1935/8888/8889) 리슨 중" \
    || echo "  ⚠️ MediaMTX 포트가 안 보임 — 'systemctl status mediamtx' 확인."
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
