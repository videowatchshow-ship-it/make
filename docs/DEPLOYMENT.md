# 배포 — 참교육카지노 서버에 studio 서브도메인 (Apache vhost 방식)

> 목표: 참교육카지노 서버(**34.104.233.35**)에 센트빔 스튜디오를 **`studio.참교육카지노.info`** (`studio.xn--9d0bw2fjtyymch7de9d.info`) 로 HTTPS 배포.
> 도메인: `참교육카지노.info` = `xn--9d0bw2fjtyymch7de9d.info`, Cloudflare DNS (Zone ID `7e5faed2d3d4d6da7aceb4ddde81a62b`).

> 🚨 **절대 주의 — Caddy 쓰지 말 것.**
> 이 서버는 **이미 Apache가 80/443에서 참교육카지노.info를 호스팅 중**이다. Caddy를 80/443에 올리면 포트 충돌로 **참교육카지노 사이트가 죽는다.**
> → **Apache에 studio 서브도메인 vhost를 추가**하고 certbot으로 SSL 발급한다. MediaMTX는 그대로 두고 Apache가 리버스프록시만 한다.

> 제가(AI) 대신 못 하는 것: **① Cloudflare DNS 추가(토큰 필요) ② 서버 SSH 실행**. 명령어는 아래에 다 있음.

---

## 1. Cloudflare DNS — `studio` A 레코드 (프록시 OFF)

맥 터미널에서 (`$CF_API_TOKEN` = Cloudflare API 토큰, DNS Edit 권한):
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/7e5faed2d3d4d6da7aceb4ddde81a62b/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"studio","content":"34.104.233.35","ttl":300,"proxied":false}'
```
> **`proxied:false` 필수.** Cloudflare 프록시(주황 구름)가 켜지면 (1) certbot 인증서 발급이 CF SSL과 충돌, (2) **WebRTC(WHIP) 송출이 프록시를 못 뚫어 방송 불가**. 회색 구름(DNS only)이어야 함.

확인:
```bash
dig +short studio.xn--9d0bw2fjtyymch7de9d.info      # 34.104.233.35 나와야 함
```

---

## 2. 서버 SSH 접속 (맥 터미널)
```bash
gcloud compute ssh videowatch_show_gmail_com@my-site-1 --zone=asia-northeast1-a
# 안 되면 zone 확인: gcloud compute instances list --filter="EXTERNAL_IP=34.104.233.35"
```

---

## 3. 스튜디오 파일 배치 (서버 안에서)
```bash
sudo mkdir -p /opt/centbeam && sudo chown $USER /opt/centbeam
cd /opt/centbeam
# 이 저장소에서 client/ 만 있으면 됨 (studio.html + manifest + sw.js + icons)
git clone https://github.com/videowatchshow-ship-it/make.git repo && cp -r repo/client ./client
#   또는 scp 로 client/ 폴더만 업로드
ls client/studio.html    # 있어야 함
```

---

## 4. Apache vhost 추가 (참교육카지노 사이트는 그대로 유지)

필요한 모듈:
```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
```

`/etc/apache2/sites-available/studio-centbeam.conf`:
```apache
<VirtualHost *:80>
    ServerName studio.xn--9d0bw2fjtyymch7de9d.info
    DocumentRoot /opt/centbeam/client

    <Directory /opt/centbeam/client>
        Require all granted
        Options -Indexes
    </Directory>

    ProxyPreserveHost On
    # WHIP 인제스트(WebRTC signaling) → 로컬 MediaMTX :8889
    ProxyPass        /whip/ http://127.0.0.1:8889/
    ProxyPassReverse /whip/ http://127.0.0.1:8889/
    # HLS 재생 → 로컬 MediaMTX :8888
    ProxyPass        /hls/  http://127.0.0.1:8888/
    ProxyPassReverse /hls/  http://127.0.0.1:8888/
    # (선택) 대상 CRUD API → server.js :3000
    ProxyPass        /api/  http://127.0.0.1:3000/
    ProxyPassReverse /api/  http://127.0.0.1:3000/
</VirtualHost>
```
> 정적 파일(studio.html·manifest·sw.js·아이콘)은 DocumentRoot에서 그대로 서빙되고, `/whip /hls /api` 만 MediaMTX/서버로 프록시된다. **참교육카지노.info vhost는 건드리지 않으므로 사이트는 그대로 산다.**

```bash
sudo a2ensite studio-centbeam
sudo apache2ctl configtest && sudo systemctl reload apache2
```

---

## 5. SSL 발급 (certbot — 이미 설치됨)
```bash
sudo certbot --apache -d studio.xn--9d0bw2fjtyymch7de9d.info
```
- certbot이 자동으로 `:443` SSL vhost를 만들고 HTTP→HTTPS 리다이렉트 설정.
- HTTP-01 챌린지가 80포트로 오므로 CF 프록시 OFF(§1) 상태여야 성공.
- **참교육카지노.info 인증서는 별개**라 영향 없음.

---

## 6. MediaMTX WebRTC ICE 포트 (방송 되게 하는 핵심)
WHIP **시그널링**은 Apache가 8889로 프록시하지만, **미디어는 UDP로 서버에 직접** 간다. MediaMTX WebRTC ICE 포트를 열어야 함.

`mediamtx.yml`에 공인 IP를 알려주고:
```yaml
webrtcAdditionalHosts: [34.104.233.35]
# webrtcLocalUDPAddress: :8189   # 기본값
```
방화벽:
```bash
gcloud compute firewall-rules create centbeam-webrtc \
  --allow udp:8189 --source-ranges 0.0.0.0/0 2>/dev/null || echo exists
```
MediaMTX 재시작 후 적용.

---

## 7. 검증
```bash
curl -sI https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html   # 200
curl -s  https://참교육카지노.info/ -o /dev/null -w "%{http_code}\n"  # 참교육 사이트 살아있나 확인(그대로 200)
```
- 폰 브라우저로 `https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html` → 카메라 허용(HTTPS) → 홈화면 추가(PWA)
- 스튜디오 WHIP 엔드포인트: `https://studio.xn--9d0bw2fjtyymch7de9d.info/whip/tak/whip`
- 방송 시작 → 참교육카지노 path(tak 등)로 송출 확인

---

## 8. 요약 — 사용자님이 하실 것 (2개만)
1. **Cloudflare DNS 한 줄** (§1, 토큰 필요, proxied:false).
2. **서버 SSH → §3~6 복붙** (도메인 이미 박혀 있음, 치환 불필요).

> 저는 Cloudflare 토큰·서버 로그인이 없어 1·2를 대신 실행 못 함. 명령어는 전부 준비됨.

---

## 9. 다른 세션에 넘길 브리핑 (그대로 복붙)
```
서버: 참교육카지노 서버 34.104.233.35 (GCP my-site-1, asia-northeast1-a).
      이미 Apache가 80/443에서 참교육카지노.info 호스팅 중 + MediaMTX(1935/8888/8889) 구동중.
목표: studio.참교육카지노.info(xn--9d0bw2fjtyymch7de9d.info) 서브도메인으로 센트빔 스튜디오 HTTPS 배포.
DNS: Cloudflare, Zone 7e5faed2d3d4d6da7aceb4ddde81a62b, studio A→34.104.233.35 proxied:false.

🚨 절대 Caddy 쓰지 말 것 — 80/443은 Apache가 이미 씀. Caddy 올리면 참교육카지노 사이트 죽음.
   → Apache에 studio vhost 추가(ProxyPass /whip→8889 /hls→8888 /api→3000) + certbot --apache 로 SSL.
   → 참교육카지노.info vhost는 절대 건드리지 말 것.
WebRTC: mediamtx webrtcAdditionalHosts:[34.104.233.35] + 방화벽 udp:8189 열기.
스튜디오 파일: 이 저장소 client/ (studio.html 단일). docs/DEPLOYMENT.md 참고.
```
