#!/usr/bin/env bash
# ref: RFC 6238, MDN SubtleCrypto (HMAC-SHA1)
set -e

cat > /tmp/totp-client-injection.html <<'INJECT_END'
<script>/* TOTP_CLIENT_V2 */
(function(){
  function b32d(s){
    var chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var c=(s||"").replace(/\s+/g,"").toUpperCase().replace(/=+$/,"");
    var bits=0, val=0, out=[];
    for(var i=0;i<c.length;i++){
      var idx=chars.indexOf(c[i]); if(idx<0) return null;
      val=(val<<5)|idx; bits+=5;
      if(bits>=8){ out.push((val>>>(bits-8))&0xff); bits-=8; }
    }
    return new Uint8Array(out);
  }
  async function totp(secret){
    try{
      var key=b32d(secret); if(!key||!key.length) return "";
      var counter=Math.floor(Date.now()/1000/30);
      var buf=new Uint8Array(8);
      new DataView(buf.buffer).setUint32(4, counter>>>0);
      var ck=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-1"},false,["sign"]);
      var sig=new Uint8Array(await crypto.subtle.sign("HMAC",ck,buf));
      var off=sig[sig.length-1]&0xf;
      var bin=((sig[off]&0x7f)<<24)|((sig[off+1]&0xff)<<16)|((sig[off+2]&0xff)<<8)|(sig[off+3]&0xff);
      return String(bin%1000000).padStart(6,"0");
    }catch(e){ return ""; }
  }
  async function tick(){
    var spans=document.querySelectorAll('span[id^="tdcode-"]');
    for(var i=0;i<spans.length;i++){
      var s=spans[i];
      var idx=s.id.substring(7);
      var secEl=document.getElementById('sec-'+idx);
      if(!secEl) continue;
      var raw=(secEl.textContent||"").replace(/\s+/g,"").toUpperCase().replace(/[^A-Z2-7]/g,"");
      if(!/^[A-Z2-7]{16,64}$/.test(raw)) continue;
      var code=await totp(raw);
      if(code) s.textContent=code;
    }
  }
  function start(){
    tick();
    setInterval(tick, 3000);
    var list=document.getElementById('account-list');
    if(list && window.MutationObserver){
      var mo=new MutationObserver(function(){ tick(); });
      mo.observe(list,{childList:true, subtree:true});
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
</script>
INJECT_END

MARKER_OLD="TOTP_CLIENT_V1"
MARKER_NEW="TOTP_CLIENT_V2"

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  HTML="$d/public/index.html"
  [ -f "$HTML" ] || continue
  echo "==== ${site} ===="
  cp "$HTML" "$HTML.totpc.bak.$(date +%s)"
  node -e "
    var fs=require('fs');
    var html=fs.readFileSync('$HTML','utf8');
    var inj=fs.readFileSync('/tmp/totp-client-injection.html','utf8');
    // Remove any prior V1 or V2 block
    html=html.replace(/<script>\/\* TOTP_CLIENT_V[12] \*\/[\s\S]*?<\/script>\s*/g,'');
    if(html.indexOf('</body>')>=0){
      html=html.replace('</body>', inj+'</body>');
    } else {
      html=html+inj;
    }
    fs.writeFileSync('$HTML', html);
    console.log('  ✓ injected V2');
  "
  chown www-data:www-data "$HTML" 2>/dev/null || true
done

rm -f /tmp/totp-client-injection.html
