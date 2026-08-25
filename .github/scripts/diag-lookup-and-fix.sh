#!/usr/bin/env bash
set -e
EMAIL="borensteindemarcro935@gmail.com"

echo "===== 1) /api/lookup?email= 실제 응답 확인 (127.0.0.1:4000) ====="
curl -sS --max-time 5 "http://127.0.0.1:4000/api/lookup?email=${EMAIL}" | head -c 800
echo ""

echo ""
echo "===== 2) 프론트를 통해 (https) ====="
curl -sSk --max-time 5 "https://gauth.cent-solution.online/api/lookup?email=${EMAIL}" | head -c 800
echo ""

echo ""
echo "===== 3) rebrowser-login.js 위치/lookup 핸들러 ====="
sudo grep -rn "api/lookup" /opt/gauth-full/*.js 2>/dev/null | head -5
sudo grep -n "backup_codes\|backupCodes" /opt/gauth-full/rebrowser-login.js 2>/dev/null | head -10 || true

echo ""
echo "===== 4) accounts_normalized 내 backup_codes 유무 확인 ====="
sudo node -e "
  var d=JSON.parse(require('fs').readFileSync('/opt/gauth-full/accounts_normalized.json','utf8'));
  var a=Array.isArray(d)?d:(d.accounts||[]);
  var f=a.find(x=>(x.email||'').toLowerCase()==='${EMAIL}');
  if(!f){console.log('NOT FOUND'); return;}
  console.log(JSON.stringify({
    email:f.email,
    password:f.password,
    totp_secret:f.totp_secret,
    backup_codes:f.backup_codes,
    recovery_email:f.recovery_email
  }));
"
