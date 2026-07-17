<div align="center">

# ◭ 센트빔 CENTBEAM

**하나의 방송을 모든 곳으로 — 모바일 우선 멀티스트리밍 스튜디오**

한 번 송출하면 서버가 여러 플랫폼(YouTube·Facebook·Twitch·자체 사이트 등)으로 동시에 뿌리는(fan-out) 라이브 스튜디오. PRISM/OBS의 씬 합성 경험을 브라우저(PWA)로 구현한다.

![status](https://img.shields.io/badge/stage-alpha-orange) ![license](https://img.shields.io/badge/license-proprietary-black) ![client](https://img.shields.io/badge/client-PWA-blue) ![server](https://img.shields.io/badge/relay-MediaMTX%2BFFmpeg-informational)

</div>

---

## 1. 이게 뭔가 (30초 요약)

- **문제**: 아바타(방송자)마다 여러 채널에 동시 송출하려면 업로드 대역폭이 채널 수만큼 필요하고, 관리가 지옥이다.
- **해결**: 클라이언트는 **서버 한 곳**으로만 송출한다. 서버가 재인코딩 없이(`-c copy`) 여러 대상으로 **fan-out** 한다 (Restream.io 방식).
- **클라이언트**: 브라우저에서 카메라·화면·이미지·텍스트를 캔버스에 합성 → WHIP(WebRTC)로 서버에 송출. 설치형 PWA라 앱스토어 심사 없이 폰 홈화면에 깔린다.

```
[폰/PC 브라우저: 센트빔 스튜디오]
   카메라+화면+이미지+텍스트 → 캔버스 합성
              │  WHIP (WebRTC) 또는 RTMP
              ▼
      [CENTBEAM 릴레이 서버]
        MediaMTX → fanout.sh (FFmpeg -c copy)
              │
      ┌───────┼───────┬─────────────┐
      ▼       ▼       ▼             ▼
  YouTube  Facebook  Twitch   자체 사이트(RTMP)
```

---

## 2. 저장소 구조 (파트 분리)

| 경로 | 파트 | 설명 | 문서 |
|--|--|--|--|
| `client/` | **스튜디오(클라이언트)** | 브라우저 씬 컴포저 + WHIP 송출. 단일 파일 `studio.html` (빌드 불필요). | [client/README.md](client/README.md) |
| `server/` | **릴레이(서버)** | MediaMTX + `fanout.sh` + Express API. RTMP/WHIP 수신 → 다중 대상 fan-out. | [server/README.md](server/README.md) |
| `docs/` | **문서** | 아키텍처·배포·기여·용어. | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `legacy/` | **레거시(범위 밖)** | 피벗 이전 계정관리 도구. 센트빔과 무관, 참고용 보관. | [legacy/README.md](legacy/README.md) |
| `CENTBEAM_PARITY_CHECKLIST.md` | **품질 기준** | PRISM 모바일 동등성 350개 체크리스트 + 감사 결과. | — |

> **설계 원칙**: 클라이언트와 서버는 **프로토콜(WHIP/RTMP)로만** 결합한다. 서버는 어떤 클라이언트(센트빔 스튜디오/OBS/PRISM 앱)든 스트림키만 맞으면 받는다.

---

## 3. 빠른 시작

### 클라이언트 (로컬)
```bash
# 빌드 없음. 브라우저로 열기만.
open client/studio.html          # macOS
# 또는 파일을 브라우저에 드래그
```
> ⚠️ 폰에서 네트워크로 접속해 카메라를 쓰려면 **HTTPS 필수**. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 참고.

### 서버 (릴레이)
```bash
cd server
npm install
cp destinations.example.json data/destinations.json   # 대상 설정
node server.js                    # API :3000
# MediaMTX 는 별도 실행 (server/README.md 참고)
```

전체 배포(참교육카지노 서버 `34.104.233.35`에 서브도메인 `studio.xn--9d0bw2fjtyymch7de9d.info` + HTTPS)는 → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## 4. 기술 스택

| 파트 | 스택 |
|--|--|
| 클라이언트 | Vanilla JS + Canvas 2D + WebRTC(WHIP) + `getUserMedia`/`getDisplayMedia`. 의존성 0, 단일 HTML. |
| 서버 | Node 22 (LTS) + Express 5, MediaMTX v1.19.2, FFmpeg, PM2, Caddy(HTTPS) |
| 배포 | 참교육카지노 서버(34.104.233.35) + Cloudflare DNS, 서브도메인 `studio.참교육카지노.info` + Caddy HTTPS |

버전 근거·검증은 [docs/ARCHITECTURE.md §기술 결정](docs/ARCHITECTURE.md) 참고 (2026-07 실측).

---

## 5. 로드맵 / 완성도

현재 완성도는 **[CENTBEAM_PARITY_CHECKLIST.md](CENTBEAM_PARITY_CHECKLIST.md)** 로 추적한다 (350항목, PRISM 모바일 기준).

우선순위:
1. 모바일 반응형 셸 (폰에서 캔버스 최대화 + 하단 액션바)
2. 오디오 엔진 (WebAudio 믹서: 볼륨·뮤트·미터·BGM·노이즈억제)
3. 인코딩 제어 (비트레이트·FPS·재연결)
4. 화면 조정 심화 (크롭·불투명도·색보정)
5. PWA 완성 + 대상 on/off 패널
6. 보안 (WHIP Bearer·스트림키 암호저장·CSP — 체크리스트 R 참고)

---

## 6. 개발 규칙

- 브랜치: `claude/*` 피처 브랜치에서 개발 → PR(draft).
- 커밋: 무엇을/왜. 파트 접두어 권장 (`client:`, `server:`, `docs:`).
- 상세: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

## 7. 라이선스

Proprietary — © Cent Solution. 무단 배포 금지.
