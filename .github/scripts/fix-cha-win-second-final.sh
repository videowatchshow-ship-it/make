#!/usr/bin/env bash
set +e

echo "===== 1) cha: Apache reload (포트 수정 이미 완료됨) ====="
sudo apache2ctl configtest 2>&1 | tail -3
sudo systemctl reload apache2
echo "Apache reload 완료"

echo ""
echo "cha vhost /codes 현재 상태:"
sudo grep -E 'ProxyPass.*/codes' /etc/apache2/sites-enabled/cha.conf 2>/dev/null

echo ""
echo "===== 2) win: vhost 활성화 + /codes/ ProxyPass 추가 ====="
# win-le-ssl.conf 활성화
sudo a2ensite win-le-ssl.conf 2>/dev/null || sudo a2ensite win.conf 2>/dev/null
echo "a2ensite 완료"

# win vhost 파일 확인
WIN_VHOST=$(sudo find /etc/apache2/sites-enabled/ -name 'win*' 2>/dev/null | head -1)
echo "활성화된 win vhost: ${WIN_VHOST:-없음}"

if [ -z "$WIN_VHOST" ]; then
  # 수동 심볼릭링크
  sudo ln -sf /etc/apache2/sites-available/win-le-ssl.conf /etc/apache2/sites-enabled/win-le-ssl.conf 2>/dev/null
  WIN_VHOST="/etc/apache2/sites-enabled/win-le-ssl.conf"
  echo "수동 symlink 생성: $WIN_VHOST"
fi

if [ -n "$WIN_VHOST" ] && sudo test -f "$WIN_VHOST"; then
  # 기존 ProxyPass 포트 추출
  WIN_PORT=$(sudo grep -oP 'ProxyPass\s+\S+\s+http://127\.0\.0\.1:\K\d+' "$WIN_VHOST" 2>/dev/null | head -1)
  [ -z "$WIN_PORT" ] && WIN_PORT="4001"
  echo "win 포트: $WIN_PORT"

  HAS=$(sudo grep -c 'ProxyPass.*/codes' "$WIN_VHOST" 2>/dev/null || echo 0)
  if [ "$HAS" -gt 0 ] 2>/dev/null; then
    echo "win: /codes/ ProxyPass 이미 있음"
  else
    sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:${WIN_PORT}/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:${WIN_PORT}/codes/" "$WIN_VHOST"
    echo "win: /codes/ ProxyPass 추가 완료 (port=$WIN_PORT)"
  fi
fi

echo ""
echo "===== 3) second: server.js /codes/ 라우트 추가 ====="
SECOND_JS="/var/www/sites/second/server.js"

# /codes/ 라우트가 없으면 app.listen() 바로 앞에 삽입
HAS_CODES=$(sudo grep -c '/codes' "$SECOND_JS" 2>/dev/null || echo 0)
if [ "$HAS_CODES" -eq 0 ] 2>/dev/null; then
  sudo tee /tmp/codes_route.js > /dev/null << 'JSEOF'

// TOTP /codes/:secret
const crypto_mod = require('crypto');
function hotp(secret, counter) {
  const key = Buffer.from(secret.toUpperCase().replace(/=+$/,''), 'base32');
  const b32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buf = Buffer.alloc(Math.ceil(secret.replace(/=+$/,'').length * 5 / 8));
  let bits = 0, val = 0, out = 0;
  for (let i = 0; i < secret.replace(/=+$/,'').length; i++) {
    val = b32chars.indexOf(secret.toUpperCase()[i]);
    if (val < 0) continue;
    bits += 5; val = val;
    if (bits >= 8) { bits -= 8; buf[out++] = (val << bits) | (((i+1 < secret.length ? b32chars.indexOf(secret.toUpperCase()[i+1]) : 0) >> (5-bits))); }
  }
  const rawKey = buf.slice(0, out);
  const cb = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { cb[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = crypto_mod.createHmac('sha1', rawKey).update(cb).digest();
  const offset = hmac[19] & 0xf;
  const code = (((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
function base32toBuffer(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0, out = [];
  for (const c of s) {
    const idx = alpha.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const key = base32toBuffer(secret);
  const cb = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { cb[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = crypto_mod.createHmac('sha1', key).update(cb).digest();
  const offset = hmac[19] & 0xf;
  const code = (((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
app.get('/codes/:secret', (req, res) => {
  try {
    const token = totp(req.params.secret);
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    res.json({ token, remaining });
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

JSEOF

  # app.listen 줄 바로 앞에 삽입
  LISTEN_LINE=$(sudo grep -n 'app\.listen' "$SECOND_JS" | tail -1 | cut -d: -f1)
  echo "app.listen 위치: ${LISTEN_LINE}번째 줄"

  if [ -n "$LISTEN_LINE" ]; then
    sudo sed -i "${LISTEN_LINE}r /tmp/codes_route.js" "$SECOND_JS"
    echo "second: /codes/ 라우트 삽입 완료"
  else
    # 파일 끝에 추가
    sudo bash -c "cat /tmp/codes_route.js >> '$SECOND_JS'"
    echo "second: /codes/ 라우트 파일 끝에 추가"
  fi
  sudo rm -f /tmp/codes_route.js
else
  echo "second: /codes/ 이미 있음 (count=$HAS_CODES)"
fi

echo ""
echo "===== Apache configtest + reload ====="
sudo apache2ctl configtest 2>&1 | tail -3
sudo systemctl reload apache2
echo "reload 완료"

echo ""
echo "===== second 서비스 재시작 ====="
sudo systemctl restart second.service 2>/dev/null || {
  # systemd unit 없으면 직접 재기동
  sudo pkill -f "node.*second/server" 2>/dev/null
  sleep 1
  sudo bash -c "cd /var/www/sites/second && nohup node server.js >> /var/log/second-node.log 2>&1 &"
  echo "second: node 직접 재기동"
}
sleep 2
SECOND_STATUS=$(sudo systemctl is-active second.service 2>/dev/null || echo "manual")
echo "second 상태: $SECOND_STATUS"

echo ""
echo "===== 최종 검증 ====="
for site in cha win second; do
  RESP=$(curl -sk --max-time 8 "https://${site}.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\n  http=%{http_code}" 2>/dev/null | tail -2)
  echo "  $site: $RESP"
done
