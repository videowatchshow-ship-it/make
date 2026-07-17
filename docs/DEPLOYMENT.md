# 배포 — 참교육카지노(videowatch) 서버에 서브도메인 + HTTPS

> 목표: 참교육카지노 서버(**34.104.233.35**, 이미 MediaMTX 구동 중)에 센트빔 스튜디오를 서브도메인 **`studio.xn--9d0bw2fjtyymch7de9d.info`** (참교육카지노.info) 으로 HTTPS 배포한다.
> **왜 HTTPS**: 폰 브라우저는 보안 컨텍스트(HTTPS)가 아니면 카메라/마이크를 차단한다. IP+HTTP로는 방송 불가.

> ✅ **도메인 확정**: `참교육카지노.info` = `xn--9d0bw2fjtyymch7de9d.info`, **이미 등록됨 · Cloudflare DNS 사용 중** (apex → Cloudflare IP 확인). 이 문서엔 실제 도메인이 이미 박혀 있으니 **치환 없이 복붙** 하면 된다.
>
> ⚠️ **제가(AI) 직접 못 하는 것 1개 — 사용자님이 하셔야 함**: **Cloudflare에 `studio` DNS 레코드 추가** (§1). Cloudflare 로그인이 필요해 저는 접근 불가. 그 한 줄 + 서버 SSH만 사용자님이 하시면 나머지는 그대로 복붙.

---

## 0. 사전 — 이 서버 상태
참교육카지노 서버(34.104.233.35)에는 이미:
- MediaMTX 구동 (RTMP :1935, HLS :8888, WHIP :8889), 4 아바타 path 등록됨 (tak/deny/jay/ddoki)
→ 그래서 **미디어 서버는 이미 있음**. 여기선 (a) 스튜디오 정적 파일 배치 + (b) Caddy HTTPS만 얹으면 된다.

---

## 1. DNS — Cloudflare에 `studio` 레코드 추가  ← 사용자님이 직접

Cloudflare 대시보드 → `참교육카지노.info` 선택 → **DNS → Records → Add record**:

| Type | Name | IPv4 address | Proxy status | TTL |
|--|--|--|--|--|
| A | `studio` | `34.104.233.35` | **🔘 DNS only (회색 구름, 프록시 OFF)** | Auto |

> ⚠️ **가장 중요 — 프록시(주황 구름)를 반드시 끄세요(DNS only).**
> Cloudflare 프록시가 켜져 있으면 (1) Caddy의 Let's Encrypt 인증서 발급이 Cloudflare SSL과 충돌하고, (2) **WebRTC(WHIP) 송출이 프록시를 못 통과**해 방송이 안 됩니다. 회색 구름(DNS only)이어야 Caddy가 직접 인증서 받고 WebRTC가 직통으로 됩니다.

→ `studio.xn--9d0bw2fjtyymch7de9d.info` 이 34.104.233.35를 직접 가리킴. (전파 1~5분)

확인 (전파 후):
```bash
dig +short studio.xn--9d0bw2fjtyymch7de9d.info      # 34.104.233.35 나와야 함 (Cloudflare IP면 프록시 아직 켜진 것)
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

`/etc/caddy/Caddyfile` — `xn--9d0bw2fjtyymch7de9d.info` 을 실제 도메인으로 치환:
```caddyfile
studio.xn--9d0bw2fjtyymch7de9d.info {
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

→ 접속: `https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html`
→ WHIP 엔드포인트(스튜디오 속성 패널): `https://studio.xn--9d0bw2fjtyymch7de9d.info/whip/tak/whip`

---

## 5. 검증

```bash
curl -s https://studio.xn--9d0bw2fjtyymch7de9d.info/api/health         # {"ok":true,...} (server.js 실행 시)
# 폰 브라우저로 https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html → 카메라 허용됨(HTTPS라서) → 홈화면 추가(PWA)
```

송출 테스트(로컬 파일 → 참교육카지노 path):
```bash
ffmpeg -re -i sample.mp4 -c copy -f flv rtmp://34.104.233.35:1935/tak
```

---

## 6. (선택) OAuth 리다이렉트 — YouTube 로그인 붙일 때
Google Cloud Console → OAuth 클라이언트 → 승인된 리디렉션 URI:
```
https://studio.xn--9d0bw2fjtyymch7de9d.info/api/auth/callback/google
```
HTTPS 필수라 서브도메인이 먼저 있어야 함. 스코프 최소(RFC 9700).

---

## 7. 요약 — 지금 사용자님이 할 일 순서
1. ~~도메인 확정~~ ✅ 완료 (`참교육카지노.info`, Cloudflare).
2. **Cloudflare에 `studio` A 레코드 → 34.104.233.35, 프록시 OFF(회색 구름)** 추가 (§1). ← 유일하게 남은 "사용자님만 가능"
3. 참교육카지노 서버(34.104.233.35) SSH → §2~4 **그대로 복붙** (치환 불필요).
4. 폰에서 `https://studio.xn--9d0bw2fjtyymch7de9d.info/studio.html` 접속 → 방송.

> 2번(Cloudflare 한 줄)만 사용자님 손이 필요하고, 3·4는 명령어 그대로입니다.
> 저는 Cloudflare/서버 로그인이 없어 2·3을 대신 실행할 수 없습니다 — 명령어는 다 준비돼 있습니다.
