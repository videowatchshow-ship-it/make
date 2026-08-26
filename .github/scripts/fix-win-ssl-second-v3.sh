#!/usr/bin/env bash
set +e

echo "===== 1) win-le-ssl.conf에 /codes/ ProxyPass 추가 ====="
WIN_SSL="/etc/apache2/sites-enabled/win-le-ssl.conf"
WIN_SSL_AVAIL="/etc/apache2/sites-available/win-le-ssl.conf"

# sites-enabled에 있는 파일 확인 (심볼릭 링크도 포함)
TARGET=""
if sudo test -f "$WIN_SSL"; then
  TARGET="$WIN_SSL"
elif sudo test -f "$WIN_SSL_AVAIL"; then
  # sites-enabled에 심볼릭 링크 생성
  sudo ln -sf "$WIN_SSL_AVAIL" "$WIN_SSL"
  TARGET="$WIN_SSL"
fi

if [ -n "$TARGET" ]; then
  echo "win SSL vhost: $TARGET"
  echo "현재 /codes 관련:"
  sudo grep -n '/codes\|ProxyPass' "$TARGET" | head -20

  HAS=$(sudo grep -c '/codes' "$TARGET" 2>/dev/null)
  echo "/codes count: $HAS"
  if [ "${HAS:-0}" = "0" ]; then
    # <VirtualHost *:443> 블록 내 </VirtualHost> 바로 앞에 삽입
    sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:4001/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:4001/codes/" "$TARGET"
    echo "win-le-ssl.conf: /codes/ ProxyPass 추가 완료"
  else
    echo "win-le-ssl.conf: /codes/ 이미 있음"
    sudo grep '/codes' "$TARGET"
  fi

  echo ""
  echo "--- win-le-ssl.conf 전체 ---"
  sudo cat "$TARGET"
else
  echo "win-le-ssl.conf 없음 — sites-available 목록:"
  sudo ls /etc/apache2/sites-available/ | grep win
fi

echo ""
echo "===== 2) second: /codes 라우트 상태 및 추가 ====="
SECOND_JS="/var/www/sites/second/server.js"
[ ! -f "$SECOND_JS" ] 2>/dev/null && SECOND_JS="/var/www/sites/second/index.js"

echo "second 파일: $SECOND_JS"
sudo test -f "$SECOND_JS" && echo "파일 있음" || echo "파일 없음"

HAS_CODES=$(sudo grep -c '/codes' "$SECOND_JS" 2>/dev/null)
echo "/codes count: ${HAS_CODES:-0}"

if [ "${HAS_CODES:-0}" = "0" ]; then
  echo "second: /codes 없음 — 삽입 시작"

  sudo tee /tmp/sr3.js > /dev/null << 'JSEOF'

// TOTP /codes/:secret
const _c3 = require('crypto');
function _b3(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0, out = [];
  for (const c of s) { const i=a.indexOf(c); if(i<0)continue; val=(val<<5)|i; bits+=5; if(bits>=8){bits-=8;out.push((val>>bits)&0xff);} }
  return Buffer.from(out);
}
function _t3(s) {
  const cnt = Math.floor(Date.now()/1000/30);
  const key = _b3(s);
  const cb = Buffer.alloc(8); let c=cnt;
  for(let i=7;i>=0;i--){cb[i]=c&0xff;c=Math.floor(c/256);}
  const h = _c3.createHmac('sha1',key).update(cb).digest();
  const off = h[19]&0xf;
  const code = (((h[off]&0x7f)<<24)|((h[off+1]&0xff)<<16)|((h[off+2]&0xff)<<8)|(h[off+3]&0xff))%1000000;
  return String(code).padStart(6,'0');
}
app.get('/codes/:secret', (req, res) => {
  try { const token=_t3(req.params.secret); res.json({token,remaining:30-(Math.floor(Date.now()/1000)%30)}); }
  catch(e) { res.status(400).json({error:e.message}); }
});

JSEOF

  LISTEN_LINE=$(sudo grep -n 'app\.listen\|server\.listen' "$SECOND_JS" 2>/dev/null | tail -1 | cut -d: -f1)
  echo "listen 줄: ${LISTEN_LINE:-없음}"

  if [ -n "$LISTEN_LINE" ] && [ "$LISTEN_LINE" -gt 0 ] 2>/dev/null; then
    sudo sed -i "${LISTEN_LINE}r /tmp/sr3.js" "$SECOND_JS"
    echo "삽입 완료"
  else
    sudo bash -c "cat /tmp/sr3.js >> '$SECOND_JS'"
    echo "파일 끝에 추가"
  fi
  sudo rm -f /tmp/sr3.js

  echo "삽입 후 /codes 확인:"
  sudo grep -n '/codes\|_t3\|_b3' "$SECOND_JS"
else
  echo "second: /codes 이미 있음"
fi

echo ""
echo "===== second 재시작 ====="
sudo systemctl restart second.service 2>/dev/null && echo "systemd OK" || {
  sudo pkill -f "node.*second" 2>/dev/null; sleep 1
  SDIR=$(dirname "$SECOND_JS")
  sudo bash -c "cd '$SDIR' && nohup node $(basename '$SECOND_JS') >> /var/log/second-node.log 2>&1 &"
  echo "node 직접 재기동"
}
sleep 3

echo ""
echo "===== Apache configtest + reload ====="
sudo apache2ctl configtest 2>&1 | tail -3
sudo systemctl reload apache2 && echo "reload 완료"

echo ""
echo "===== 최종 검증 ====="
for site in cha win second; do
  RESP=$(curl -sk --max-time 8 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\n  http=%{http_code}" 2>/dev/null | tail -2)
  echo "  $site: $RESP"
done
