#!/usr/bin/env bash
# ref: https://nodejs.org/api/process.html#processenv
set -e

declare -A PORTS=( [rambo]=3031 [hanrabong]=3032 [potential]=3033 )

for site in rambo hanrabong potential; do
  PORT=${PORTS[$site]}
  DEST=/var/www/sites/${site}
  SRV="${DEST}/server.js"
  echo "==== ${site} (port ${PORT}) ===="

  [ -f "$SRV" ] || { echo "  no server.js"; continue; }

  # Detect current hardcoded port in server.js
  CUR=$(grep -oE 'listen\s*\(\s*[0-9]+' "$SRV" | head -1 | grep -oE '[0-9]+' || true)
  echo "  detected port literal in server.js: ${CUR:-none}"

  if [ -n "$CUR" ] && [ "$CUR" != "$PORT" ]; then
    # Replace only inside .listen() call
    sed -i "s|listen(\s*${CUR}|listen(${PORT}|g; s|listen(\s*${CUR}\s*,|listen(${PORT},|g" "$SRV"
    echo "  → ${CUR} → ${PORT}"
  fi

  # Also replace any 'const PORT = <n>' assignment
  sed -i "s|const PORT\s*=\s*[0-9]\+|const PORT = ${PORT}|g" "$SRV" || true
  sed -i "s|let PORT\s*=\s*[0-9]\+|let PORT = ${PORT}|g" "$SRV" || true
  sed -i "s|PORT\s*=\s*process\.env\.PORT\s*||\s*[0-9]\+|PORT = process.env.PORT || ${PORT}|g" "$SRV" || true

  chown www-data:www-data "$SRV"

  # syntax check
  if ! node --check "$SRV" 2>&1; then
    echo "  ✗ syntax bad"; continue
  fi

  systemctl restart "${site}.service" 2>&1 || true
  sleep 2
  if systemctl is-active "${site}.service" >/dev/null 2>&1; then
    echo "  ✓ ${site} active"
    ss -tlnp 2>/dev/null | grep ":${PORT}" || echo "    (port ${PORT} not listening yet)"
  else
    echo "  ✗ ${site} still not active — journalctl:"
    journalctl -u "${site}.service" --no-pager -n 20 -o cat 2>&1 | tail -20
  fi
done

echo ""
echo "===== 최종 검증 ====="
for site in rambo hanrabong potential; do
  systemctl is-active "${site}.service" 2>&1 | sed "s|^|${site}: |"
  curl -sSk -o /dev/null -w "  https://${site}.cent-solution.online/ → HTTP %{http_code}\n" --max-time 5 "https://${site}.cent-solution.online/" || true
done
