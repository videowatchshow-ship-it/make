#!/usr/bin/env bash
# 렌더를 막는 서버측 /codes/ Promise.all 프리페치를 제거.
# TOTP 6자리는 클라이언트 V4 스크립트(SubtleCrypto)가 브라우저에서 계산하므로
# 서버 /codes/ 호출은 불필요하고, 하위 서버엔 그 엔드포인트가 없어서 렌더를 hang 시킴.
# ref: MDN Promise.all, RFC 6238
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

  // 패턴: var codes = await Promise.all(ALL.map(function(a){ ... }))
  // 이 블록을 각 계정 '—' placeholder 배열로 대체 (서버 fetch 제거)
  const re=/var\s+codes\s*=\s*await\s+Promise\.all\(\s*ALL\.map\(function\([^)]*\)\{[\s\S]*?\}\)\s*\)/;
  if(re.test(html)){
    html=html.replace(re, "var codes = ALL.map(function(){ return '—' })");
    fs.writeFileSync(p, html);
    console.log('  ✓ blocking /codes prefetch 제거 ('+(before-html.length)+' chars)');
  } else {
    // 이미 없거나 다른 형태 — refreshAllCodes 자동호출 여부만 점검
    if(html.indexOf('await Promise.all')>=0 && html.indexOf('/codes/')>=0){
      console.log('  ! Promise.all+/codes 있으나 패턴 불일치 — 수동 확인 필요');
    } else {
      console.log('  - 해당 없음 (이미 정상)');
    }
  }
NODE
  chown www-data:www-data "$HTML" 2>/dev/null || true
done
echo DONE
