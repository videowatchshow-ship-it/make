#!/bin/bash
set -euo pipefail

P3="/var/www/sites/chamgyo/public/photo3"
P2="/var/www/sites/chamgyo/public/photo2"
P1="/var/www/sites/chamgyo/public/photo"

echo "===== [1/8] photo3 directory ====="
ls -la "$P3/" 2>/dev/null | head -30 || { echo "photo3 dir NOT FOUND"; exit 1; }

echo "===== [2/8] symlink chain ====="
echo "photo3/data:" && ls -la "$P3/data" 2>/dev/null || echo "MISSING"
echo "photo2/data:" && ls -la "$P2/data" 2>/dev/null || echo "MISSING"
echo "photo/data:" && ls -la "$P1/data" 2>/dev/null || echo "MISSING"

echo "===== [3/8] key files ====="
for f in CAH_1.html hot-patch.js modules/dist/bundle.js data/sel_tak.json; do
  FULL="$P3/$f"
  if [ -L "$FULL" ]; then
    TARGET=$(readlink -f "$FULL" 2>/dev/null || echo "?")
    [ -e "$FULL" ] && echo "OK symlink: $f -> $TARGET ($(stat -c%s "$FULL" 2>/dev/null || echo ?)B)" || echo "BROKEN symlink: $f -> $TARGET"
  elif [ -f "$FULL" ]; then
    echo "OK file: $f ($(stat -c%s "$FULL")B)"
  elif [ -d "$FULL" ]; then
    echo "OK dir: $f"
  else
    echo "MISSING: $f"
  fi
done

echo "===== [4/8] current .htaccess ====="
echo "--- photo3 ---"
cat "$P3/.htaccess" 2>/dev/null || echo "(none)"
echo "--- photo (working reference) ---"
cat "$P1/.htaccess" 2>/dev/null || echo "(none)"

echo "===== [5/8] Apache vhost config ====="
sudo grep -rn 'FollowSymLinks\|photo3\|AllowOverride' /etc/apache2/sites-enabled/ 2>/dev/null | head -20 || echo "not found"

echo "===== [6/8] Writing .htaccess with FollowSymLinks ====="
sudo tee "$P3/.htaccess" > /dev/null << 'HTEOF'
Options +FollowSymLinks

<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "*"
  Header set Access-Control-Allow-Methods "GET, OPTIONS"
  Header set X-Photo3-Fix "prism-ios-v1"
</IfModule>

<FilesMatch "\.(json|php)$">
  <IfModule mod_headers.c>
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </IfModule>
</FilesMatch>
HTEOF
echo ".htaccess written"

echo "===== [7/8] Fix symlinks ====="
cd "$P3"
[ ! -e data ] && sudo ln -sfn "$P2/data" data && echo "Created data symlink" || echo "data OK"
[ ! -e hot-patch.js ] && sudo ln -sfn "$P2/hot-patch.js" hot-patch.js && echo "Created hot-patch.js symlink" || echo "hot-patch.js OK"
[ ! -e modules ] && sudo ln -sfn "$P2/modules" modules && echo "Created modules symlink" || echo "modules OK"
for api in api_hot_patch.php api_heartbeat.php api_selected_room.php; do
  [ ! -e "$api" ] && [ -e "$P2/$api" ] && sudo ln -sfn "$P2/$api" "$api" && echo "Created $api symlink" || echo "$api OK"
done

echo "===== [8/8] Apache reload + verify ====="
sudo apachectl configtest 2>&1
sudo systemctl reload apache2 2>&1 || echo "reload failed"

echo ""
echo "===== VERIFICATION ====="
echo "--- photo3/CAH_1.html ---"
curl -sI "http://localhost/photo3/CAH_1.html?ch=tak" 2>/dev/null | head -5
echo "--- photo3/data/sel_tak.json ---"
curl -sI "http://localhost/photo3/data/sel_tak.json" 2>/dev/null | head -5
echo "--- photo3/hot-patch.js ---"
curl -sI "http://localhost/photo3/hot-patch.js" 2>/dev/null | head -5
echo "--- photo3/modules/dist/bundle.js ---"
curl -sI "http://localhost/photo3/modules/dist/bundle.js" 2>/dev/null | head -5
echo "--- photo/CAH_1.html (reference) ---"
curl -sI "http://localhost/photo/CAH_1.html?ch=tak" 2>/dev/null | head -5
echo ""
echo "DONE"
