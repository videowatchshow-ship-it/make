#!/usr/bin/env bash
# 모든 서브사이트 server.js에 TOTP code를 accounts 응답에 자동 삽입.
# ref: RFC 6238 (HMAC-SHA1 based Time-based OTP)
set -e

SITES="aura bacad camstouch cent-tools cha cham gain georgia hanrabong james misskim poten rambo romi simmani sunbi win woodong woodong2"

# TOTP helper 함수를 별도 파일로 저장 (idempotent 삽입)
TOTP_HELPER='/* __TOTP_HELPER_V1__ */
const __crypto = require("crypto");
function __base32decode(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(input || "").replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const idx = chars.indexOf(c);
    if (idx < 0) return Buffer.alloc(0);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function __generateTOTP(secret, step, digits) {
  step = step || 30; digits = digits || 6;
  const key = __base32decode(secret);
  if (!key.length) return "";
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const h = __crypto.createHmac("sha1", key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off+1] & 0xff) << 16) | ((h[off+2] & 0xff) << 8) | (h[off+3] & 0xff);
  return String(bin % Math.pow(10, digits)).padStart(digits, "0");
}
/* __TOTP_HELPER_END__ */'

for site in $SITES; do
  SRV="/var/www/sites/${site}/server.js"
  ACCT="/var/www/sites/${site}/accounts.json"
  [ -f "$SRV" ] || { echo "  [${site}] server.js 없음 — skip"; continue; }
  [ -f "$ACCT" ] || { echo "  [${site}] accounts.json 없음 — skip"; continue; }
  echo "==== ${site} ===="

  # 이미 patch 되었으면 skip
  if grep -q "__TOTP_HELPER_V1__" "$SRV" 2>/dev/null; then
    echo "  이미 patched"
    continue
  fi

  # backup
  cp "$SRV" "$SRV.totp.bak.$(date +%s)"

  # 1) helper 함수를 파일 상단에 prepend
  {
    echo "$TOTP_HELPER"
    echo ""
    cat "$SRV"
  } > "$SRV.new"
  mv "$SRV.new" "$SRV"

  # 2) accounts endpoint의 응답에 totp_code 자동 삽입:
  # http.createServer 스타일: JSON.stringify({ accounts: ... }) 또는 res.end(JSON.stringify(data))
  # Express 스타일: res.json({ accounts: ... })
  # Node로 파일 로드 후 accounts.json을 읽어 응답 직전 map 하는 최소 침습 방법:
  # 단순화: accounts.json 읽는 부분을 찾아 map 로직으로 감싸는 것보다,
  # 응답 라인을 정규식으로 찾아 wrap한다.
  node -e "
    var fs=require('fs');
    var p='$SRV';
    var s=fs.readFileSync(p,'utf8');
    // 패턴 1: JSON.parse(fs.readFileSync(...)) 결과를 배열/객체로 반환
    // 패턴 2: (data.accounts || data)  → wrap 함수 호출
    var wrapFn = '(function(_arr){return _arr.map(function(_a){return Object.assign({},_a,{totp_code: _a.totp_secret ? __generateTOTP(_a.totp_secret) : \"\"});});})';
    // (a) 'accounts: JSON.parse(...)' 형태
    var before=s;
    s = s.replace(
      /accounts\s*:\s*(JSON\.parse\([^)]+\)(?:\.accounts)?)/g,
      'accounts: ' + wrapFn + '(' + '\$1' + ' || [])'
    );
    // (b) res.end(JSON.stringify(data)) — 광범위, 안전 위해 skip
    // (c) res.json(accounts) 형태 (Express)
    s = s.replace(
      /res\.json\s*\(\s*(?:\{\s*accounts\s*:\s*)?(arr|accounts|data|list)\s*(?:\})?\s*\)/g,
      function(m,g){ return 'res.json({accounts: ' + wrapFn + '(Array.isArray(' + g + ') ? ' + g + ' : (' + g + '.accounts||' + g + '))})'; }
    );
    if (s === before) {
      console.log('  ! 응답 패턴 미확인 — 헬퍼만 주입 (수동 확인 필요)');
    } else {
      fs.writeFileSync(p, s);
      console.log('  ✓ accounts 응답에 totp_code wrap 적용');
    }
  "

  # syntax check
  if ! node --check "$SRV" 2>&1 | head -5; then
    echo "  ✗ SYNTAX ERR — rollback"
    ls -t "$SRV.totp.bak."* | head -1 | xargs -I{} cp {} "$SRV"
    continue
  fi
  chown www-data:www-data "$SRV" 2>/dev/null || true

  # restart
  for svc in "$site" "site-$site" "$site-site"; do
    if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
      systemctl restart "$svc" 2>&1 || true
      sleep 1
      if systemctl is-active "$svc" >/dev/null 2>&1; then
        echo "  ✓ $svc active"
      else
        echo "  ✗ $svc 크래시 — rollback"
        ls -t "$SRV.totp.bak."* | head -1 | xargs -I{} cp {} "$SRV"
        systemctl restart "$svc" 2>&1 || true
      fi
      break
    fi
  done
done

echo ""
echo "===== 검증 georgia ====="
curl -sSk --max-time 5 "https://georgia.cent-solution.online/api/georgia/accounts" | head -c 800
echo ""
