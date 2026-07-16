# 배포 — 서브도메인 + HTTPS + 릴레이

> 목표: `studio.centsolution.com` 서브도메인으로 센트빔을 HTTPS 배포한다.
> **왜 필요한가**: 폰 브라우저는 **보안 컨텍스트(HTTPS)**가 아니면 카메라/마이크(`getUserMedia`)를 차단한다. IP+HTTP로는 방송이 불가능하다. 또 Google OAuth는 HTTPS 리다이렉트 URI만 허용한다.

> `centsolution.com`은 **실제 Cent Solution 소유 도메인으로 치환**한다(예: `.co.kr`이면 그에 맞게). 아래는 apex가 `centsolution.com`, 서브가 `studio.` 인 경우.

---

## 1. DNS — 서브도메인 A 레코드

Cent Solution 도메인 DNS 관리에서:

| 타입 | 이름 | 값 | TTL |
|--|--|--|--|
| A | `studio` | `34.101.223.165` (릴레이 서버 공인 IP) | 300 |

→ `studio.centsolution.com` 이 서버를 가리키게 된다. (전파 몇 분~수십 분)

확인:
```bash
dig +short studio.centsolution.com     # 34.101.223.165 나와야 함
```

---

## 2. 방화벽 (GCP)

```bash
gcloud compute firewall-rules create centbeam-web \
  --allow tcp:80,tcp:443,tcp:1935 --source-ranges 0.0.0.0/0 2>/dev/null || echo exists
```
- 80/443: Caddy(HTTPS). 1935: RTMP 인제스트.
- 8888/8889/3000은 **직접 노출하지 않고** Caddy 뒤로 둔다.

---

## 3. Caddy — 자동 HTTPS 리버스프록시

Caddy는 Let's Encrypt 인증서를 자동 발급/갱신한다.

```bash
# 설치 (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:
```caddyfile
studio.centsolution.com {
    encode gzip

    # 정적 클라이언트 (studio.html 등)
    root * /opt/centbeam/client
    file_server

    # 관리 API
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }

    # WHIP 인제스트 (WebRTC signaling) → MediaMTX :8889
    handle /whip/* {
        uri strip_prefix /whip
        reverse_proxy 127.0.0.1:8889
    }

    # HLS 재생 → MediaMTX :8888
    handle /hls/* {
        uri strip_prefix /hls
        reverse_proxy 127.0.0.1:8888
    }
}
```
```bash
sudo systemctl reload caddy
```

→ 접속: `https://studio.centsolution.com/studio.html`
→ WHIP 엔드포인트(클라이언트 속성 패널): `https://studio.centsolution.com/whip/<avatar>/whip`
> 경로 매핑은 MediaMTX WHIP 경로 규칙(`/<path>/whip`)에 맞춘다. Caddy가 `/whip` 프리픽스를 떼고 8889로 넘긴다.

---

## 4. 릴레이 데몬 (PM2)

```bash
sudo mkdir -p /opt/centbeam && sudo chown $USER /opt/centbeam
# 저장소 배치 (client/ server/)
cd /opt/centbeam/server
npm install
mkdir -p data && cp destinations.example.json data/destinations.json   # 실 대상 편집

pm2 delete centbeam-web centbeam-mtx 2>/dev/null || true
pm2 start server.js --name centbeam-web
pm2 start mediamtx --name centbeam-mtx -- /opt/centbeam/server/mediamtx.yml
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
```

`mediamtx.yml`의 `runOnReady` 경로가 `/opt/centbeam/server/fanout.sh`인지 확인.

---

## 5. 검증

```bash
curl -s https://studio.centsolution.com/api/health          # {"ok":true,...}
# 폰 Safari/Chrome 로 https://studio.centsolution.com/studio.html 접속 → 카메라 허용됨(HTTPS라서)
# 홈화면에 추가 → PWA 아이콘
```

송출 테스트:
```bash
ffmpeg -re -i sample.mp4 -c copy -f flv rtmp://studio.centsolution.com:1935/tak
```

---

## 6. OAuth 리다이렉트 (YouTube 로그인 붙일 때)

Google Cloud Console → OAuth 클라이언트 → 승인된 리디렉션 URI:
```
https://studio.centsolution.com/api/auth/callback/google
```
- HTTPS 필수(그래서 서브도메인이 먼저 있어야 함).
- 스코프는 최소로(RFC 9700). 스트림키 발급엔 `youtube` 스코프.

---

## 7. 체크리스트 연동

이 배포로 다음 항목이 충족된다:
- Q291 HTTPS 전 구간 · Q300 CORS/CSP(부분) · B PWA(HTTPS 전제)
- S309 Wake Lock 등 모바일 기능은 HTTPS 위에서만 API 사용 가능
