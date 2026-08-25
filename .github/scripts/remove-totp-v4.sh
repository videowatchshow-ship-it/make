#!/usr/bin/env bash
# 긴급: 주입한 TOTP_CLIENT_V1~V4 스크립트를 전부 제거 (브라우저 HUNG 유발).
# 렌더는 원래 코드로 정상 동작하고, 2FA 코드는 각 카드 '🔄 새로고침' 버튼으로 조회 가능.
set +e

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  HTML="$d/public/index.html"
  [ -f "$HTML" ] || continue
  echo "==== ${site} ===="
  node <<NODE
  const fs=require('fs');
  const p="$HTML";
  let html=fs.readFileSync(p,'utf8');
  const before=html.length;
  html=html.replace(/<script>\/\* TOTP_CLIENT_V[1234] \*\/[\s\S]*?<\/script>\s*/g,'');
  if(html.length!==before){
    fs.writeFileSync(p, html);
    console.log('  ✓ V4 제거 ('+(before-html.length)+' chars)');
  } else {
    console.log('  - 없음');
  }
NODE
  chown www-data:www-data "$HTML" 2>/dev/null || true
done
echo DONE
