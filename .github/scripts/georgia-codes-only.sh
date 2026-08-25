#!/usr/bin/env bash
# georgia 하나만: Express 기반 확인 후 /codes 엔드포인트 추가 + 프론트 codes 복원 + georgia만 재시작
# ref: RFC 6238, RFC 4648, Node crypto.createHmac
set +e

S="/var/www/sites/georgia"
SRV="$S/server.js"
HTML="$S/public/index.html"

echo "=== georgia server.js 유형 확인 ==="
if grep -qE "require\(['\"]express['\"]\)|express\(\)" "$SRV"; then
  echo "  Express 기반 확인"
else
  echo "  !! Express 아님 — 중단"
  exit 0
fi

# 이미 /codes 있으면 skip
if grep -qE "get\(['\"]/codes/" "$SRV"; then
  echo "  이미 /codes 있음"
else
  cp "$SRV" "$SRV.gcodes.bak.$(date +%s)"
  node <<'NODE' "$SRV"
  const fs=require('fs'); const p=process.argv[1];
  let s=fs.readFileSync(p,'utf8');
  const inj="\n/* GEORGIA_CODES_V1 ref: RFC 6238 */\n"
    +"(function(){\n"
    +"  var _c=require('crypto');\n"
    +"  function _b32(x){var A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';x=(x||'').replace(/\\s+/g,'').toUpperCase().replace(/=+$/,'');var b=0,v=0,o=[];for(var i=0;i<x.length;i++){var d=A.indexOf(x[i]);if(d<0)continue;v=(v<<5)|d;b+=5;if(b>=8){o.push((v>>>(b-8))&0xff);b-=8;}}return Buffer.from(o);}\n"
    +"  function _t(sec){var k=_b32(sec);if(!k.length)return '';var ctr=Math.floor(Date.now()/1000/30);var bf=Buffer.alloc(8);bf.writeUInt32BE(ctr>>>0,4);var h=_c.createHmac('sha1',k).update(bf).digest();var of=h[h.length-1]&0xf;var bin=((h[of]&0x7f)<<24)|((h[of+1]&0xff)<<16)|((h[of+2]&0xff)<<8)|(h[of+3]&0xff);return String(bin%1000000).padStart(6,'0');}\n"
    +"  app.get('/codes/:secret',function(req,res){try{res.json({code:_t(req.params.secret),remaining:30-Math.floor(Date.now()/1000)%30});}catch(e){res.json({code:'',remaining:0});}});\n"
    +"})();\n";
  var m=s.match(/app\.listen\s*\(/);
  if(m){ s=s.slice(0,m.index)+inj+"\n"+s.slice(m.index); } else { s+=inj; }
  fs.writeFileSync(p,s);
  console.log('  /codes 주입 완료');
NODE
fi

# 프론트 codes 복원 (placeholder → 서버 fetch)
if grep -qF "var codes = ALL.map(function(){ return '—' })" "$HTML"; then
  cp "$HTML" "$HTML.gcodes.bak.$(date +%s)"
  node <<'NODE' "$HTML"
  const fs=require('fs'); const p=process.argv[1];
  let h=fs.readFileSync(p,'utf8');
  const r="var codes = await Promise.all(ALL.map(function(a){\n"
    +"    var secret = a.twofa_secret || a.totp_secret\n"
    +"    if(!secret) return Promise.resolve('—')\n"
    +"    return fetch(noCacheQuery('/codes/'+secret),{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){return j.code||'—'}).catch(function(){return '—'})\n"
    +"  }))";
  h=h.replace("var codes = ALL.map(function(){ return '—' })", r);
  fs.writeFileSync(p,h);
  console.log('  프론트 codes 복원');
NODE
  chown www-data:www-data "$HTML" 2>/dev/null
fi

# georgia만 재시작 (포트 정리)
port=$(grep -oE "PORT *\|\| *[0-9]{3,5}|PORT *= *[0-9]{3,5}" "$SRV" | grep -oE '[0-9]{3,5}' | head -1)
[ -n "$port" ] && fuser -k "${port}/tcp" >/dev/null 2>&1 && sleep 1
timeout 20 systemctl restart georgia >/dev/null 2>&1
sleep 2
echo "  georgia state: $(systemctl is-active georgia)"

echo "=== georgia /codes 테스트 ==="
curl -s --max-time 5 "http://127.0.0.1:${port:-3000}/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" | head -c 120
echo
echo "=== georgia accounts 응답 ==="
curl -s --max-time 5 "http://127.0.0.1:${port:-3000}/api/georgia/accounts" | head -c 120
echo
echo DONE
