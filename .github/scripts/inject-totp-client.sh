#!/usr/bin/env bash
# ref: RFC 6238 (TOTP), RFC 4648 (Base32), MDN SubtleCrypto
# V4: MutationObserver 제거 — 렌더링과 절대 충돌하지 않는 안전한 폴링만 사용
set -e

cat > /tmp/totp-client-injection.html <<'INJECT_END'
<script>/* TOTP_CLIENT_V4 */
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
  function findSecret(card){
    try{
      var w=document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
      var n;
      while((n=w.nextNode())){
        var v=(n.nodeValue||"").replace(/\s+/g,"").toUpperCase().replace(/[^A-Z2-7]/g,"");
        if(v.length>=16 && v.length<=64 && /^[A-Z2-7]+$/.test(v)) return v;
      }
    }catch(e){}
    return "";
  }
  var running=false;
  async function tick(){
    if(running) return;
    running=true;
    try{
      var slots=document.querySelectorAll('.totp-code, [id^="tdcode-"]');
      for(var i=0;i<slots.length;i++){
        try{
          var slot=slots[i];
          var card=slot.closest('li,tr,.card,.account-card,.row,.acct,.account,.item') || slot.parentElement;
          if(!card) continue;
          var secret=findSecret(card);
          if(!secret) continue;
          var code=await totp(secret);
          if(!code) continue;
          var t=slot.querySelector('span[id^="tdcode-"]') || slot;
          if(t.children.length===0 && t.textContent.trim()!==code) t.textContent=code;
        }catch(e){}
      }
    }catch(e){}
    running=false;
  }
  function start(){ setTimeout(tick, 500); setInterval(tick, 1000); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
</script>
INJECT_END

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
    var before=html.length;
    html=html.replace(/<script>\/\* TOTP_CLIENT_V[1234] \*\/[\s\S]*?<\/script>\s*/g,'');
    console.log('  removed old: ' + (before-html.length) + ' chars');
    if(html.indexOf('</body>')>=0){ html=html.replace('</body>', inj+'</body>'); }
    else { html=html+inj; }
    fs.writeFileSync('$HTML', html);
    console.log('  V4 injected');
  "
  chown www-data:www-data "$HTML" 2>/dev/null || true
done

rm -f /tmp/totp-client-injection.html
echo "DONE"
