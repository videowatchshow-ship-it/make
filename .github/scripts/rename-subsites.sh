#!/usr/bin/env bash
# ref: https://httpd.apache.org/docs/2.4/vhosts/name-based.html
# ref: https://www.freedesktop.org/software/systemd/man/systemctl.html
set -e

# rename OLD → NEW  with korean title
rename_site() {
  local old="$1" new="$2" kname="$3" port="$4"
  local OLD_DIR=/var/www/sites/${old}
  local NEW_DIR=/var/www/sites/${new}
  echo "==== ${old} → ${new} (${kname}) port=${port} ===="

  if [ ! -d "$OLD_DIR" ]; then
    echo "  origin ${OLD_DIR} 없음 — skip"; return
  fi
  if [ -d "$NEW_DIR" ]; then
    echo "  ${NEW_DIR} 이미 존재 — skip (idempotent)"; return
  fi

  # 1) 서비스 정지
  for svc in "$old" "site-${old}" "${old}-site"; do
    if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
      systemctl stop "$svc" 2>&1 || true
      systemctl disable "$svc" 2>&1 || true
      rm -f "/etc/systemd/system/${svc}.service"
      echo "  stopped: $svc"
      break
    fi
  done

  # 2) 디렉토리 이동
  mv "$OLD_DIR" "$NEW_DIR"

  # 3) 코드/HTML 슬러그 치환
  # server.js
  sed -i "s|/api/${old}/|/api/${new}/|g" "${NEW_DIR}/server.js" 2>/dev/null || true
  sed -i "s|\"${old}\"|\"${new}\"|g" "${NEW_DIR}/server.js" 2>/dev/null || true
  sed -i "s|'${old}'|'${new}'|g" "${NEW_DIR}/server.js" 2>/dev/null || true
  # HTML title/heading substitution: any known old title stays as-is unless we know it
  if [ -f "${NEW_DIR}/public/index.html" ]; then
    sed -i "s|${old}|${new}|g" "${NEW_DIR}/public/index.html" 2>/dev/null || true
  fi
  # accounts.json — 각 계정의 site 필드 변경
  if [ -f "${NEW_DIR}/accounts.json" ]; then
    node -e "
      var fs=require('fs');
      var p='${NEW_DIR}/accounts.json';
      try{
        var d=JSON.parse(fs.readFileSync(p,'utf8'));
        var a=Array.isArray(d)?d:(d.accounts||[]);
        a.forEach(function(x){ if(x.site==='${old}') x.site='${new}'; });
        fs.writeFileSync(p, JSON.stringify(Array.isArray(d)?a:{accounts:a},null,2));
        console.log('  accounts.json site field updated: ' + a.length + ' entries');
      }catch(e){ console.log('  accounts.json update skipped: ' + e.message); }
    "
  fi
  chown -R www-data:www-data "$NEW_DIR"

  # 4) 인증서 재발급
  DOMAIN="${new}.cent-solution.online"
  if [ ! -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "  certbot for ${DOMAIN}"
    certbot certonly --apache --non-interactive --agree-tos \
      --email admin@cent-solution.online \
      --domains "$DOMAIN" 2>&1 | tail -8 || echo "  cert 발급 실패 — DNS 우선 필요"
  fi
  CERT=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
  KEY=/etc/letsencrypt/live/${DOMAIN}/privkey.pem

  # 5) 신규 systemd 유닛
  cat > "/etc/systemd/system/${new}.service" <<UNIT
[Unit]
Description=${kname} (${new}) subsite Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${NEW_DIR}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=${port}
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
UNIT

  # server.js hardcoded port를 새 포트로 치환
  CUR=$(grep -oE 'listen\s*\(\s*[0-9]+' "${NEW_DIR}/server.js" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
  if [ -n "$CUR" ] && [ "$CUR" != "$port" ]; then
    sed -i "s|listen(\s*${CUR}|listen(${port}|g" "${NEW_DIR}/server.js"
  fi
  sed -i "s|const PORT\s*=\s*[0-9]\+|const PORT = ${port}|g" "${NEW_DIR}/server.js" 2>/dev/null || true

  # 6) Apache vhost
  cat > "/etc/apache2/sites-available/${new}.conf" <<APACHE
<VirtualHost *:80>
  ServerName ${DOMAIN}
  Redirect permanent / https://${DOMAIN}/
</VirtualHost>
<VirtualHost *:443>
  ServerName ${DOMAIN}
  DocumentRoot ${NEW_DIR}/public
  <Directory ${NEW_DIR}/public>
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
  </Directory>
  ProxyPass /api/ http://127.0.0.1:${port}/api/
  ProxyPassReverse /api/ http://127.0.0.1:${port}/api/
  SSLEngine on
  SSLCertificateFile ${CERT}
  SSLCertificateKeyFile ${KEY}
</VirtualHost>
APACHE
  a2ensite "${new}.conf" 2>&1 || true

  # 7) 예전 vhost 제거
  for oldconf in "${old}.conf" "${old}-le-ssl.conf"; do
    if [ -f "/etc/apache2/sites-available/${oldconf}" ]; then
      a2dissite "${oldconf%.conf}" 2>&1 || true
      rm -f "/etc/apache2/sites-available/${oldconf}"
    fi
  done

  systemctl daemon-reload
  systemctl enable "${new}.service" 2>&1 || true
  systemctl restart "${new}.service" 2>&1 || true
}

# ── 실행 ──
# potential → poten (한글 "포텐")
rename_site potential poten "포텐" 3033

# soktv → woodong2 (한글 "우동카2") — 기존 6개 계정 유지, 포트는 그대로 두면 좋으나 알수 없으니 새로 배정
# soktv의 원래 포트를 감지 후 그대로 사용
SOKTV_PORT=$(grep -oE 'listen\s*\(\s*[0-9]+' /var/www/sites/soktv/server.js 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
[ -z "$SOKTV_PORT" ] && SOKTV_PORT=3034
rename_site soktv woodong2 "우동카2" "$SOKTV_PORT"

apache2ctl configtest 2>&1 && systemctl reload apache2 || echo "::warning::apache invalid"

echo ""
echo "===== 최종 검증 ====="
for site in poten woodong2; do
  systemctl is-active "${site}.service" 2>&1 | sed "s|^|${site}: |"
  curl -sSk -o /dev/null -w "  https://${site}.cent-solution.online/ → HTTP %{http_code}\n" --max-time 8 "https://${site}.cent-solution.online/" || true
done
