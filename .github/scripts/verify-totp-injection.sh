#!/usr/bin/env bash
set -e
for s in georgia win cham poten; do
  F="/var/www/sites/$s/public/index.html"
  echo "==== $s ===="
  if [ ! -f "$F" ]; then echo "  MISSING"; continue; fi
  echo "  size=$(wc -c <"$F")"
  grep -c "TOTP_CLIENT_V2" "$F" | sed 's/^/  V2 count=/'
  grep -c "TOTP_CLIENT_V1" "$F" | sed 's/^/  V1 count=/'
  echo "  tail head:"
  tail -c 3000 "$F" | head -c 2500
  echo
done
