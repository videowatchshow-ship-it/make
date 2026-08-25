#!/usr/bin/env bash
# 프론트 index.html의 codes 배열(placeholder)을 서버 /codes fetch로 복원.
# '—' 문자 인코딩 불일치 회피: 정규식으로 codes=ALL.map(...) 블록을 매칭.
# 서버는 안 건드림. node는 반드시 'node - FILE <<EOF' 형태(파일 실행 방지).
set +e

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  HTML="$d/public/index.html"
  [ -f "$HTML" ] || continue
  cp "$HTML" "$HTML.rfc2.bak.$(date +%s)"
  node - "$HTML" "$site" <<'NODE'
  const fs=require('fs');
  const p=process.argv[1], site=process.argv[2];
  let h=fs.readFileSync(p,'utf8');
  // placeholder codes 배열을 서버 fetch Promise.all로 교체 ('—' 문자 무관)
  const re=/var codes = ALL\.map\(function\(\)\{[\s\S]*?\}\)/;
  if(!re.test(h)){ console.log(site+': 대상 패턴 없음'); process.exit(0); }
  const restored="var codes = await Promise.all(ALL.map(function(a){\n"
    +"    var secret = a.twofa_secret || a.totp_secret\n"
    +"    if(!secret) return Promise.resolve('\\u2014')\n"
    +"    return fetch(noCacheQuery('/codes/'+secret),{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){return j.code||'\\u2014'}).catch(function(){return '\\u2014'})\n"
    +"  }))";
  h=h.replace(re, restored);
  fs.writeFileSync(p,h);
  console.log(site+': codes 복원 완료');
NODE
  chown www-data:www-data "$HTML" 2>/dev/null
done
echo DONE
