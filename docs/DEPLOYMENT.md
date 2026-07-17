# 배포 — 참교육카지노(videowatch) 서버에 서브도메인 + HTTPS

> 목표: 참교육카지노 서버(**34.104.233.35**, 이미 MediaMTX 구동 중)에 센트빔 스튜디오를 서브도메인 `studio.<도메인>` 으로 HTTPS 배포한다.
> **왜 HTTPS**: 폰 브라우저는 보안 컨텍스트(HTTPS)가 아니면 카메라/마이크를 차단한다. IP+HTTP로는 방송 불가.

> ⚠️ **제가(AI) 직접 못 하는 것 2개 — 사용자님이 하셔야 함**
> 1. **실제 도메인 이름**: 아래 `<도메인>`을 참교육카지노가 쓰는 실제 도메인으로 바꿔야 함 (예: `videowatch.show`).
> 2. **DNS A 레코드 추가**: 도메인 등록업체(가비아/Cloudflare/GoDaddy 등) 로그인이 필요 — 저는 접근 불가. 아래 표대로 한 줄 추가하면 됨.
> 나머지(서버 세팅·Caddy·검증)는 그대로 복붙 가능.

---

## 0. 사전 — 이 서버 상태
참교육카지노 서버(34.104.233.35)에는 이미:
- MediaMTX 구동 (RTMP :1935, HLS :8888, WHIP :8889), 4 아바타 path 등록됨 (tak/deny/jay/ddoki)
→ 그래서 **미디어 서버는 이미 있음**. 여기선 (a) 스튜디오 정적 파일 배치 + (b) Caddy HTTPS만 얹으면 된다.

---

## 1. DNS — 서브도메인 A 레코드  ← 사용자님이 등록업체에서 추가

| 타입 | 이름(host) | 값 | TTL |
|--|--|--|--|
| A | `studio` | `34.104.233.35` | 300 |

→ `studio.<도메인>` 이 참교육카지노 서버를 가리키게 된다. (전파 몇 분~수십 분)

확인 (전파 후):
```bash
dig +short studio.<도메인>      # 34.104.233.35 나와야 함
```

---

## 2. 방화벽 (GCP) — 참교육카지노 서버

```bash
gcloud compute firewall-rules create centbeam-web \
  --allow tcp:80,tcp:443 --source-ranges 0.0.0.0/0 2>/dev/null || echo exists
# 1935(RTMP)는 참교육카지노용으로 이미 열려 있음
```
- 80/443: Caddy(HTTPS). 8888/8889/3000은 직접 노출하지 않고 Caddy 뒤로 둔다.

---

## 3. 스튜디오 파일 배치 (34.104.233.35 안에서)

```bash
sudo mkdir -p /opt/centbeam && sudo chown $USER /opt/centbeam
cd /opt/centbeam
# 저장소에서 client/ server/ 가져오기 (git clone 또는 scp)
#   예: git clone <이 저장소> . 하거나, client/ 폴더만 올려도 됨

# (선택) 대상 CRUD API 쓰려면 server 도 실행
cd server && npm install && mkdir -p data
cp destinations.example.json data/destinations.json
pm2 start server.js --name centbeam-web && pm2 save
```
> MediaMTX 는 이미 돌고 있으니 재설치 불필요. `mediamtx.yml`의 `runOnReady`가 fanout.sh를 부르는지만 확인.

---

## 4. Caddy — 자동 HTTPS (Let's Encrypt)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile` — `<도메인>` 을 실제 도메인으로 치환:
```caddyfile
studio.<도메인> {
    encode gzip
    root * /opt/centbeam/client
    file_server

    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    # WHIP 인제스트 → 로컬 MediaMTX :8889
    handle /whip/* {
        uri strip_prefix /whip
        reverse_proxy 127.0.0.1:8889
    }
    # HLS 재생 → 로컬 MediaMTX :8888
    handle /hls/* {
        uri strip_prefix /hls
        reverse_proxy 127.0.0.1:8888
    }
}
```
```bash
sudo systemctl reload caddy
```

→ 접속: `https://studio.<도메인>/studio.html`
→ WHIP 엔드포인트(스튜디오 속성 패널): `https://studio.<도메인>/whip/tak/whip`

---

## 5. 검증

```bash
curl -s https://studio.<도메인>/api/health         # {"ok":true,...} (server.js 실행 시)
# 폰 브라우저로 https://studio.<도메인>/studio.html → 카메라 허용됨(HTTPS라서) → 홈화면 추가(PWA)
```

송출 테스트(로컬 파일 → 참교육카지노 path):
```bash
ffmpeg -re -i sample.mp4 -c copy -f flv rtmp://34.104.233.35:1935/tak
```

---

## 6. (선택) OAuth 리다이렉트 — YouTube 로그인 붙일 때
Google Cloud Console → OAuth 클라이언트 → 승인된 리디렉션 URI:
```
https://studio.<도메인>/api/auth/callback/google
```
HTTPS 필수라 서브도메인이 먼저 있어야 함. 스코프 최소(RFC 9700).

---

## 7. 요약 — 지금 사용자님이 할 일 순서
1. 참교육카지노가 쓰는 **실제 도메인 이름** 확정.
2. 등록업체에서 **`studio` A 레코드 → 34.104.233.35** 추가 (§1).
3. 참교육카지노 서버 SSH → §2~4 복붙 (`<도메인>` 치환).
4. 폰에서 `https://studio.<도메인>/studio.html` 접속 → 방송.

> 이 중 1·2번만 사용자님 손이 필요하고, 3·4는 명령어 그대로입니다.
