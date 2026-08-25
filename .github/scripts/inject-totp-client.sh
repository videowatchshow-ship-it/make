#!/usr/bin/env bash
# ref: RFC 6238, MDN SubtleCrypto (HMAC-SHA1)
set -e

cat > /tmp/totp-client-injection.html <<'INJECT_END'
<script>/* TOTP_CLIENT_V3 */
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
  // Find the Base32 secret string anywhere inside a card container
  function extractSecret(card){
    var walker=document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
    var node;
    while((node=walker.nextNode())){
      var v=(node.nodeValue||"").replace(/\s+/g,"").toUpperCase().replace(/[^A-Z2-7]/g,"");
      if(/^[A-Z2-7]{16,64}$/.test(v)) return v;
    }
    return "";
  }
  async function tick(){
    // Every element that carries the TOTP code display slot
    var slots=document.querySelectorAll('.totp-code, [id^="tdcode-"], [class*="totp-code"]');
    for(var i=0;i<slots.length;i++){
      var slot=slots[i];
      // walk up to a plausible card container
      var card=slot.closest('li,tr,.card,.account-card,.row,.acct,.account,.item,[data-email],[data-account]') || slot.parentElement && slot.parentElement.parentElement || slot.parentElement;
      if(!card) continue;
      var secret=extractSecret(card);
      if(!secret) continue;
      var code=await totp(secret);
      if(!code) continue;
      // Prefer inner span if present
      var target = slot.querySelector('span[id^="tdcode-"]') || slot;
      // If slot is a span/div, replace text; keep only text
      if(target.children && target.children.length===0){
        target.textContent = code;
      } else {
        // find first text node and set
        var tn=null;
        for(var j=0;j<target.childNodes.length;j++){
          if(target.childNodes[j].nodeType===3){ tn=target.childNodes[j]; break; }
        }
        if(tn) tn.nodeValue = code;
        else target.textContent = code;
      }
    }
  }
  function start(){
    tick();
    setInterval(tick, 3000);
    try{
      var mo=new MutationObserver(function(){ tick(); });
      mo.observe(document.body,{childList:true, subtree:true, characterData:true});
    }catch(e){}
  }
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
    html=html.replace(/<script>\/\* TOTP_CLIENT_V[123] \*\/[\s\S]*?<\/script>\s*/g,'');
    if(html.indexOf('</body>')>=0){
      html=html.replace('</body>', inj+'</body>');
    } else {
      html=html+inj;
    }
    fs.writeFileSync('$HTML', html);
    console.log('  ✓ V3 injected');
  "
  chown www-data:www-data "$HTML" 2>/dev/null || true
done

rm -f /tmp/totp-client-injection.html
