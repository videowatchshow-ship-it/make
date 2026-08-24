#!/usr/bin/env bash
# ref: https://eff-certbot.readthedocs.io/en/latest/using.html#apache
# ref: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
set -e

for site in rambo hanrabong potential; do
  DOMAIN="${site}.cent-solution.online"
  CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
  echo "==== ${site} — ${DOMAIN} ===="

  if [ -d "$CERT_DIR" ] && [ -s "$CERT_DIR/fullchain.pem" ]; then
    echo "  cert already exists — checking vhost binding"
  else
    echo "  requesting cert via certbot --apache"
    # Cloudflare is orange-cloud (proxied); certbot HTTP-01 goes through CF edge.
    # We need CF proxy to forward /.well-known/acme-challenge/ to origin. That works
    # when the origin has any working HTTP:80 vhost. Certbot --apache handles cert
    # install into the Apache config too.
    if ! certbot --apache --non-interactive --agree-tos \
        --email admin@cent-solution.online \
        --domains "$DOMAIN" 2>&1 | tail -30; then
      echo "  ✗ certbot failed for ${DOMAIN}"
      continue
    fi
  fi

  # Ensure vhost 443 uses the correct per-site cert (certbot --apache usually does this,
  # but our manual vhost overwrote the file).
  CONF=/etc/apache2/sites-available/${site}.conf
  if [ -f "$CONF" ]; then
    sed -i "s|SSLCertificateFile .*|SSLCertificateFile ${CERT_DIR}/fullchain.pem|" "$CONF"
    sed -i "s|SSLCertificateKeyFile .*|SSLCertificateKeyFile ${CERT_DIR}/privkey.pem|" "$CONF"
  fi
done

apache2ctl configtest 2>&1 && systemctl reload apache2 || echo "::warning::apache invalid"

echo ""
echo "===== 최종 검증 ====="
for site in rambo hanrabong potential; do
  curl -sSk -o /dev/null -w "$site → HTTP %{http_code}\n" --max-time 8 "https://${site}.cent-solution.online/" || true
done
