# 서버 — 센트빔 릴레이 (`server/`)

> RTMP/WHIP를 받아 여러 대상으로 재인코딩 없이 fan-out 하는 릴레이. **MediaMTX + fanout.sh + Express API** 3요소.

---

## 1. 구성 파일

| 파일 | 역할 |
|--|--|
| `mediamtx.yml` | MediaMTX 설정. RTMP:1935 / WHIP:8889 / HLS:8888 수신, publish 시 `fanout.sh` 호출 |
| `fanout.sh` | 한 아바타로 publish되면 `destinations.json`의 모든 대상으로 FFmpeg fan-out |
| `server.js` | Express API — `destinations.json` CRUD + 헬스체크 (미디어 미관여) |
| `destinations.example.json` | 대상 목록 예시 (복사해서 `data/destinations.json` 생성) |
| `package.json` | express 의존성 |

---

## 2. 로컬 실행 (API만)

```bash
cd server
npm install
mkdir -p data && cp destinations.example.json data/destinations.json
node server.js            # http://localhost:3000/api/health
```

MediaMTX는 별도 바이너리로 실행:
```bash
# 설치 (Linux amd64, v1.19.2)
wget -qO- https://github.com/bluenviron/mediamtx/releases/download/v1.19.2/mediamtx_v1.19.2_linux_amd64.tar.gz | tar xz
sudo mv mediamtx /usr/local/bin/
mediamtx ./mediamtx.yml
```

---

## 3. API

| 메서드 | 경로 | 설명 |
|--|--|--|
| GET | `/api/health` | `{ok:true,ts}` |
| GET | `/api/avatars` | `[{name,count}]` |
| GET | `/api/destinations` | 전체 맵 |
| GET | `/api/destinations/:avatar` | 아바타 대상 배열 |
| POST | `/api/destinations/:avatar` | 대상 추가 `{platform,name,rtmpUrl,streamKey,locked?}` |
| DELETE | `/api/destinations/:avatar/:idx` | 대상 삭제 (`locked:true`면 403) |

> `locked:true` 대상은 API로 삭제 불가 — "절대 빠지면 안 되는 필수 대상"을 보호한다.

---

## 4. 송출 흐름

1. 클라이언트/OBS가 `rtmp://<host>:1935/<avatar>` 또는 `http://<host>:8889/<avatar>/whip` 로 publish.
2. MediaMTX `runOnReady` → `fanout.sh <avatar>`.
3. `fanout.sh`가 `destinations.json[<avatar>]`의 각 대상마다:
   ```
   ffmpeg -re -i rtmp://127.0.0.1:1935/<avatar> -c copy -f flv <rtmpUrl>/<streamKey>
   ```
4. `PUT_KEY_HERE`이거나 빈 키인 대상은 건너뛴다.
5. 로그: `data/<avatar>.log`.

---

## 5. 배포 (요약)

프로덕션은 PM2 데몬 + Caddy(HTTPS). 참교육카지노 서버(34.104.233.35)에 서브도메인 `studio.xn--9d0bw2fjtyymch7de9d.info`.

```bash
pm2 start server.js --name centbeam-web
pm2 start mediamtx --name centbeam-mtx -- ./mediamtx.yml
pm2 save
```
전체 단계(DNS·Caddy·방화벽)는 → **[../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)**

---

## 6. 보안 TODO (공식 표준 근거)

| 항목 | 근거 |
|--|--|
| WHIP publish Bearer 인증 | RFC 9725 |
| MediaMTX `publishUser`/`publishPass` 또는 비밀 경로 | MediaMTX 인증 |
| 스트림키 평문 저장 지양 → 암호화/시크릿 매니저 | OWASP MASVS-STORAGE |
| 로그에 스트림키 미기록 | OWASP MASVS-STORAGE |
| API 레이트리밋 | OWASP API Top10 (API4) |
| CORS 최소화 + 보안 헤더 | MDN / OWASP Secure Headers |

체크리스트 R(331–350) 참고.

---

## 7. 운영 노트

- 재인코딩 없음(`-c copy`) → 입력 인코딩이 곧 모든 대상 출력. 대상별 다른 해상도 필요 시 재인코딩 분기 추가.
- `data/*.log`, `data/destinations.json`은 `.gitignore` 대상(로그)·비커밋(실데이터). 예시만 커밋한다.
- 디스크: FFmpeg 로그가 커질 수 있으니 logrotate 권장.
