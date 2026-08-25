#!/usr/bin/env bash
# 하위 서버에 /codes/:secret TOTP 엔드포인트 추가 (gauth와 동일, RFC 6238)
# + 프론트 renderCards의 codes를 서버 fetch로 원복 + 주입 V1~V4 제거
# ref: RFC 6238 (TOTP), RFC 4648 (Base32), Node crypto.createHmac
set +e

ENDPOINT_MARKER="CODES_ENDPOINT_V1"

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  SRV="$d/server.js"
  HTML="$d/public/index.html"
  echo "==== ${site} ===="

  # 1) server.js에 /codes 엔드포인트 주입
  if [ -f "$SRV" ]; then
    if grep -qF "$ENDPOINT_MARKER" "$SRV"; then
      echo "  server: 이미 있음"
    else
      cp "$SRV" "$SRV.codesbak.$(date +%s)"
      node <<'NODE' "$SRV"
      const fs=require('fs');
      const p=process.argv[1];
      let s=fs.readFileSync(p,'utf8');
      const inj = "\n/* CODES_ENDPOINT_V1 ref: RFC 6238 */\n"
        + "(function(){\n"
        + "  var _crypto=require('crypto');\n"
        + "  function _b32(sec){var A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';sec=(sec||'').replace(/\\s+/g,'').toUpperCase().replace(/=+$/,'');var bits=0,val=0,out=[];for(var i=0;i<sec.length;i++){var idx=A.indexOf(sec[i]);if(idx<0)continue;val=(val<<5)|idx;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&0xff);bits-=8;}}return Buffer.from(out);}\n"
        + "  function _totp(sec){var key=_b32(sec);if(!key.length)return '';var counter=Math.floor(Date.now()/1000/30);var buf=Buffer.alloc(8);buf.writeUInt32BE(counter>>>0,4);var h=_crypto.createHmac('sha1',key).update(buf).digest();var off=h[h.length-1]&0xf;var bin=((h[off]&0x7f)<<24)|((h[off+1]&0xff)<<16)|((h[off+2]&0xff)<<8)|(h[off+3]&0xff);return String(bin%1000000).padStart(6,'0');}\n"
        + "  app.get('/codes/:secret',function(req,res){try{var code=_totp(req.params.secret);var remaining=30-Math.floor(Date.now()/1000)%30;res.json({code:code,remaining:remaining});}catch(e){res.json({code:'',remaining:0});}});\n"
        + "})();\n";
      // app.listen 앞에 삽입, 없으면 파일 끝
      const m=s.match(/app\.listen\s*\(/);
      if(m){ s=s.slice(0,m.index)+inj+"\n"+s.slice(m.index); }
      else { s=s+inj; }
      fs.writeFileSync(p,s);
      console.log('  server: /codes 주입');
NODE
    fi
  fi

  # 2) index.html: V1~V4 제거 + codes 서버fetch 원복
  if [ -f "$HTML" ]; then
    cp "$HTML" "$HTML.codesbak.$(date +%s)"
    node <<'NODE' "$HTML"
    const fs=require('fs');
    const p=process.argv[1];
    let h=fs.readFileSync(p,'utf8');
    // 주입 스크립트 제거
    h=h.replace(/<script>\/\* TOTP_CLIENT_V[1234] \*\/[\s\S]*?<\/script>\s*/g,'');
    // codes 원복: placeholder → 서버 fetch Promise.all
    const restored = "var codes = await Promise.all(ALL.map(function(a){\n"
      + "    var secret = a.twofa_secret || a.totp_secret\n"
      + "    if(!secret) return Promise.resolve('—')\n"
      + "    return fetch(noCacheQuery('/codes/'+secret),{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){return j.code||'—'}).catch(function(){return '—'})\n"
      + "  }))";
    let changed=false;
    if(h.indexOf("var codes = ALL.map(function(){ return '—' })")>=0){
      h=h.replace("var codes = ALL.map(function(){ return '—' })", restored);
      changed=true;
    }
    fs.writeFileSync(p,h);
    console.log('  html: V4제거 + codes원복=' + changed);
NODE
    chown www-data:www-data "$HTML" 2>/dev/null || true
  fi

  # 3) 서비스 재시작
  systemctl restart "$site" 2>/dev/null && echo "  restart: $(systemctl is-active $site)" || echo "  restart: (unit 없음)"
done
echo DONE
