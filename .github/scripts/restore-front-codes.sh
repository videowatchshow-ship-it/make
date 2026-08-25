#!/usr/bin/env bash
# 프론트 index.html의 codes 배열을 서버 /codes fetch로 복원.
# 서버(server.js)는 절대 안 건드림 — 대부분 하위 서버는 이미 /codes 구현돼 있음.
# /codes 없는 서버는 catch로 '—' fallback → 안전.
set +e

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  HTML="$d/public/index.html"
  [ -f "$HTML" ] || continue
  if grep -qF "var codes = ALL.map(function(){ return '—' })" "$HTML"; then
    cp "$HTML" "$HTML.rfc.bak.$(date +%s)"
    node - "$HTML" <<'NODE'
    const fs=require('fs'); const p=process.argv[1];
    let h=fs.readFileSync(p,'utf8');
    const r="var codes = await Promise.all(ALL.map(function(a){\n"
      +"    var secret = a.twofa_secret || a.totp_secret\n"
      +"    if(!secret) return Promise.resolve('—')\n"
      +"    return fetch(noCacheQuery('/codes/'+secret),{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){return j.code||'—'}).catch(function(){return '—'})\n"
      +"  }))";
    h=h.replace("var codes = ALL.map(function(){ return '—' })", r);
    fs.writeFileSync(p,h);
    console.log("$site: codes 복원");
NODE
    chown www-data:www-data "$HTML" 2>/dev/null
  else
    echo "$site: 대상 아님 (이미 복원됐거나 다른 구조)"
  fi
done
echo DONE
