#!/usr/bin/env bash
# 백업코드처럼 보이는 8×4자는 사실 Google TOTP shared secret을 4자 그룹으로 표시한 것.
# 공백 제거 + 대문자화 → 표준 Base32 (RFC 4648) TOTP secret이 됨.
# ref: https://datatracker.ietf.org/doc/html/rfc6238  (TOTP)
# ref: https://datatracker.ietf.org/doc/html/rfc4648  (Base32)
set -e
ACCT=/opt/gauth-full/accounts_normalized.json
GEO=/var/www/sites/georgia/accounts.json
TS=$(date +%s)

for f in "$ACCT" "$GEO"; do
  [ -f "$f" ] && cp "$f" "$f.bak.$TS"
done

node > /tmp/normrun.js <<'ENDNODE'
const fs = require('fs');
// 4자 그룹 8~16개 (RFC 4648 Base32 알파벳)
const RE_GROUPS = /^(?:[A-Za-z2-7]{4}\s+){7,15}[A-Za-z2-7]{4}$/;
const RE_BASE32 = /^[A-Z2-7]{16,64}$/;
const norm = s => String(s || '').replace(/\s+/g, '').toUpperCase();

function patch(p, label) {
  if (!fs.existsSync(p)) return;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const arr = Array.isArray(d) ? d : (d.accounts || []);
  let promoted = 0, normalized = 0;
  for (const a of arr) {
    // (a) totp_secret이 이미 있으나 공백/소문자 포함 → 정규화
    if (a.totp_secret) {
      const n = norm(a.totp_secret);
      if (RE_BASE32.test(n) && n !== a.totp_secret) {
        a.totp_secret = n;
        normalized++;
      }
      continue;
    }
    // (b) totp_secret이 비었고 backup_codes가 4x8 형식 → 승격
    const bc = a.backup_codes;
    if (!bc || !RE_GROUPS.test(String(bc).trim())) continue;
    const n = norm(bc);
    if (!RE_BASE32.test(n)) continue;
    a.totp_secret = n;
    promoted++;
  }
  const tmp = p + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d) ? arr : { accounts: arr }, null, 2));
  fs.renameSync(tmp, p);
  console.log(label + ': promoted=' + promoted + ' normalized=' + normalized + ' total=' + arr.length);
}

patch(process.env.ACCT, 'normalized-DB');
['aura','bacad','camstouch','cent-tools','cha','cham','gain','georgia','hanrabong','james','misskim','poten','rambo','romi','simmani','sunbi','win','woodong','woodong2'].forEach(site => {
  patch('/var/www/sites/' + site + '/accounts.json', site);
});
ENDNODE

ACCT="$ACCT" node /tmp/normrun.js
rm -f /tmp/normrun.js

systemctl restart gauth 2>&1 || true
sleep 3

echo "-- lookup + /codes/:secret 검증 --"
for em in psond17fd@gmail.com maitdde628@gmail.com; do
  echo ">>> $em"
  RESP=$(curl -sSk --max-time 5 "http://127.0.0.1:4000/api/lookup/$em")
  echo "$RESP" | head -c 500
  echo ""
  SEC=$(node -e "console.log(JSON.parse(process.argv[1]).totp_secret)" "$RESP" 2>/dev/null)
  echo "  secret=$SEC"
  echo "  /codes/$SEC:"
  curl -sSk --max-time 5 "http://127.0.0.1:4000/codes/$SEC" | head -c 300
  echo ""
done
