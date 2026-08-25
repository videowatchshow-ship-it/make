#!/usr/bin/env bash
# 진단 + 죽은 서비스만 롤백. 살아있으면 안 건드림.
set +e

for d in /var/www/sites/*/; do
  site=$(basename "$d")
  case "$site" in gauth|gauth01) continue;; esac
  SRV="$d/server.js"
  HTML="$d/public/index.html"
  state=$(systemctl is-active "$site" 2>/dev/null)
  echo "==== ${site} : $state ===="
  if [ "$state" = "active" ]; then
    # 살아있음 — /codes 응답 확인만
    port=$(ss -ltnp 2>/dev/null | grep "\"node\".*$(systemctl show -p MainPID --value $site 2>/dev/null)" | grep -oE ':[0-9]+ ' | head -1 | tr -d ': ')
    continue
  fi
  echo "  !! 죽음 → 복원"
  LB=$(ls -1t "$SRV".codesbak.* 2>/dev/null | head -1)
  [ -n "$LB" ] && cp "$LB" "$SRV" && echo "  server 복원"
  HB=$(ls -1t "$HTML".codesbak.* 2>/dev/null | head -1)
  [ -n "$HB" ] && cp "$HB" "$HTML" && chown www-data:www-data "$HTML" 2>/dev/null && echo "  html 복원"
  timeout 20 systemctl restart "$site" 2>/dev/null
  echo "  재시작 후: $(systemctl is-active $site 2>/dev/null)"
done

echo
echo "===== 최종 상태 + /codes 테스트 ====="
for site in georgia simmani poten bacad win cham; do
  st=$(systemctl is-active "$site" 2>/dev/null)
  echo "$site: $st"
done
echo DONE
