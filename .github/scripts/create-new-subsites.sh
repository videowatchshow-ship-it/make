#!/usr/bin/env bash
# ref: https://httpd.apache.org/docs/2.4/vhosts/examples.html
# ref: https://www.freedesktop.org/software/systemd/man/systemd.unit.html
set -e

TEMPLATE=/var/www/sites/bacad

# Auto-detect a working letsencrypt cert already in use by another vhost
REF=$(grep -rl "SSLCertificateFile" /etc/apache2/sites-enabled/ 2>/dev/null | while read f; do
  grep -q "cent-solution.online" "$f" && { echo "$f"; break; }
done | head -1)
CERT=$(grep -E "^\s*SSLCertificateFile\s+" "$REF" 2>/dev/null | awk '{print $2}' | head -1)
KEY=$(grep -E "^\s*SSLCertificateKeyFile\s+" "$REF" 2>/dev/null | awk '{print $2}' | head -1)
if [ -z "$CERT" ] || [ -z "$KEY" ]; then echo "ERR: no working SSL cert found"; exit 1; fi
echo "CERT=$CERT"
echo "KEY=$KEY"

make_site() {
  local site="$1" kname="$2" port="$3"
  local dest="/var/www/sites/${site}"
  echo "==== ${site} (${kname}) port=${port} ===="

  if [ ! -d "$dest" ]; then
    mkdir -p "${dest}/public"
    cp "${TEMPLATE}/server.js" "${dest}/server.js"
    cp -r "${TEMPLATE}/public/." "${dest}/public/"
    printf '{"accounts":[]}\n' > "${dest}/accounts.json"

    # slug + port substitution
    sed -i "s|/api/bacad/|/api/${site}/|g" "${dest}/server.js" || true
    sed -i "s|바캐드|${kname}|g" "${dest}/public/index.html" || true
    sed -i "s|bacad|${site}|g" "${dest}/public/index.html" || true

    chown -R www-data:www-data "$dest"
  else
    echo "  이미 존재 — 코드는 유지"
  fi

  # systemd unit — separate here-doc, unindented delim
  cat > "/etc/systemd/system/${site}.service" <<UNIT
[Unit]
Description=${kname} (${site}) subsite Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${dest}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=${port}
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
UNIT

  # Apache vhost — separate here-doc
  cat > "/etc/apache2/sites-available/${site}.conf" <<APACHE
<VirtualHost *:80>
  ServerName ${site}.cent-solution.online
  Redirect permanent / https://${site}.cent-solution.online/
</VirtualHost>
<VirtualHost *:443>
  ServerName ${site}.cent-solution.online
  DocumentRoot ${dest}/public
  <Directory ${dest}/public>
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
  </Directory>
  ProxyPass /api/ http://127.0.0.1:${port}/api/
  ProxyPassReverse /api/ http://127.0.0.1:${port}/api/
  SSLEngine on
  SSLCertificateFile ${CERT}
  SSLCertificateKeyFile ${KEY}
</VirtualHost>
APACHE

  a2ensite "${site}.conf" 2>&1 || true
  systemctl daemon-reload
  systemctl enable "${site}.service" 2>&1 || true
  systemctl restart "${site}.service" 2>&1 || true
}

make_site rambo      "람보"    3031
make_site hanrabong  "한라봉"  3032
make_site potential  "포텐샬"  3033

a2enmod ssl proxy proxy_http rewrite headers 2>&1 || true
apache2ctl configtest 2>&1 && systemctl reload apache2 || echo "::warning::apache config invalid"

echo ""
echo "===== 결과 ====="
for site in rambo hanrabong potential; do
  echo "-- ${site} --"
  systemctl is-active "${site}.service" || true
  sleep 1
  curl -sSk -o /dev/null -w "  https://${site}.cent-solution.online/ → HTTP %{http_code}\n" --max-time 5 "https://${site}.cent-solution.online/" || true
done
echo "===== done ====="
