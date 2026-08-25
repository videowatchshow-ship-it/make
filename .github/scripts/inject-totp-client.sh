#!/usr/bin/env bash
# ref: RFC 6238, MDN SubtleCrypto (HMAC-SHA1)
set -e

# JS 파일을 먼저 서버 임시 위치에 저장 (heredoc으로 안전하게)
cat > /tmp/totp-client-injection.html <<'INJECT_END'
<script>/* TOTP_CLIENT_V1 */
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
    var key=b32d(secret); if(!key||!key.length) return "";
    var counter=Math.floor(Date.now()/1000/30);
    var buf=new Uint8Array(8);
    new DataView(buf.buffer).setUint32(4, counter>>>0);
    try{
      var ck=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-1"},false,["sign"]);
      var sig=new Uint8Array(await crypto.subtle.sign("HMAC",ck,buf));
      var off=sig[sig.length-1]&0xf;
      var bin=((sig[off]&0x7f)<<24)|((sig[off+1]&0xff)<<16)|((sig[off+2]&0xff)<<8)|(sig[off+3]&0xff);
      return String(bin%1000000).padStart(6,"0");
    }catch(e){ return ""; }
  }
  function findSecrets(){
    var out=[];
    var all=document.body.querySelectorAll("*");
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.children.length>0) continue;
      var t=(el.textContent||"").trim();
      if(/^[A-Z2-7]{16,64}$/.test(t)){ out.push({el:el, secret:t}); }
    }
    return out;
  }
  function findCodeSlot(fromEl){
    var card=fromEl.closest("li,.account-card,.row,.card,.account,.acct,.item,[data-email],[data-account]") || fromEl.parentElement;
    if(!card) return null;
    var walker=document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
    var foundLabel=false, node;
    while((node=walker.nextNode())){
      var v=(node.nodeValue||"").trim();
      if(!foundLabel){
        if(v==="2FA 코드" || v.indexOf("2FA 코드")===0) foundLabel=true;
      } else {
        if(v==="—" || v==="-" || /^\d{6}$/.test(v)) return node;
      }
    }
    return null;
  }
  async function refreshAll(){
    var items=findSecrets();
    for(var i=0;i<items.length;i++){
      var code=await totp(items[i].secret);
      if(!code) continue;
      var slot=findCodeSlot(items[i].el);
      if(slot){ slot.nodeValue=code; }
    }
  }
  function start(){ refreshAll(); setInterval(refreshAll, 5000); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
</script>
INJECT_END

MARKER="TOTP_CLIENT_V1"

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  HTML="$d/public/index.html"
  [ -f "$HTML" ] || continue
  echo "==== ${site} ===="
  if grep -qF "$MARKER" "$HTML"; then
    echo "  이미 patched"
    continue
  fi
  cp "$HTML" "$HTML.totpc.bak.$(date +%s)"
  # Node로 안전하게 삽입
  node -e "
    var fs=require('fs');
    var html=fs.readFileSync('$HTML','utf8');
    var inj=fs.readFileSync('/tmp/totp-client-injection.html','utf8');
    if(html.indexOf('</body>')>=0){
      html=html.replace('</body>', inj+'</body>');
    } else {
      html=html+inj;
    }
    fs.writeFileSync('$HTML', html);
    console.log('  ✓ injected');
  "
  chown www-data:www-data "$HTML" 2>/dev/null || true
done

rm -f /tmp/totp-client-injection.html

# gauth-public도 이미 자체 TOTP 있지만, jump에도 넣어두면 유용 (skip)
