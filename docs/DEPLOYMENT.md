# 배포 — 참교육카지노 서버에 studio 서브도메인 (Apache vhost)

> 목표: 참교육카지노 서버(**34.104.233.35**, `my-site-1`, GCP asia-northeast1-a)에 센트빔 스튜디오를 **`studio.참교육카지노.info`** (`studio.xn--9d0bw2fjtyymch7de9d.info`) 로 HTTPS 배포.
> DNS: Cloudflare (Zone `7e5faed2d3d4d6da7aceb4ddde81a62b`).

> 🚨 **절대 Caddy 쓰지 말 것.** 이 서버는 **Apache가 이미 80/443에서 참교육카지노.info를 호스팅** 중. Caddy를 80/443에 올리면 충돌로 **참교육카지노 사이트가 죽는다.** → Apache에 **studio vhost만 추가**하고 certbot으로 SSL. 참교육카지노.info vhost는 건드리지 않는다.

> 🔐 **토큰 취급**: Cloudflare API 토큰은 셸 환경변수(`$CF_TOKEN`)로만 쓰고 **어떤 파일/저장소에도 커밋하지 말 것.** DNS 추가 후 즉시 폐기(rotate) 권장.

> 제가(AI) 대신 못 하는 것: ① Cloudflare DNS(토큰 필요) ② 서버 SSH 실행. 명령어는 아래 그대로.

---

## 1. Cloudflare DNS — `studio` A 레코드 (프록시 OFF)

맥 터미널 (토큰은 붙여넣되 **커밋/공유 금지**, 실행 후 rotate):
```bash
export CF_TOKEN='...본인 토큰...'          # DNS Edit 권한
export ZONE_ID='7e5faed2d3d4d6da7aceb4ddde81a62b'
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"A","name":"studio","content":"34.104.233.35","ttl":300,"proxied":false,"comment":"참교육 스튜디오 - Apache vhost + MediaMTX WHIP/HLS"}'
```
> **`proxied:false` 필수** — certbot(Let's Encrypt) 발급 + WebRTC(WHIP) 송출이 CF 프록시를 못 뚫는다. 회색 구름(DNS only)이어야 함.

확인:
```bash
dig +short studio.xn--9d0bw2fjtyymch7de9d.info      # 34.104.233.35
```

---

## 2. 서버 SSH
```bash
/Users/admin/google-cloud-sdk/bin/gcloud compute ssh my-site-1 --zone=asia-northeast1-a
# 안 되면 OS Login 계정:
/Users/admin/google-cloud-sdk/bin/gcloud compute ssh videowatch_show_gmail_com@my-site-1 --zone=asia-northeast1-a
```

---

## 3. 스튜디오 파일 배치 — ⚠️ **실제 studio.html (스텁 아님)**

웹루트 `/var/www/sites/studio/public` 에 **이 저장소의 진짜 `client/`** 를 넣는다. (껍데기 studio.html 쓰지 말 것 — 전체 컴포저가 `client/studio.html`에 있음)
```bash
sudo mkdir -p /var/www/sites/studio/public
cd /tmp && git clone https://github.com/videowatchshow-ship-it/make.git cb && \
  sudo cp -r cb/client/* /var/www/sites/studio/public/
sudo chown -R www-data:www-data /var/www/sites/studio/public
ls /var/www/sites/studio/public/studio.html    # 있어야 함 (수천 줄짜리 실제 앱)
```

---

## 4. Apache vhost 추가 (참교육카지노 vhost는 그대로)
```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo tee /etc/apache2/sites-available/studio.conf > /dev/null << 'EOF'
<VirtualHost *:80>
  ServerName studio.xn--9d0bw2fjtyymch7de9d.info
  DocumentRoot /var/www/sites/studio/public
  <Directory /var/www/sites/studio/public>
    Require all granted
    Options -Indexes
  </Directory>

  # 보안 응답 헤더 (OWASP Secure Headers / MDN)
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)"

  ProxyPreserveHost On
  # WHIP 시그널링 → MediaMTX 8889
  ProxyPass        /whip/ http://127.0.0.1:8889/
  ProxyPassReverse /whip/ http://127.0.0.1:8889/
  # HLS 재생 → MediaMTX 8888
  ProxyPass        /hls/  http://127.0.0.1:8888/
  ProxyPassReverse /hls/  http://127.0.0.1:8888/
  # (선택) 대상 CRUD API → server.js 3000
  ProxyPass        /api/  http://127.0.0.1:3000/
  ProxyPassReverse /api/  http://127.0.0.1:3000/
</VirtualHost>
EOF
sudo a2ensite studio
sudo apachectl configtest && sudo systemctl reload apache2
```
> `ServerName`은 punycode(`xn--...`)로 둔다 — 브라우저가 IDN을 punycode Host로 보내기 때문. 정적 파일은 DocumentRoot에서, `/whip /hls /api`만 프록시된다.

---

## 5. SSL 발급 (certbot)
```bash
sudo certbot --apache -d studio.xn--9d0bw2fjtyymch7de9d.info \
  --non-interactive --agree-tos -m videowatch.show@gmail.com --redirect
```
- 자동으로 `:443` SSL vhost 생성 + HTTP→HTTPS 리다이렉트.
- CF 프록시 OFF(§1)여야 80포트 HTTP-01 챌린지 성공. 참교육카지노 인증서와 별개.

---

## 6. ⚠️ MediaMTX WebRTC ICE 포트 — 이거 빠지면 "연결은 되는데 화면 안 나옴"
WHIP **시그널링**은 Apache가 8889로 프록시하지만, **미디어는 UDP로 서버에 직접** 간다.
```bash
# mediamtx.yml 에 공인 IP 알려주기
#   webrtcAdditionalHosts: [34.104.233.35]
# 방화벽에 WebRTC ICE UDP 포트(기본 8189) 열기
gcloud compute firewall-rules create centbeam-webrtc \
  --allow udp:8189 --source-ranges 0.0.0.0/0 2>/dev/null || echo exists
# mediamtx 재시작
```

---

## 7. 검증
```bash
curl -I https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html            # 200
curl -s -o /dev/null -w "참교육 사이트: %{http_code}\n" https://xn--9d0bw2fjtyymch7de9d.info/   # 200 유지 확인
```
- 폰 브라우저 `https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html` → 카메라 허용(HTTPS) → 홈화면 추가(PWA)
- 스튜디오 WHIP 엔드포인트: `https://studio.xn--9d0bw2fjtyymch7de9d.info/whip/tak/whip`
- 방송 시작 → 참교육 path(tak 등)로 송출 확인

---

## 8. 사용자님이 하실 것 (2개)
1. **Cloudflare DNS 한 줄** (§1) — 실행 후 **토큰 rotate**.
2. **서버 SSH → §3~6 복붙**.

---

## 9. 다른 세션 브리핑 (그대로 복붙 — 토큰은 넣지 말 것)
```
도메인: 참교육카지노.info (xn--9d0bw2fjtyymch7de9d.info)
서브: studio.참교육카지노.info → 34.104.233.35 (my-site-1, GCP asia-northeast1-a)
SSH: gcloud compute ssh my-site-1 --zone=asia-northeast1-a  (안되면 videowatch_show_gmail_com@my-site-1)
DNS: Cloudflare Zone 7e5faed2d3d4d6da7aceb4ddde81a62b, studio A→34.104.233.35 proxied:false (토큰은 사용자 셸에서만)

🚨 절대 Caddy 쓰지 말 것 — 80/443은 Apache가 참교육카지노.info 호스팅 중. Caddy 올리면 사이트 죽음.
   → Apache vhost studio.conf 추가만 (ProxyPass /whip→8889 /hls→8888 /api→3000). 참교육 vhost 손대지 말 것.
   → SSL: certbot --apache -d studio.xn--9d0bw2fjtyymch7de9d.info
웹루트: /var/www/sites/studio/public  ← 저장소 client/ 를 그대로 복사(실제 studio.html, 스텁 금지)
MediaMTX: 이미 실행중(8888 HLS, 8889 WHIP). WebRTC: webrtcAdditionalHosts:[34.104.233.35] + 방화벽 udp:8189.
스튜디오 소스: github.com/videowatchshow-ship-it/make 의 client/. docs/DEPLOYMENT.md 참고.
```
