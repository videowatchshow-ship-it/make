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

# node로 정확한 텍스트 삽입 (sed는 인용부호 이스케이프 위험)
node -e "
var fs=require('fs');
var p='$SRC';
var src=fs.readFileSync(p,'utf8');
var needle=\"recovery_email: account.recovery_email || '',\";
var insert=\"\\n        backup_codes: account.backup_codes || '',\";
var i=src.indexOf(needle);
if(i<0){console.log('needle not found — abort'); process.exit(2);}
var out=src.slice(0,i+needle.length) + insert + src.slice(i+needle.length);
var tmp=p+'.tmp.'+process.pid;
fs.writeFileSync(tmp,out);
fs.renameSync(tmp,p);
console.log('inserted after position',i);
"

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
