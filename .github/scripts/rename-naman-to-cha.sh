#!/usr/bin/env bash
# ref: https://httpd.apache.org/docs/2.4/vhosts/name-based.html
set -e

OLD=naman
NEW=cha
KNAME="차대리"
DOMAIN="${NEW}.cent-solution.online"
OLD_DIR=/var/www/sites/${OLD}
NEW_DIR=/var/www/sites/${NEW}

echo "==== ${OLD} → ${NEW} (${KNAME}) ===="

if [ ! -d "$OLD_DIR" ]; then echo "  ${OLD_DIR} 없음 — abort"; exit 0; fi
if [ -d "$NEW_DIR" ]; then echo "  ${NEW_DIR} 이미 존재 — abort (idempotent)"; exit 0; fi

# 1) 원래 포트 감지
OLD_PORT=$(grep -oE 'listen\s*\(\s*[0-9]+' "${OLD_DIR}/server.js" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
[ -z "$OLD_PORT" ] && OLD_PORT=3035
echo "  detected port: ${OLD_PORT}"

# 2) 서비스 정지
for svc in "$OLD" "site-${OLD}" "${OLD}-site"; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
    systemctl stop "$svc" 2>&1 || true
    systemctl disable "$svc" 2>&1 || true
    rm -f "/etc/systemd/system/${svc}.service"
    echo "  stopped: $svc"
    break
  fi
done

# 3) 디렉토리 이동
mv "$OLD_DIR" "$NEW_DIR"

# 4) 슬러그 치환 (server.js / index.html)
sed -i "s|/api/${OLD}/|/api/${NEW}/|g" "${NEW_DIR}/server.js" 2>/dev/null || true
sed -i "s|\"${OLD}\"|\"${NEW}\"|g" "${NEW_DIR}/server.js" 2>/dev/null || true
sed -i "s|'${OLD}'|'${NEW}'|g" "${NEW_DIR}/server.js" 2>/dev/null || true
if [ -f "${NEW_DIR}/public/index.html" ]; then
  sed -i "s|${OLD}|${NEW}|g" "${NEW_DIR}/public/index.html" 2>/dev/null || true
  sed -i "s|나만|${KNAME}|g" "${NEW_DIR}/public/index.html" 2>/dev/null || true
fi

# 5) accounts.json site 필드 갱신
if [ -f "${NEW_DIR}/accounts.json" ]; then
  node -e "
    var fs=require('fs');
    var p='${NEW_DIR}/accounts.json';
    try{
      var d=JSON.parse(fs.readFileSync(p,'utf8'));
      var a=Array.isArray(d)?d:(d.accounts||[]);
      a.forEach(function(x){ if(x.site==='${OLD}') x.site='${NEW}'; });
      fs.writeFileSync(p, JSON.stringify(Array.isArray(d)?a:{accounts:a},null,2));
      console.log('  accounts.json site 필드 갱신: ' + a.length + '개');
    }catch(e){ console.log('  accounts.json 스킵: ' + e.message); }
  "
fi
chown -R www-data:www-data "$NEW_DIR"

# 6) certbot
if [ ! -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  certbot certonly --apache --non-interactive --agree-tos \
    --email admin@cent-solution.online \
    --domains "$DOMAIN" 2>&1 | tail -8 || echo "  cert 발급 실패"
fi
CERT=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
KEY=/etc/letsencrypt/live/${DOMAIN}/privkey.pem

# 7) 새 systemd unit
cat > "/etc/systemd/system/${NEW}.service" <<UNIT
[Unit]
Description=${KNAME} (${NEW}) subsite Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${NEW_DIR}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=${OLD_PORT}
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
UNIT

# 8) Apache vhost
cat > "/etc/apache2/sites-available/${NEW}.conf" <<APACHE
<VirtualHost *:80>
  ServerName ${DOMAIN}
  Redirect permanent / https://${DOMAIN}/
</VirtualHost>
<VirtualHost *:443>
  ServerName ${DOMAIN}
  DocumentRoot ${NEW_DIR}/public
  <Directory ${NEW_DIR}/public>
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
  </Directory>
  ProxyPass /api/ http://127.0.0.1:${OLD_PORT}/api/
  ProxyPassReverse /api/ http://127.0.0.1:${OLD_PORT}/api/
  SSLEngine on
  SSLCertificateFile ${CERT}
  SSLCertificateKeyFile ${KEY}
</VirtualHost>
APACHE
a2ensite "${NEW}.conf" 2>&1 || true

# 9) 예전 vhost 정리
for oldconf in "${OLD}.conf" "${OLD}-le-ssl.conf"; do
  if [ -f "/etc/apache2/sites-available/${oldconf}" ]; then
    a2dissite "${oldconf%.conf}" 2>&1 || true
    rm -f "/etc/apache2/sites-available/${oldconf}"
  fi
done

systemctl daemon-reload
systemctl enable "${NEW}.service" 2>&1 || true
systemctl restart "${NEW}.service" 2>&1 || true

apache2ctl configtest 2>&1 && systemctl reload apache2 || echo "::warning::apache invalid"

echo ""
echo "===== 검증 ====="
systemctl is-active "${NEW}.service" 2>&1 | sed "s|^|${NEW}: |"
curl -sSk -o /dev/null -w "  https://${DOMAIN}/ → HTTP %{http_code}\n" --max-time 8 "https://${DOMAIN}/" || true
