#!/usr/bin/env bash
set -e
for s in win poten cham georgia; do
  F="/var/www/sites/$s/public/index.html"
  [ -f "$F" ] || continue
  echo "===== $s (size=$(wc -c <"$F")) ====="
  # Show sections that render account cards / 2FA label
  grep -n -E "2FA|TOTP|totp|backup|account|계정|코드" "$F" | head -80
  echo "--- last 200 lines ---"
  tail -n 200 "$F"
  echo
done
