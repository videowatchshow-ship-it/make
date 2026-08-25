#!/usr/bin/env bash
set -e
EMAIL="borensteindemarcro935@gmail.com"

echo "===== /api/lookup/:email (올바른 path 형식) ====="
curl -sS --max-time 5 "http://127.0.0.1:4000/api/lookup/${EMAIL}" | head -c 1200
echo ""
echo ""
curl -sSk --max-time 5 "https://gauth.cent-solution.online/api/lookup/${EMAIL}" | head -c 1200
echo ""
echo ""
echo "===== auto_deploy.js /api/lookup 핸들러 소스 ====="
sudo sed -n '350,420p' /opt/gauth-full/auto_deploy.js
