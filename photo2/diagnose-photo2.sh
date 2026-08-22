#!/bin/bash
set -uo pipefail

P2="/var/www/sites/chamgyo/public/photo2"
P1="/var/www/sites/chamgyo/public/photo"
P3="/var/www/sites/chamgyo/public/photo3"

echo "===== [1/10] README.md ====="
cat "$P2/README.md" 2>/dev/null || echo "(README.md not found)"

echo ""
echo "===== [2/10] photo2 top-level structure ====="
ls -la "$P2/" 2>/dev/null || { echo "photo2 dir NOT FOUND"; exit 1; }

echo ""
echo "===== [3/10] data/ (실체 - source of truth) ====="
if [ -L "$P2/data" ]; then
  echo "WARNING: photo2/data is a symlink (should be real dir) -> $(readlink -f "$P2/data")"
else
  ls -la "$P2/data/" 2>/dev/null | head -30 || echo "MISSING"
fi
echo "--- sel_*.json (4 channels) ---"
for ch in cent tak jay otuki; do
  echo "sel_$ch.json:"
  cat "$P2/data/sel_$ch.json" 2>/dev/null || echo "  MISSING"
done

echo ""
echo "===== [4/10] downstream symlink chain (photo3/data, photo/data -> photo2/data) ====="
for dir in "$P3" "$P1"; do
  if [ -L "$dir/data" ]; then
    TARGET=$(readlink -f "$dir/data" 2>/dev/null || echo "?")
    [ -e "$dir/data" ] && echo "OK: $dir/data -> $TARGET" || echo "BROKEN: $dir/data -> $TARGET"
  else
    echo "NOT A SYMLINK: $dir/data"
  fi
done

echo ""
echo "===== [5/10] session guard (write.php / write_select_room.php) ====="
for f in write.php write_select_room.php; do
  echo "--- $f ---"
  if [ -f "$P2/$f" ]; then
    grep -n 'session_conf\|SESSION\[.auth.\]\|cent.*tak.*jay.*otuki\|header(.Location: login' "$P2/$f" || echo "  guard pattern NOT found"
  else
    echo "  MISSING"
  fi
done

echo ""
echo "===== [6/10] hot_patches.json (tail) ====="
python3 -c "
import json,sys
try:
    d=json.load(open('$P2/hot_patches.json'))
    print('count:', len(d) if isinstance(d,list) else 'n/a')
    print(json.dumps(d[-3:] if isinstance(d,list) else d, ensure_ascii=False, indent=2)[:2000])
except Exception as e:
    print('ERROR reading hot_patches.json:', e)
" 2>/dev/null || tail -c 1000 "$P2/hot_patches.json" 2>/dev/null || echo "MISSING"

echo ""
echo "===== [7/10] CAH_1.html key markers (mini-view hide / center / coating / copy buttons) ====="
grep -n 'display:\s*none\|mini' "$P2/CAH_1.html" 2>/dev/null | head -10
grep -n 'rgba(0,0,0,0.11)\|rgba(0, 0, 0, 0.11)' "$P2/CAH_1.html" 2>/dev/null | head -5
grep -n 'copy\|클립보드\|navigator.clipboard' "$P2/CAH_1.html" 2>/dev/null | head -10

echo ""
echo "===== [8/10] .htaccess ====="
cat "$P2/.htaccess" 2>/dev/null || echo "(none)"

echo ""
echo "===== [9/10] Apache vhost FollowSymLinks/AllowOverride for photo2 ====="
sudo grep -rn 'photo2\|FollowSymLinks\|AllowOverride' /etc/apache2/sites-enabled/ 2>/dev/null | head -20 || echo "not found"

echo ""
echo "===== [10/10] recent apache error log (photo2) ====="
sudo tail -n 200 /chamgyo_error.log 2>/dev/null | grep -i 'photo2' | tail -40 || echo "(no photo2 errors in recent log / log not found)"

echo ""
echo "DONE"
