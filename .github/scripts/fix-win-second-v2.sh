#!/usr/bin/env bash
set +e

echo "===== 1) second: /codes 라우트 추가 ====="
SECOND_JS="/var/www/sites/second/server.js"
[ ! -f "$SECOND_JS" ] && SECOND_JS="/var/www/sites/second/index.js"

# 단일 파일 grep으로 count
HAS_CODES=$(sudo grep -c '/codes' "$SECOND_JS" 2>/dev/null)
echo "second $SECOND_JS /codes count: $HAS_CODES"

if [ "${HAS_CODES:-0}" = "0" ]; then
  sudo tee /tmp/codes_route.js > /dev/null << 'JSEOF'

// TOTP /codes/:secret
const _crypto2 = require('crypto');
function _b32buf(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0, out = [];
  for (const c of s) {
    const idx = alpha.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return Buffer.from(out);
}
function _totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const key = _b32buf(secret);
  const cb = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { cb[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = _crypto2.createHmac('sha1', key).update(cb).digest();
  const off = hmac[19] & 0xf;
  const code = (((hmac[off]&0x7f)<<24)|((hmac[off+1]&0xff)<<16)|((hmac[off+2]&0xff)<<8)|(hmac[off+3]&0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
app.get('/codes/:secret', (req, res) => {
  try {
    const token = _totp(req.params.secret);
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    res.json({ token, remaining });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

JSEOF

  LISTEN_LINE=$(sudo grep -n 'app\.listen' "$SECOND_JS" | tail -1 | cut -d: -f1)
  echo "app.listen 위치: ${LISTEN_LINE}번째 줄"

  if [ -n "$LISTEN_LINE" ]; then
    sudo sed -i "${LISTEN_LINE}r /tmp/codes_route.js" "$SECOND_JS"
    echo "second: /codes 라우트 삽입 완료"
  else
    sudo bash -c "cat /tmp/codes_route.js >> '$SECOND_JS'"
    echo "second: /codes 라우트 파일 끝에 추가"
  fi
  sudo rm -f /tmp/codes_route.js

  # 삽입 확인
  echo "삽입 후 grep:"
  sudo grep -n '/codes' "$SECOND_JS"
else
  echo "second: /codes 이미 있음"
fi

echo ""
echo "===== second 재시작 ====="
sudo systemctl restart second.service 2>/dev/null && echo "systemd 재시작 성공" || {
  sudo pkill -f "node.*second/server" 2>/dev/null
  sleep 1
  SECOND_DIR=$(dirname "$SECOND_JS")
  sudo bash -c "cd '$SECOND_DIR' && nohup node $(basename '$SECOND_JS') >> /var/log/second-node.log 2>&1 &"
  echo "node 직접 재기동"
}
sleep 3

echo ""
echo "===== 2) win 진단 ====="
echo "--- sites-enabled 목록 ---"
sudo ls -la /etc/apache2/sites-enabled/

echo ""
echo "--- win 관련 vhost 내용 ---"
WIN_CONF=$(sudo find /etc/apache2/sites-enabled/ -name 'win*' 2>/dev/null | head -1)
echo "win vhost: ${WIN_CONF:-없음}"
if [ -n "$WIN_CONF" ]; then
  sudo cat "$WIN_CONF"
fi

echo ""
echo "--- win backend 포트 응답 확인 ---"
WIN_PORT=$(sudo grep -hoP 'ProxyPass\s+/\s+http://127\.0\.0\.1:\K\d+' "$WIN_CONF" 2>/dev/null | head -1)
[ -z "$WIN_PORT" ] && WIN_PORT=$(sudo grep -hoP 'ProxyPass\s+\S+\s+http://127\.0\.0\.1:\K\d+' "$WIN_CONF" 2>/dev/null | head -1)
[ -z "$WIN_PORT" ] && WIN_PORT="4001"
echo "win 포트: $WIN_PORT"
curl -sk --max-time 5 "http://127.0.0.1:${WIN_PORT}/codes/TEST" -w "\nhttp=%{http_code}\n" 2>/dev/null | tail -3

echo ""
echo "--- win backend server.js 확인 ---"
WIN_SERVER=$(sudo find /var/www/sites/win /opt/win* 2>/dev/null -name 'server.js' -o -name 'index.js' 2>/dev/null | head -1)
echo "win server: ${WIN_SERVER:-없음}"
if [ -n "$WIN_SERVER" ]; then
  echo "포트 및 /codes 확인:"
  sudo grep -n 'listen\|PORT\|port\|codes' "$WIN_SERVER" | head -20
fi

echo ""
echo "--- Apache /codes/ ProxyPass in win vhost ---"
if [ -n "$WIN_CONF" ]; then
  HAS_WIN_CODES=$(sudo grep -c '/codes' "$WIN_CONF" 2>/dev/null)
  echo "/codes count in win vhost: $HAS_WIN_CODES"
  if [ "${HAS_WIN_CODES:-0}" = "0" ]; then
    WIN_PROXY_PORT=$(sudo grep -hoP 'ProxyPass\s+/\s+http://127\.0\.0\.1:\K\d+' "$WIN_CONF" 2>/dev/null | head -1)
    [ -z "$WIN_PROXY_PORT" ] && WIN_PROXY_PORT="4001"
    sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:${WIN_PROXY_PORT}/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:${WIN_PROXY_PORT}/codes/" "$WIN_CONF"
    echo "win: /codes ProxyPass 추가 (port=$WIN_PROXY_PORT)"
  else
    echo "win: /codes ProxyPass 이미 있음"
    sudo grep '/codes' "$WIN_CONF"
  fi
fi

echo ""
echo "===== win backend에도 /codes 라우트 추가 ====="
if [ -n "$WIN_SERVER" ]; then
  WIN_HAS_CODES=$(sudo grep -c '/codes' "$WIN_SERVER" 2>/dev/null)
  echo "win server /codes count: $WIN_HAS_CODES"
  if [ "${WIN_HAS_CODES:-0}" = "0" ]; then
    sudo tee /tmp/win_codes_route.js > /dev/null << 'JSEOF'

// TOTP /codes/:secret
const _wcrypto = require('crypto');
function _wb32buf(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0, out = [];
  for (const c of s) {
    const idx = alpha.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return Buffer.from(out);
}
function _wtotp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const key = _wb32buf(secret);
  const cb = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { cb[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = _wcrypto.createHmac('sha1', key).update(cb).digest();
  const off = hmac[19] & 0xf;
  const code = (((hmac[off]&0x7f)<<24)|((hmac[off+1]&0xff)<<16)|((hmac[off+2]&0xff)<<8)|(hmac[off+3]&0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
app.get('/codes/:secret', (req, res) => {
  try {
    const token = _wtotp(req.params.secret);
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    res.json({ token, remaining });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

JSEOF
    WIN_LISTEN=$(sudo grep -n 'app\.listen\|server\.listen' "$WIN_SERVER" | tail -1 | cut -d: -f1)
    if [ -n "$WIN_LISTEN" ]; then
      sudo sed -i "${WIN_LISTEN}r /tmp/win_codes_route.js" "$WIN_SERVER"
      echo "win: /codes 라우트 삽입 완료 (line $WIN_LISTEN 앞)"
    else
      sudo bash -c "cat /tmp/win_codes_route.js >> '$WIN_SERVER'"
      echo "win: /codes 라우트 파일 끝에 추가"
    fi
    sudo rm -f /tmp/win_codes_route.js

    # win 재시작
    WIN_SERVICE=$(sudo systemctl list-units --type=service --all 2>/dev/null | grep -o 'win[a-z.-]*\.service' | head -1)
    echo "win service: ${WIN_SERVICE:-없음}"
    if [ -n "$WIN_SERVICE" ]; then
      sudo systemctl restart "$WIN_SERVICE" && echo "win: systemd 재시작"
    else
      WIN_DIR=$(dirname "$WIN_SERVER")
      sudo pkill -f "node.*win.*server\|node.*win.*index" 2>/dev/null
      sleep 1
      sudo bash -c "cd '$WIN_DIR' && nohup node $(basename '$WIN_SERVER') >> /var/log/win-node.log 2>&1 &"
      echo "win: node 직접 재기동"
    fi
    sleep 2
  else
    echo "win: /codes 이미 있음"
  fi
fi

echo ""
echo "===== Apache configtest + reload ====="
sudo apache2ctl configtest 2>&1 | tail -5
sudo systemctl reload apache2 && echo "Apache reload 완료"

echo ""
echo "===== 최종 검증 ====="
for site in cha win second; do
  RESP=$(curl -sk --max-time 8 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\n  http=%{http_code}" 2>/dev/null | tail -2)
  echo "  $site: $RESP"
done
