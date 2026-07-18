# 서버 — 센트빔 릴레이 (`server/`)

> WHIP/RTMP 인제스트를 받아 여러 플랫폼으로 fan-out 하는 릴레이. **MediaMTX + `fanout.sh` + Express API** 3요소.
> 클라이언트와는 **프로토콜(WHIP/RTMP)로만** 결합 — 센트빔/OBS/PRISM 무엇이든 스트림키만 맞으면 받는다.

```
[WHIP :8889 / RTMP :1935]  →  MediaMTX  ──runOnReady──▶  fanout.sh <avatar>
                                  │                          │  destinations.json[<avatar>][]
                                  │                          ├─▶ ffmpeg -c copy      → YouTube
                                  │ HLS :8888 (모니터)         ├─▶ ffmpeg -c copy      → Twitch
                                  ▼                          └─▶ ffmpeg 재인코딩(프로파일) → Facebook
                          [Apache /api → :3000 Express]  ← destinations CRUD · OAuth 교환
```

---

## 1. 구성 파일

| 파일 | 역할 |
|--|--|
| `mediamtx.yml` | MediaMTX 설정. WHIP:8889 / RTMP:1935 / HLS:8888 수신, publish 시 `fanout.sh` 호출, internal auth |
| `fanout.sh` | 한 아바타로 publish되면 `data/destinations.json`의 모든 대상으로 FFmpeg fan-out(패스스루/재인코딩) |
| `server.js` | Express API — destinations CRUD + 헬스체크 + OAuth(YouTube/Twitch/Facebook) code→token 교환 |
| `destinations.example.json` | 대상 목록 예시 (복사해서 `data/destinations.json` 생성) |
| `platforms.json` | 플랫폼별 ingest URL 프리셋 (프론트 대상 추가 UI용) |
| `deploy.sh` | 원클릭 서버 배포(멱등): 파일배치 + Apache vhost + certbot + **릴레이 API systemd 기동** |
| `package.json` | `express` 단일 의존성 |

---

## 2. 환경 변수

| 변수 | 기본값 | 사용처 | 설명 |
|--|--|--|--|
| `PORT` | `3000` | server.js | API 리슨 포트 (Apache가 `/api/` → 여기로 프록시) |
| `RATE_MAX` | `60` | server.js | IP당 분당 요청 한도(초과 429) |
| `DEST_FILE` | `<dir>/data/destinations.json` | server.js·fanout.sh | 대상 목록 경로. 프로덕션은 `/opt/centbeam/server/data/destinations.json` 로 3파일 일치 |
| `LOG_DIR` | `/opt/centbeam/server/data` | fanout.sh | fan-out 로그 디렉터리 |
| `OAUTH_SECRET_FILE` | `/var/secrets/oauth-nodetube.json` | server.js | Google/YouTube OAuth 클라이언트 시크릿(JSON) |
| `TWITCH_SECRET_FILE` | `/var/secrets/oauth-twitch.json` | server.js | Twitch OAuth 시크릿 |
| `FB_SECRET_FILE` | `/var/secrets/oauth-facebook.json` | server.js | Facebook OAuth 시크릿 |
| `MTX_AUTHINTERNALUSERS_0_USER` / `_PASS` | — | MediaMTX | **publish 자격증명 주입**(아래 §6). YAML `${}` 치환은 MediaMTX가 지원하지 않으므로 반드시 env 로 |

> 시크릿 파일 포맷: `{"client_id":"…","client_secret":"…"}` 또는 Google 다운로드형 `{"web":{…}}`. 파일 권한 0600, 저장소에 커밋 금지.

---

## 3. 로컬 실행 (API만)

```bash
cd server
npm install
mkdir -p data && cp destinations.example.json data/destinations.json
node server.js            # http://localhost:3000/api/health
```

MediaMTX는 별도 바이너리:
```bash
wget -qO- https://github.com/bluenviron/mediamtx/releases/download/v1.19.2/mediamtx_v1.19.2_linux_amd64.tar.gz | tar xz
sudo mv mediamtx /usr/local/bin/
MTX_AUTHINTERNALUSERS_0_USER=publisher MTX_AUTHINTERNALUSERS_0_PASS='강한비밀' mediamtx ./mediamtx.yml
```

---

## 4. 프로덕션 배포

원클릭(멱등) — 파일배치·Apache vhost·certbot·**릴레이 API를 systemd 서비스(`centbeam-api`)로 상시 기동**까지:

```bash
sudo bash server/deploy.sh
# 원격 한 방(맥):
gcloud compute ssh my-site-1 --zone=asia-northeast1-a --command \
 'rm -rf /tmp/cb && git clone -b claude/sleepy-goodall-per69w https://github.com/videowatchshow-ship-it/make.git /tmp/cb && sudo bash /tmp/cb/server/deploy.sh'
```

- API는 `systemctl status centbeam-api` / 로그 `journalctl -u centbeam-api` 로 관리(Restart=always, 재부팅 자동기동).
- Apache가 80/443 선점 → **Caddy 쓰지 말 것**. `deploy.sh`가 `panda-avata.cc` vhost만 추가(보안헤더·HSTS·X-Frame-Options 포함).
- WebRTC 미디어(UDP 8189)는 GCP 방화벽에서 개방:
  `gcloud compute firewall-rules create centbeam-webrtc --allow udp:8189 --source-ranges 0.0.0.0/0`
- 전체 절차 → **[../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)**

---

## 5. API 레퍼런스

### 대상(destinations)
| 메서드 | 경로 | 설명 |
|--|--|--|
| GET | `/api/health` | `{ok:true,ts}` |
| GET | `/api/avatars` | `[{name,count}]` |
| GET | `/api/destinations` | 전체 맵 |
| GET | `/api/destinations/:avatar` | 아바타 대상 배열 |
| POST | `/api/destinations/:avatar` | 대상 추가(아래 바디) |
| DELETE | `/api/destinations/:avatar/:idx` | 대상 삭제 (`locked:true`면 403) |

POST 바디:
```jsonc
{
  "platform": "youtube", "name": "메인", "rtmpUrl": "rtmp://…", "streamKey": "…",
  "locked": false,          // true면 API 삭제 불가(필수 대상 보호)
  "enabled": true,          // false면 fan-out 건너뜀
  // ── 재인코딩 프로파일(지정 시 해당 대상만 재인코딩, 없으면 -c copy 패스스루) ──
  "bitrate": 6000,          // kbps
  "resolution": "1280x720", // WxH
  "preset": "veryfast",     // ultrafast~veryslow
  "gop": 2,                 // 키프레임 간격(초, 1~10)
  "rateControl": "cbr",     // cbr | vbr  (cbr는 bitrate 필수)
  "bframes": 0              // 0~3
}
```

### OAuth (Authorization Code + PKCE, RFC 9700)
| 메서드 | 경로 | 설명 |
|--|--|--|
| GET | `/api/oauth/config?provider=google\|twitch\|facebook` | `{configured, clientId}` (시크릿 미노출) |
| POST | `/api/oauth/exchange` | `{code,redirectUri,codeVerifier,provider}` → 서버가 code→token 교환, 스트림키 조회, `refresh_token`은 서버 0600 보관, 프론트엔 `{email,name,streamKey}` 최소 반환 |

---

## 6. fan-out 동작

1. 클라이언트/OBS가 `…:8889/<avatar>/whip`(WHIP) 또는 `rtmp://…:1935/<avatar>` 로 publish.
2. MediaMTX `runOnReady` → `fanout.sh <avatar>`.
3. 각 대상마다 — 프로파일 없으면 **무손실 패스스루**, 있으면 **재인코딩**:
   ```bash
   # 패스스루 (입력 인코딩이 곧 출력, H.264/AAC 전제)
   ffmpeg -i rtmp://127.0.0.1:1935/<avatar> -c copy -f flv <rtmpUrl>/<streamKey>
   # 재인코딩 (대상별 프로파일: 예 CBR 6000k / 720p / gop 2s)
   ffmpeg -i … -c:v libx264 -preset veryfast -s 1280x720 \
     -b:v 6000k -minrate 6000k -maxrate 6000k -bufsize 6000k -x264-params nal-hrd=cbr:force-cfr=1 \
     -force_key_frames 'expr:gte(t,n_forced*2)' -g 120 -sc_threshold 0 -bf 0 \
     -c:a aac -b:a 128k -f flv <rtmpUrl>/<streamKey>
   ```
   > 라이브 입력에는 `-re` 를 쓰지 않는다(FFmpeg 공식: 패킷손실/지연 유발).
4. 빈 키/`PUT_KEY_HERE`/`enabled:false` 대상은 건너뜀. 로그는 스트림키 없이 URL만 기록.

---

## 7. 보안 (구현 · 근거)

| 항목 | 구현 | 근거 |
|--|--|--|
| WHIP publish 인증 | `Authorization: Bearer user:pass` | RFC 9725 |
| MediaMTX publish 자격증명 | `MTX_AUTHINTERNALUSERS_0_USER/PASS` env(YAML `${}` 미지원) | MediaMTX 문서 |
| 프록시 뒤 실 IP 레이트리밋 | `app.set('trust proxy','loopback')` + 분당 60 | OWASP API4 |
| 보안 응답 헤더 | nosniff·X-Frame-Options·Referrer-Policy·HSTS·Permissions-Policy | MDN / OWASP Secure Headers |
| 자격증명 저장 | `refresh_token` 서버 0600, 프론트 미전달, 시크릿 비커밋 | OWASP MASVS-STORAGE |
| 로그 위생 | 스트림키 로그 미기록 | OWASP MASVS-STORAGE |

체크리스트 R(331–350) + 감사(351~400) 참고.

---

## 8. 운영 노트

- 패스스루는 입력 인코딩이 곧 모든 대상 출력 — 대상별 다른 해상도/비트레이트는 위 프로파일로 재인코딩(CPU 비용 발생).
- `data/*.log`·`data/destinations.json`·`data/*-token-*.json`은 **비커밋**. 예시(`destinations.example.json`)만 커밋.
- FFmpeg 로그 증가 → `logrotate` 권장. 디스크 부족 시 오래된 `data/*.log` 삭제.
- MediaMTX/FFmpeg는 별도 프로세스 — `deploy.sh`는 API(systemd)만 관리하고 MediaMTX 기동 여부는 포트로 점검한다.
