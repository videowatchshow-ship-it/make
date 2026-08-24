#!/usr/bin/env bash
# ref: https://httpd.apache.org/docs/2.4/mod/mod_alias.html#redirect
set -e

# Auto-detect a working letsencrypt cert
REF=$(grep -rl "SSLCertificateFile" /etc/apache2/sites-enabled/ 2>/dev/null | while read f; do
  grep -q "cent-solution.online" "$f" && { echo "$f"; break; }
done | head -1)
CERT=$(grep -E "^\s*SSLCertificateFile\s+" "$REF" 2>/dev/null | awk '{print $2}' | head -1)
KEY=$(grep -E "^\s*SSLCertificateKeyFile\s+" "$REF" 2>/dev/null | awk '{print $2}' | head -1)
if [ -z "$CERT" ] || [ -z "$KEY" ]; then echo "ERR: no working SSL cert"; exit 1; fi
echo "CERT=$CERT"
echo "KEY=$KEY"

cat > /etc/apache2/sites-available/camstouch-le-ssl.conf <<APACHE
<VirtualHost *:443>
  ServerName camstouch.cent-solution.online
  Redirect permanent / https://bacad.cent-solution.online/
  SSLEngine on
  SSLCertificateFile ${CERT}
  SSLCertificateKeyFile ${KEY}
</VirtualHost>
APACHE

cat > /etc/apache2/sites-available/camstouch.conf <<APACHE
<VirtualHost *:80>
  ServerName camstouch.cent-solution.online
  Redirect permanent / https://bacad.cent-solution.online/
</VirtualHost>
APACHE

a2ensite camstouch-le-ssl 2>&1 || true
a2ensite camstouch 2>&1 || true
apache2ctl configtest 2>&1 && systemctl reload apache2 || echo "::warning::apache config invalid"

echo ""
echo "===== 검증 ====="
curl -sSk -o /dev/null -w "camstouch → HTTP %{http_code}  redirect=%{redirect_url}\n" --max-time 5 https://camstouch.cent-solution.online/ || true
