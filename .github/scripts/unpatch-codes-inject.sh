#!/usr/bin/env bash
# win/woodong/romi 등에서 내가 주입한 CODES_ENDPOINT_V1 블록 제거 (app is not defined crash 유발).
# 이 서버들은 http.createServer 기반이라 app 변수가 없음. 원래 /codes 이미 있음.
set +e

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  SRV="$d/server.js"
  [ -f "$SRV" ] || continue
  if grep -qF "CODES_ENDPOINT_V1" "$SRV"; then
    echo "==== $site : 주입 발견 → 제거 ===="
    node <<'NODE' "$SRV"
    const fs=require('fs');
    const p=process.argv[1];
    let s=fs.readFileSync(p,'utf8');
    const before=s.length;
    // 주입 블록 제거: /* CODES_ENDPOINT_V1 ... */ (function(){ ... })();
    s=s.replace(/\n?\/\* CODES_ENDPOINT_V1[\s\S]*?\}\)\(\);\n?/,'\n');
    fs.writeFileSync(p,s);
    console.log('  제거: '+(before-s.length)+' chars');
NODE
    # 포트 좀비 정리 후 재시작
    port=$(grep -oE "PORT *= *[0-9]{3,5}|PORT *\|\| *[0-9]{3,5}" "$SRV" | grep -oE '[0-9]{3,5}' | head -1)
    [ -n "$port" ] && fuser -k "${port}/tcp" 2>/dev/null && sleep 1
    pkill -f "$SRV" 2>/dev/null; sleep 1
    timeout 25 systemctl restart "$site" 2>/dev/null
    sleep 2
    echo "  state: $(systemctl is-active $site)"
  fi
done

echo
echo "===== 최종 상태 ====="
for s in win woodong romi georgia simmani poten bacad; do
  echo "$s: $(systemctl is-active $s 2>/dev/null)"
done
echo DONE
