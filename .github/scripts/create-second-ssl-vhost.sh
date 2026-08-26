#!/usr/bin/env bash
set +e

echo "===== second-le-ssl.conf 생성 ====="
# gain 인증서를 임시 사용 (Cloudflare Full SSL 모드에서 원본 cert 호스트명 검증 안 함)
GAIN_CERT="/etc/letsencrypt/live/gain.cent-solution.online/fullchain.pem"
GAIN_KEY="/etc/letsencrypt/live/gain.cent-solution.online/privkey.pem"

sudo tee /etc/apache2/sites-available/second-le-ssl.conf > /dev/null << 'EOFCONF'
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName second.cent-solution.online
    ProxyPreserveHost On
    ProxyPass /codes/ http://127.0.0.1:3023/codes/
    ProxyPassReverse /codes/ http://127.0.0.1:3023/codes/
    ProxyPass / http://127.0.0.1:3023/
    ProxyPassReverse / http://127.0.0.1:3023/
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
SSLCertificateFile /etc/letsencrypt/live/gain.cent-solution.online/fullchain.pem
SSLCertificateKeyFile /etc/letsencrypt/live/gain.cent-solution.online/privkey.pem
Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
EOFCONF

sudo a2ensite second-le-ssl.conf 2>/dev/null && echo "second-le-ssl.conf 활성화"

echo ""
echo "===== win-le-ssl.conf /codes/ 확인 ====="
WIN_SSL="/etc/apache2/sites-enabled/win-le-ssl.conf"
HAS=$(sudo grep -c '/codes' "$WIN_SSL" 2>/dev/null)
echo "win-le-ssl.conf /codes count: $HAS"
if [ "${HAS:-0}" = "0" ]; then
  sudo sed -i "/<\/VirtualHost>/i\\    ProxyPass /codes/ http://127.0.0.1:4001/codes/\n    ProxyPassReverse /codes/ http://127.0.0.1:4001/codes/" "$WIN_SSL"
  echo "win /codes/ ProxyPass 추가"
fi

echo ""
echo "===== Apache configtest + reload ====="
sudo apache2ctl configtest 2>&1 | tail -5
sudo systemctl reload apache2 && echo "reload 완료"

echo ""
echo "===== 로컬 HTTPS 포트 확인 ====="
sudo ss -tlnp | grep ':443'

echo ""
echo "===== second.cent-solution.online 현재 설정 ====="
sudo cat /etc/apache2/sites-enabled/second-le-ssl.conf 2>/dev/null | head -20

echo ""
echo "===== Apache VirtualHost 443 목록 ====="
sudo apache2ctl -S 2>&1 | grep 'second\|win\|443'
