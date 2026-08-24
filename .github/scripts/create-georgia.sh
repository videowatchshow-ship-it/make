#!/usr/bin/env bash
# ref: https://httpd.apache.org/docs/2.4/vhosts/examples.html
set -e

SITE=georgia
KNAME="조지아"
PORT=3036
DEST=/var/www/sites/${SITE}
DOMAIN="${SITE}.cent-solution.online"

echo "==== ${SITE} (${KNAME}) port=${PORT} ===="

if [ -d "$DEST" ]; then
  echo "  이미 존재 — skip"; exit 0
fi

TEMPLATE=/var/www/sites/bacad

mkdir -p "${DEST}/public"
cp "${TEMPLATE}/server.js" "${DEST}/server.js"
cp -r "${TEMPLATE}/public/." "${DEST}/public/"
printf '{"accounts":[]}\n' > "${DEST}/accounts.json"

# 슬러그 치환
sed -i "s|/api/bacad/|/api/${SITE}/|g" "${DEST}/server.js" || true
sed -i "s|바캐드|${KNAME}|g" "${DEST}/public/index.html" || true
sed -i "s|bacad|${SITE}|g" "${DEST}/public/index.html" || true

# 포트 치환
CUR=$(grep -oE 'listen\s*\(\s*[0-9]+' "${DEST}/server.js" | head -1 | grep -oE '[0-9]+' || true)
if [ -n "$CUR" ] && [ "$CUR" != "$PORT" ]; then
  sed -i "s|listen(\s*${CUR}|listen(${PORT}|g" "${DEST}/server.js"
fi
sed -i "s|const PORT\s*=\s*[0-9]\+|const PORT = ${PORT}|g" "${DEST}/server.js" || true

chown -R www-data:www-data "$DEST"

# certbot
if [ ! -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  certbot certonly --apache --non-interactive --agree-tos \
    --email admin@cent-solution.online \
    --domains "$DOMAIN" 2>&1 | tail -8 || echo "cert 발급 실패"
fi
CERT=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
KEY=/etc/letsencrypt/live/${DOMAIN}/privkey.pem

# systemd
cat > "/etc/systemd/system/${SITE}.service" <<UNIT
[Unit]
Description=${KNAME} (${SITE}) subsite Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${DEST}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=${PORT}
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
UNIT

# Apache vhost
cat > "/etc/apache2/sites-available/${SITE}.conf" <<APACHE
<VirtualHost *:80>
  ServerName ${DOMAIN}
  Redirect permanent / https://${DOMAIN}/
</VirtualHost>
<VirtualHost *:443>
  ServerName ${DOMAIN}
  DocumentRoot ${DEST}/public
  <Directory ${DEST}/public>
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
  </Directory>
  ProxyPass /api/ http://127.0.0.1:${PORT}/api/
  ProxyPassReverse /api/ http://127.0.0.1:${PORT}/api/
  SSLEngine on
  SSLCertificateFile ${CERT}
  SSLCertificateKeyFile ${KEY}
</VirtualHost>
APACHE

a2ensite "${SITE}.conf" 2>&1 || true
systemctl daemon-reload
systemctl enable "${SITE}.service" 2>&1 || true
systemctl restart "${SITE}.service" 2>&1 || true

apache2ctl configtest 2>&1 && systemctl reload apache2 || echo "::warning::apache invalid"

echo ""
echo "===== 검증 ====="
systemctl is-active "${SITE}.service" 2>&1 | sed "s|^|${SITE}: |"
curl -sSk -o /dev/null -w "  https://${DOMAIN}/ → HTTP %{http_code}\n" --max-time 8 "https://${DOMAIN}/" || true
