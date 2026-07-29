#!/bin/bash
# gauth 서버 배포 스크립트
# 사용법: bash gauth/deploy.sh
# 서버(gucci-yanolza)에서 직접 실행하거나, gcloud compute ssh로 실행

set -e

REMOTE_DIR="/opt/gauth-full"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== gauth 배포 시작 ==="

# 1. upload_excels.js 복사
echo "[1/3] upload_excels.js 배포..."
cp "$SCRIPT_DIR/upload_excels.js" "$REMOTE_DIR/upload_excels.js"
echo "  → $REMOTE_DIR/upload_excels.js 업데이트 완료"

# 2. index.html 복사
echo "[2/3] index.html 배포..."
cp "$SCRIPT_DIR/index.html" /var/www/sites/gauth/public/index.html
echo "  → /var/www/sites/gauth/public/index.html 업데이트 완료"

# 3. 서비스 재시작
echo "[3/3] gauth 서비스 재시작..."
sudo systemctl restart gauth
sleep 2
sudo systemctl status gauth --no-pager | head -5

echo ""
echo "=== 배포 완료 ==="
echo "엑셀 재업로드 하면 새 파서로 처리됩니다."
