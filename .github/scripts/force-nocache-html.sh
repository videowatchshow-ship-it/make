#!/usr/bin/env bash
set -e

CONF=/etc/apache2/conf-available/nocache-html.conf
cat > "$CONF" <<'EOF'
<FilesMatch "\.(html|htm)$">
  Header always set Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
  Header always set Pragma "no-cache"
  Header always set Expires "0"
</FilesMatch>
EOF

a2enmod headers >/dev/null 2>&1 || true
a2enconf nocache-html >/dev/null 2>&1 || true
apachectl configtest && systemctl reload apache2
echo "reloaded"
