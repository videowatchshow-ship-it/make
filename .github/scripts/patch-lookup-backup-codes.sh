#!/usr/bin/env bash
# ref: https://expressjs.com/en/api.html#res.json
set -e

SRC=/opt/gauth-full/auto_deploy.js
BAK="${SRC}.bak.$(date +%s)"
cp "$SRC" "$BAK"
echo "backup: $BAK"

# 이미 backup_codes 필드 있는지 확인 (idempotent)
if grep -q "backup_codes: account.backup_codes" "$SRC"; then
  echo "이미 patched"
  exit 0
fi

# res.json 응답에 backup_codes 추가 — recovery_email 라인 뒤에 삽입
# 매칭: `        recovery_email: account.recovery_email || '',`
sed -i "/recovery_email: account.recovery_email/a\\        backup_codes: account.backup_codes || '','" "$SRC"

# syntax check
if ! node --check "$SRC" 2>&1; then
  echo "SYNTAX ERROR — rollback"
  cp "$BAK" "$SRC"
  exit 1
fi

# 재시작 (gauth 서비스)
systemctl restart gauth 2>&1 || true
sleep 2
systemctl is-active gauth && echo "gauth OK" || echo "gauth FAIL"

echo ""
echo "===== 검증 ====="
curl -sS --max-time 5 "http://127.0.0.1:4000/api/lookup/borensteindemarcro935@gmail.com" | head -c 600
echo ""
