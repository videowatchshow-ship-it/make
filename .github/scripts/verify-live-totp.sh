#!/usr/bin/env bash
set -e
for s in georgia poten win cham bacad simmani; do
  URL="https://$s.cent-solution.online/"
  H=$(curl -sk --max-time 10 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "${URL}?cb=$(date +%s%N)" || true)
  V2=$(printf '%s' "$H" | grep -c "TOTP_CLIENT_V2" || true)
  V1=$(printf '%s' "$H" | grep -c "TOTP_CLIENT_V1" || true)
  SZ=$(printf '%s' "$H" | wc -c)
  echo "$s size=$SZ V2=$V2 V1=$V1"
done
