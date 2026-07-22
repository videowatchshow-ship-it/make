<div align="center">

# ◭ 센트빔 CENTBEAM

**하나의 방송을 모든 곳으로 — 모바일 우선 멀티스트리밍 스튜디오**

한 번 송출하면 서버가 여러 플랫폼(YouTube·Facebook·Twitch·자체 사이트 등)으로 동시에 뿌리는(fan-out) 라이브 스튜디오.
PRISM/OBS의 씬 합성 경험을 **브라우저(PWA)** 로 구현했다. 설치·빌드 없이 폰에서 바로.

![status](https://img.shields.io/badge/parity-93%25%20(375%2F400·이행률96%25)-brightgreen) ![client](https://img.shields.io/badge/client-PWA%20단일HTML-blue) ![server](https://img.shields.io/badge/relay-MediaMTX%2BFFmpeg-informational) ![deploy](https://img.shields.io/badge/domain-panda--avata.cc-orange)

**라이브: [https://panda-avata.cc/studio.html](https://panda-avata.cc/studio.html)** (배포 후)

</div>

---

> **이 문서 하나로 전체를 이해한다.** 이 저장소는 README를 **딱 하나**만 둔다(이 파일). 세부 운영 문서(배포 절차·DNS·기여 규칙·용어·모바일 UX 감사·보안 30항목)는 `docs/`에 주제별로 나뉘어 있고, 아래 [8. 문서 모음](#8-문서-모음-docs)에서 전부 링크한다. 어떤 AI/사람이 이 파일만 읽어도 프로젝트 전체 구조·클라이언트 내부·서버 내부·배포 방법을 파악할 수 있도록 작성했다.

## 목차

1. [30초 요약](#1-30초-요약)
2. [저장소 구조](#2-저장소-구조)
3. [기능](#3-기능-구현-완료--전-항목-헤드리스-검증-콘솔-에러-0)
4. [빠른 시작](#4-빠른-시작)
5. [클라이언트 상세 — `studio.html`](#5-클라이언트-상세--studiohtml)
6. [서버 상세 — 릴레이](#6-서버-상세--릴레이)
7. [배포 (도메인: panda-avata.cc)](#7-배포-도메인-panda-avatacc)
8. [문서 모음 (`docs/`)](#8-문서-모음-docs)
9. [기술 스택](#9-기술-스택)
10. [완성도 / 개발 규칙](#10-완성도--개발-규칙)
11. [라이선스](#11-라이선스)

---

## 1. 30초 요약

- **문제**: 여러 채널에 동시 송출하려면 업로드 대역폭이 채널 수만큼 필요하고 관리가 지옥이다.
- **해결**: 클라이언트는 **서버 한 곳**으로만 송출 → 서버가 재인코딩 없이(`-c copy`) 여러 대상으로 **fan-out**.
- **클라이언트**: 브라우저 캔버스로 카메라·화면·이미지·텍스트·위젯을 합성 → **WHIP(WebRTC)** 로 서버 송출. 설치형 PWA라 앱스토어 심사 없이 폰 홈화면에 깔린다.

```
[폰/PC 브라우저: 센트빔 스튜디오]
   카메라+화면+이미지+텍스트+위젯 → 캔버스 합성 + WebAudio 믹서
              │  WHIP (WebRTC)  ·  https://panda-avata.cc/whip/<아바타>/whip
              ▼
      [CENTBEAM 릴레이 서버  34.104.233.35]
        MediaMTX → fanout.sh (FFmpeg -c copy, 재인코딩 없음)
              │
      ┌───────┼───────┬─────────────┐
      ▼       ▼       ▼             ▼
  YouTube  Facebook  Twitch   videowatch(자체 RTMP)
```

---

## 2. 저장소 구조

| 경로 | 파트 | 설명 |
|--|--|--|
| `client/studio.html` | **스튜디오** | 브라우저 씬 컴포저 + WHIP 송출. **단일 파일, 의존성 0, 빌드 불필요.** 상세: [§5](#5-클라이언트-상세--studiohtml) |
| `server/` | **릴레이** | MediaMTX + `fanout.sh` + Express API. RTMP/WHIP 수신 → 다중 대상 fan-out. 상세: [§6](#6-서버-상세--릴레이) |
| `server/deploy.sh` | **배포** | 서버 원클릭 배포(멱등): 파일배치 + Apache vhost + certbot SSL + jq/ffmpeg 설치. |
| `docs/` | **주제별 문서** | ARCHITECTURE / DEPLOYMENT / CLOUDFLARE_API / CONTRIBUTING / GLOSSARY / MOBILE_UX_PRISM / SECURITY_30. 색인: [§8](#8-문서-모음-docs) |
| `CENTBEAM_PARITY_CHECKLIST.md` | **품질 기준** | PRISM 모바일 동등성 400항목 감사 (현재 ✅375/93%, 이행률 96%). |
| `legacy/` | 범위 밖 | 피벗 이전 도구, 참고 보관 (자체 README 보유, 이 문서 범위 밖). |

> **설계 원칙**: 클라이언트와 서버는 **프로토콜(WHIP/RTMP)로만** 결합. 서버는 어떤 클라이언트(센트빔/OBS/PRISM)든 스트림키만 맞으면 받는다.

---

## 3. 기능 (구현 완료 — 전 항목 헤드리스 검증, 콘솔 에러 0)

**소스 (22종)**
카메라(전/후면·장치선택·전면미러·탭초점/노출/플래시)·화면공유(+시스템오디오)·이미지·비디오·텍스트·웹위젯·단색·시계·로워서드·카운트다운·게이지·채팅·스티커·프레임·이모지플로팅·투표·후원목록·BGM정보·데이터위젯(JSON)·오디오비주얼라이저·룰렛·슬라이드쇼

**효과/화면조정**
불투명도·좌우상하반전·색보정(밝기/대비/채도)·흐림·**크로마키**·필터프리셋(뷰티/빈티지/쿨/웜/흑백/비비드)·블렌드모드 7종·둥근모서리·테두리·그림자·화이트밸런스·모자이크·크롭·비율고정

**편집/제스처**
드래그·리사이즈·회전·**두손가락 핀치확대/회전**·정렬 6종·가이드(세이프존/그리드/눈금자/스냅)·z순서·**드래그 순서변경**·복제·잠금·숨김·다중선택·그룹화·균등배분·키보드 미세이동·**Undo/Redo**·롱프레스 메뉴·**다중 씬 + 페이드전환 + 숫자키**·씬 썸네일·템플릿 4종·**에디터 줌(핀치/휠 25~400%)**·패널 리사이즈

**오디오 (WebAudio 믹서)**
마이크/BGM 소스별 볼륨·뮤트·레벨미터 + 마스터 EQ 3밴드·컴프레서·리미터·**덕킹**·노이즈게이트·페이드·파형·클리핑경고·스테레오/모노·모니터링·싱크딜레이·**BGM 플레이리스트**·시스템오디오 캡처·Opus 비트레이트(SDP)·알림음

**송출/인코딩**
WHIP(WebRTC)·다중대상 fan-out·비트레이트·FPS(30/60)·레이트컨트롤·출력 다운스케일·코덱선호·자동재연결(지수백오프)·**워치독**·연결상태·드롭/재전송 통계·가용대역폭·방송요약·시작 카운트다운·BRB·**방송예약**·음성전용·로컬녹화·스냅샷·**PiP**·대상 on/off·WHIP Bearer 인증·랜덤 스트림경로 · **대상별 재인코딩 프로파일**(비트레이트·해상도·프리셋·키프레임간격·B프레임·**CBR/VBR**) · **플랫폼 로그인 연동**(YouTube·Facebook·Twitch OAuth, 스트림키/방송 제목·설명 자동 반영)

**모바일/PWA**
반응형 셸(하단 탭바·드로어)·태블릿 레이아웃·**Wake Lock**·저전력·방향잠금·스플래시·About·설치유도·풀스크린·몰입모드·라이트/고대비/**색약**/시스템 테마·강조색·햅틱·도움말·온보딩·오프라인 배너·네트워크/배터리 표시·스와이프 삭제·**다국어(한/영 전환·자동감지)**·manifest shortcuts

**보안**
**구글 의무 로그인(180일 롤링 세션)**·CSP·iframe sandbox·WHIP Bearer·랜덤경로·서버 레이트리밋·MediaMTX 인증·보안헤더·npm audit·로그 위생·시크릿 스캔 (근거: RFC 9725 / OWASP / MDN)

> 남은 항목(~14)은 대부분 **플랫폼 API/실시간 데이터**(실시간 시청자수, VOD, 멀티게스트 mesh)이거나 **실기기 검증**(발열/배터리 실측)이라 코드 단독으로는 닫히지 않는다. → [체크리스트](CENTBEAM_PARITY_CHECKLIST.md)

---

## 4. 빠른 시작

### 클라이언트 — 로컬에서 열기 (개발)
```bash
open client/studio.html        # macOS (또는 브라우저에 드래그)
```
> ⚠️ 폰에서 네트워크로 접속해 카메라를 쓰려면 **HTTPS 필수** (secure context). → [§7 배포](#7-배포-도메인-panda-avatacc).

### 서버 — 릴레이 API만 로컬 실행
```bash
cd server && npm install
mkdir -p data && cp destinations.example.json data/destinations.json
node server.js                 # http://localhost:3000/api/health
# MediaMTX는 별도 바이너리로 실행 → §6.3
```

---

## 5. 클라이언트 상세 — `studio.html`

> 브라우저 씬 컴포저 + WHIP 송출. **단일 파일, 의존성 0, 빌드 불필요, 설치형 PWA.**
> 캔버스로 카메라·화면·이미지·위젯을 합성 → WebAudio로 믹싱 → WHIP(WebRTC)로 릴레이에 송출.

### 5.1 실행

```bash
open client/studio.html          # 또는 브라우저에 드래그
```
- 로컬 파일(`file://`)은 보안 컨텍스트라 카메라/마이크가 동작한다.
- **폰에서 네트워크 접속 시 HTTPS 필수**(HTTP는 브라우저가 `getUserMedia` 차단). → 배포: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- 라이브: **https://panda-avata.cc/studio.html** (카메라 허용 → 홈화면 추가 = 앱 설치).

### 5.2 화면 구성 (반응형)

```
┌─────────────┬───────────────────────┬─────────────┐
│ 사이드       │  스테이지(캔버스)        │  속성        │
│ - 브랜드/설정 │  - 방향 가로/세로·화면비 │ - X/Y/W/H/회전│
│ - 언어/테마   │  - 해상도·가이드·줌      │ - 소스별 편집 │
│ - 소스 추가   │  - 캔버스 + 변형 핸들    │ - 오디오 믹서 │
│ - 레이어 목록 │  - LIVE·타이머           │ - 송출/인코딩 │
└─────────────┴───────────────────────┴─────────────┘
```
- **반응형 셸**: 데스크톱 3패널 → 태블릿/폴더블 → 모바일(하단 탭바·드로어·컨테이너 쿼리). 화면공유 시 자동 회전.
- **테마**: 다크/라이트/고대비/색약 + 강조색. **다국어**: 🌐 한/영 전환(자동감지·저장).

### 5.3 내부 모듈 (한 파일 안의 논리 파트)

`<script>`는 주석 배너(`/* ── … ── */`)로 구분된 논리 블록이다.

| 블록 | 책임 | 핵심 심볼 |
|--|--|--|
| 상태(state) | 전역 씬 상태·씬 배열 | `state`, `scenes`, `nextId` |
| 캔버스/리핏 | 방향·해상도·화면비 → 픽셀, 레이어 재배치 | `canvasDims()`, `refitLayers()`, `coverFit()` |
| 레이어 생성 | 22종 소스 공통 | `addLayer(type,data)` |
| 소스 핸들러 | 카메라/화면/이미지/비디오/텍스트/웹/위젯 22종 | `addCam`·`addScreen`·`addWeb`·`addData` … |
| 렌더 루프 | z순서 draw + 효과(크로마키/색보정/블러/블렌드) + iframe 위치동기 | `draw()`, `positionIframe()` |
| 제스처 | 드래그/리사이즈/회전·핀치확대·에디터 줌·정렬/가이드 | pointer 이벤트, `drawHandles()` |
| 씬 | 다중 씬 + 페이드 전환 + 숫자키 + 썸네일 | `switchScene()`, `saveScenes()` |
| 오디오 믹서 | WebAudio 그래프·EQ/컴프/리미터/덕킹/게이트 | `ensureMixer()`, `addMic()`, `meterLoop()` |
| 방송 | captureStream + 믹서버스 → WHIP + 인코딩 제어 | `startPublish()`, `whipPublish()`, `applyEncoding()` |
| 대상 동기화 | 저장 시 서버 `destinations.json`에 즉시 반영 | `syncDestToServer()`, `saveDest()` |
| OAuth | YouTube/Twitch/Facebook 연동(PKCE) + 방송 제목/설명 실제 반영 | `oauthConnect()`, `handleOAuthReturn()`, `upsertOAuthDestination()` |
| PWA | manifest·service worker·설치유도·Wake Lock | `sw.js`, `installBtn` |
| i18n | data-i18n 스냅샷 한/영 전환 | `applyLang()`, `I18N_EN` |

### 5.4 데이터 모델 — Layer

```js
{
  id, type,               // camera|screen|image|video|text|web|solid|clock|…(22종)
  x, y, w, h, rot, z,     // 중심좌표·크기·회전(도)·스택순서
  fill, aspect,           // 방향전환 cover 대상·원본비율
  opacity, flipH, flipV, blend, cornerR, borderW, // 효과
  chroma, bright, contrast, saturate, blur,       // 색보정/크로마키
  // type별: video/stream · img/src(dataURL) · text/font/color · url/iframe · _val …
}
```
렌더는 항상 **중심 기준**: `translate(x,y) → rotate → drawImage(-w/2,-h/2,w,h)`.

### 5.5 렌더 파이프라인

```
requestAnimationFrame(draw)  (FPS 캡: 저전력 15 / 일반 30·60)
  └ clear + 배경(색/이미지)
  └ layers z 오름차순 → 각 레이어: save → transform → 효과필터 → draw → restore
       camera/screen: video 프레임 · image/video · text(그림자) · 위젯(시계/게이지/채팅/룰렛…)
       web: 캔버스엔 '방송 미표시' 라벨(브라우저 한계), 실제는 프리뷰 iframe
  └ drawHandles(): 선택 레이어 변형 핸들
```

> **웹 URL 소스 한계**: 브라우저는 임의 외부 페이지를 캔버스에 래스터화할 수 없다(OBS는 내장 크로뮴/CEF). iframe은 **송출자 프리뷰에만** 보이고 방송엔 자리표시만 나간다 → 웹 콘텐츠를 방송하려면 **화면공유(탭 선택)**. (체크리스트 391)

### 5.6 송출 (WHIP · WebRTC)

```js
canvas.captureStream(fps) + mixer.dest.stream(오디오 믹싱 버스) → MediaStream
→ RTCPeerConnection.addTrack → createOffer
→ setOpusBitrate(sdp)  // Opus fmtp: maxaveragebitrate·stereo·sprop-stereo·FEC (RFC 7587/4566)
→ POST offer.sdp (Content-Type: application/sdp[, Authorization: Bearer user:pass])
→ 201 Location 보관 → setRemoteDescription(answer)
→ applyEncoding()  // 비디오/오디오 maxBitrate·scaleResolutionDownBy·maxFramerate·degradationPreference
종료/재연결 → DELETE <Location>  (RFC 9725 §4.2 — 세션 누수 방지)
```
- 미디어는 WebRTC 표준상 DTLS-SRTP 암호화(RFC 8826/8827).
- 코덱은 **H.264 고정**(RTMP/FLV fan-out 호환). 자동재연결(지수백오프)·워치독·드롭/재전송 통계.
- 마이크는 방송용으로 브라우저 DSP(EC/NS/AGC) OFF·스테레오 캡처.
- **대상(destinations) 저장 시 서버로 즉시 동기화**: `저장` 버튼 → `PUT /api/destinations/:avatar`(전체 교체) → `fanout.sh`가 실제로 읽는 `destinations.json`에 반영. 방송 시작 직전에도 재동기화하며, 대상이 하나도 없으면 시작을 막는다(§6.5).

### 5.7 씬 영속화

- 다중 씬은 `localStorage`(`centbeam.scenes`)에, 단일 씬 스냅샷은 주기 저장(`prisent.scene`).
- 저장: image(dataURL)/video/text/web/위젯 + 방향·해상도·효과. **camera·screen 스트림은 저장 불가**(리로드 후 재추가).
- 대상 목록·WHIP 토큰은 난독화(base64) 저장 + 서버 `destinations.json`과 동기화(§5.6).

### 5.8 확장 가이드 (새 소스)

1. 사이드 `.addbar`에 버튼(+ `data-i18n`).  2. 핸들러 `addLayer('mytype',{…})`.
3. `draw()`에 `else if(L.type==='mytype')` 렌더.  4. 필요 시 속성 UI.  5. 영속화 직렬화 규칙.

### 5.9 검증 (헤드리스)

Playwright(크로미움 가짜 장치)로 회귀. 확인: 소스 추가 후 캔버스 비검정·가로↔세로 cover 유지·리로드 복원·언어 전환·SDP munger 적합·**콘솔 에러 0**. 각 커밋은 헤드리스 검증 후 반영.

### 5.10 구현 상태 (요약)

| 영역 | 상태 |
|--|--|
| 반응형 셸(모바일/태블릿/폴더블) | ✅ |
| 오디오 믹서(EQ·컴프·리미터·덕킹·게이트) | ✅ |
| 비트레이트/FPS/해상도/코덱 제어 | ✅ |
| 화면 조정(크로마키·색보정·블러·블렌드·크롭) | ✅ |
| WHIP Bearer 인증 + DELETE 정리 | ✅ |
| 플랫폼 OAuth(YouTube·Twitch·Facebook) + 방송 제목/설명 실제 반영 | ✅ |
| 대상→서버 실시간 동기화(저장 버튼) | ✅ |
| 다국어(한/영) | ✅ |
| 웹 URL 캔버스 합성 | ➖ 브라우저 한계(화면공유로 대체) |

전체 400문항 → [CENTBEAM_PARITY_CHECKLIST.md](CENTBEAM_PARITY_CHECKLIST.md).

---

## 6. 서버 상세 — 릴레이

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

### 6.1 구성 파일

| 파일 | 역할 |
|--|--|
| `mediamtx.yml` | MediaMTX 설정. WHIP:8889 / RTMP:1935 / HLS:8888 수신, publish 시 `fanout.sh` 호출, internal auth |
| `fanout.sh` | 한 아바타로 publish되면 `data/destinations.json`의 모든 대상으로 FFmpeg fan-out(패스스루/재인코딩) |
| `server.js` | Express API — destinations CRUD(POST/PUT) + 헬스체크 + OAuth(YouTube/Twitch/Facebook) code→token 교환 + 실제 방송 생성(YouTube `liveBroadcasts`/Twitch 채널제목/Facebook `live_videos`) |
| `destinations.example.json` | 대상 목록 예시 (복사해서 `data/destinations.json` 생성) |
| `platforms.json` | 플랫폼별 ingest URL 프리셋 (프론트 대상 추가 UI용) |
| `deploy.sh` | 원클릭 서버 배포(멱등): 파일배치 + Apache vhost + certbot + **jq/ffmpeg 설치** + 릴레이 API systemd 기동 |
| `package.json` | `express` 단일 의존성 |

### 6.2 환경 변수

| 변수 | 기본값 | 사용처 | 설명 |
|--|--|--|--|
| `PORT` | `3000` | server.js | API 리슨 포트 (Apache가 `/api/` → 여기로 프록시) |
| `RATE_MAX` | `60` | server.js | IP당 분당 요청 한도(초과 429) |
| `DEST_FILE` | `<dir>/data/destinations.json` | server.js·fanout.sh | 대상 목록 경로. 프로덕션은 `/opt/centbeam/server/data/destinations.json` 로 3파일 일치 |
| `LOG_DIR` | `/opt/centbeam/server/data` | fanout.sh | fan-out 로그 디렉터리 |
| `OAUTH_SECRET_FILE` | `/var/secrets/oauth-nodetube.json` | server.js | Google/YouTube OAuth 클라이언트 시크릿(JSON) |
| `TWITCH_SECRET_FILE` | `/var/secrets/oauth-twitch.json` | server.js | Twitch OAuth 시크릿 |
| `FB_SECRET_FILE` | `/var/secrets/oauth-facebook.json` | server.js | Facebook OAuth 시크릿 |
| `MTX_AUTHINTERNALUSERS_0_USER` / `_PASS` | — | MediaMTX | **publish 자격증명 주입**(§6.7). YAML `${}` 치환은 MediaMTX가 지원하지 않으므로 반드시 env 로 |

> 시크릿 파일 포맷: `{"client_id":"…","client_secret":"…"}` 또는 Google 다운로드형 `{"web":{…}}`. 파일 권한 0600, 저장소에 커밋 금지.
> Twitch/Facebook은 각 플랫폼 개발자 사이트에 앱을 직접 등록해야 시크릿 파일을 만들 수 있다(코드로 대신할 수 없는 부분). Facebook 프로덕션 사용은 Meta 앱 심사(App Review)가 추가로 필요하다.

### 6.3 로컬 실행 (API만)

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

### 6.4 프로덕션 배포

원클릭(멱등) — 파일배치·Apache vhost·certbot·**jq/ffmpeg 설치**·**릴레이 API를 systemd 서비스(`centbeam-api`)로 상시 기동**까지:

```bash
sudo bash server/deploy.sh
# 원격 한 방(맥):
gcloud compute ssh my-site-1 --zone=asia-northeast1-a --command \
 'rm -rf /tmp/cb && git clone -b claude/sleepy-goodall-per69w https://github.com/videowatchshow-ship-it/make.git /tmp/cb && sudo bash /tmp/cb/server/deploy.sh'
```

- API는 `systemctl status centbeam-api` / 로그 `journalctl -u centbeam-api` 로 관리(Restart=always, 재부팅 자동기동).
- Apache가 80/443 선점 → **Caddy 쓰지 말 것**. `deploy.sh`가 `panda-avata.cc` vhost만 추가(보안헤더·HSTS·X-Frame-Options 포함).
- `fanout.sh`는 `jq`+`ffmpeg`가 없으면 아무 것도 하지 않고 조용히 실패한다 — `deploy.sh`가 매 배포마다 설치 여부를 확인·설치한다.
- WebRTC 미디어(UDP 8189)는 GCP 방화벽에서 개방:
  `gcloud compute firewall-rules create centbeam-webrtc --allow udp:8189 --source-ranges 0.0.0.0/0`
- 전체 절차 → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

### 6.5 API 레퍼런스

#### 대상(destinations)
| 메서드 | 경로 | 설명 |
|--|--|--|
| GET | `/api/health` | `{ok:true,ts}` |
| GET | `/api/avatars` | `[{name,count}]` |
| GET | `/api/destinations` | 전체 맵 |
| GET | `/api/destinations/:avatar` | 아바타 대상 배열 |
| POST | `/api/destinations/:avatar` | 대상 1건 추가(아래 바디) |
| PUT | `/api/destinations/:avatar` | 아바타 대상 **전체 교체**(클라이언트 저장 버튼이 호출, 최대 20건) |
| DELETE | `/api/destinations/:avatar/:idx` | 대상 삭제 (`locked:true`면 403) |
| GET/PUT/POST | `/api/scenes/:avatar` | 씬 클라우드 동기화(2MB 한도, POST는 sendBeacon용) |
| GET | `/api/auth/me` | 세션 확인(+180일 롤링 연장). 게이트 비활성 환경은 `{open:true}` |
| POST | `/api/auth/logout` | 세션 폐기 |

> 🔐 **의무 로그인**: 서버에 구글 OAuth 시크릿이 설정된 환경(프로덕션)에서는 위 destinations/scenes/avatars
> API 전체가 세션(Bearer `cbs_…`) 필수이고, 스튜디오도 구글 로그인 게이트가 뜬다. 세션은 180일 + 사용 시
> 자동 연장(프리즘 방식 — 직접 로그아웃 전엔 안 풀림). 시크릿 없는 개발 환경은 개방 모드로 동작.

POST/PUT 바디(항목):
```jsonc
{
  "platform": "youtube", "name": "메인", "title": "방송 제목", "desc": "방송 설명",
  "rtmpUrl": "rtmp://…", "streamKey": "…",
  "fullUrl": false,         // true면 rtmpUrl 자체가 완전한 1회성 URL(Facebook Live Video API 등) — streamKey 미사용
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

#### OAuth (Authorization Code + PKCE, RFC 9700)
| 메서드 | 경로 | 설명 |
|--|--|--|
| GET | `/api/oauth/config?provider=google\|twitch\|facebook` | `{configured, clientId}` (시크릿 미노출) |
| POST | `/api/oauth/exchange` | `{code,redirectUri,codeVerifier,provider,title,description}` → 서버가 code→token 교환, 스트림키 조회, **실제 방송 생성**(YouTube `liveBroadcasts.insert`+`bind`, Twitch 채널제목 `PATCH`, Facebook `live_videos` POST), `refresh_token`은 서버 0600 보관, 프론트엔 `{email,name,streamKey,rtmpUrl,broadcastCreated,broadcastError}` 최소 반환 |

### 6.6 fan-out 동작

1. 클라이언트/OBS가 `…:8889/<avatar>/whip`(WHIP) 또는 `rtmp://…:1935/<avatar>` 로 publish.
2. MediaMTX `runOnReady`(공식 env `$MTX_PATH`) → `fanout.sh <avatar>`.
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
4. 빈 키/`PUT_KEY_HERE`/`enabled:false` 대상은 건너뜀. `fullUrl:true` 대상(예: Facebook)은 키가 비어 있어도 건너뛰지 않고 `rtmpUrl`을 그대로 사용. 로그는 스트림키 없이 URL만 기록.
5. **필수 의존성**: `jq`(대상 목록 파싱) + `ffmpeg`(재인코딩/패스스루). 둘 중 하나라도 없으면 이 스크립트 전체가 조용히 실패한다 — `deploy.sh` §6.4가 매 배포마다 설치를 보장한다.

### 6.7 보안 (구현 · 근거)

| 항목 | 구현 | 근거 |
|--|--|--|
| WHIP publish 인증 | `Authorization: Bearer user:pass` | RFC 9725 |
| MediaMTX publish 자격증명 | `MTX_AUTHINTERNALUSERS_0_USER/PASS` env(YAML `${}` 미지원) | MediaMTX 문서 |
| 프록시 뒤 실 IP 레이트리밋 | `app.set('trust proxy','loopback')` + 분당 60 | OWASP API4 |
| 보안 응답 헤더 | nosniff·X-Frame-Options·Referrer-Policy·HSTS·Permissions-Policy | MDN / OWASP Secure Headers |
| 자격증명 저장 | `refresh_token` 서버 0600, 프론트 미전달, 시크릿 비커밋 | OWASP MASVS-STORAGE |
| 로그 위생 | 스트림키 로그 미기록 | OWASP MASVS-STORAGE |

체크리스트 R(331–350) + 감사(351~400) 참고. 유료·로그인 게이트 SaaS 전환 시 보안 30항목 추가 근거: [docs/SECURITY_30.md](docs/SECURITY_30.md).

### 6.8 운영 노트

- 패스스루는 입력 인코딩이 곧 모든 대상 출력 — 대상별 다른 해상도/비트레이트는 위 프로파일로 재인코딩(CPU 비용 발생).
- `data/*.log`·`data/destinations.json`·`data/*-token-*.json`은 **비커밋**. 예시(`destinations.example.json`)만 커밋.
- FFmpeg 로그 증가 → `logrotate` 권장. 디스크 부족 시 오래된 `data/*.log` 삭제.
- MediaMTX/FFmpeg는 별도 프로세스 — `deploy.sh`는 API(systemd)만 관리하고 MediaMTX 기동 여부는 포트로 점검한다.

---

## 7. 배포 (도메인: **panda-avata.cc**)

서버 `34.104.233.35`(GCP `my-site-1`, Apache 기존 호스팅)에 `panda-avata.cc` HTTPS 배포.
DNS: 도메인은 GoDaddy 등록 → 네임서버 Cloudflare(zone active).

**① DNS A레코드** (Cloudflare, API가 열린 곳에서 — proxied **off** 필수):
→ [docs/CLOUDFLARE_API.md](docs/CLOUDFLARE_API.md) 의 curl (Zone ID `2d8aba1f3f2a8e11042821ebbcfcdefe`)

**② 서버 배포** (원클릭, 멱등):
```bash
sudo bash server/deploy.sh
# 원격 한 방(맥):
gcloud compute ssh my-site-1 --zone=asia-northeast1-a --command \
 'rm -rf /tmp/cb && git clone -b claude/sleepy-goodall-per69w https://github.com/videowatchshow-ship-it/make.git /tmp/cb && sudo bash /tmp/cb/server/deploy.sh'
```

→ 폰에서 **`https://panda-avata.cc/studio.html`** · WHIP `https://panda-avata.cc/whip/tak/whip`
전체 절차(vhost·certbot·방화벽): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

> 🚨 Caddy 쓰지 말 것 — 80/443은 Apache가 선점 중. panda-avata vhost만 추가(`deploy.sh` 가 처리).

---

## 8. 문서 모음 (`docs/`)

`docs/`에는 이 README에 다 담기엔 너무 상세한 **단일 주제** 운영 문서만 둔다(README는 아님 — 이 저장소의 README는 이 파일 하나뿐).

| 문서 | 무엇을 답하나 | 언제 읽나 |
|--|--|--|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 왜 이 구조인가 — WHIP→MediaMTX→fan-out 설계, 컴포넌트 경계, 버전 근거(2026-07 실측) | 전체 그림·기술 결정 이해 |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | 어떻게 배포하나 — `panda-avata.cc`(GoDaddy→Cloudflare) DNS·Apache vhost·certbot·systemd·방화벽 전체 절차 | 서버에 올릴 때 |
| [CLOUDFLARE_API.md](docs/CLOUDFLARE_API.md) | DNS를 API로 어떻게 바꾸나 — zone/레코드 CRUD curl 레퍼런스(proxied off 필수) | DNS 조작·회색구름 설정 |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | 어떻게 기여하나 — 브랜치(`claude/*`)·커밋 접두어·헤드리스 검증·PR(draft) 규칙 | 코드 변경 전 |
| [GLOSSARY.md](docs/GLOSSARY.md) | 용어 — WHIP·fan-out·아바타·릴레이 등 | 낯선 용어 만날 때 |
| [MOBILE_UX_PRISM.md](docs/MOBILE_UX_PRISM.md) | 폰에서 PRISM처럼 쓸 만한가 — 아이폰 뷰포트 실측 항목 | 모바일 UX 상품화 점검 |
| [SECURITY_30.md](docs/SECURITY_30.md) | 유료·로그인 게이트 SaaS 보안 30개(해킹·크롤링) — 공식출처 근거 + 적용 위치 | 상품화 전 보안 하드닝 |

### 문서 원칙 (대기업식)

- **공식 문서 근거**: 프로토콜/설정 주장은 1차 출처(MDN·W3C·RFC·FFmpeg·MediaMTX 릴리스)에 근거한다. 추정 금지.
- **검증 가능**: 배포·명령·API는 실행 가능한 형태로 적고, 완성도는 [400문항 체크리스트](CENTBEAM_PARITY_CHECKLIST.md)(감사 351~400 포함)로 추적한다.
- **한계 정직 고지**: 브라우저 원천 한계(임의 웹페이지 캔버스 합성 등)는 숨기지 않고 대안과 함께 명시한다.
- **비밀 비커밋**: 토큰·시크릿·스트림키는 문서/저장소에 넣지 않는다. 시크릿 파일은 서버 0600·env 주입.
- **README는 하나만**: 저장소 전체를 설명하는 README는 이 파일뿐. 각 파트(client/server) 내부 설계는 이 파일의 [§5](#5-클라이언트-상세--studiohtml)/[§6](#6-서버-상세--릴레이)에 통합돼 있다.

---

## 9. 기술 스택

| 파트 | 스택 |
|--|--|
| 클라이언트 | Vanilla JS + Canvas 2D + WebRTC(WHIP) + WebAudio + `getUserMedia`/`getDisplayMedia`. 의존성 0, 단일 HTML, PWA. |
| 서버 | Node 22(LTS) + Express 5.2.1, MediaMTX v1.19.2, FFmpeg, jq. 릴레이 API는 systemd 서비스(`centbeam-api`). |
| 배포 | 서버 34.104.233.35(Apache) + Cloudflare DNS. `panda-avata.cc` Apache vhost + certbot HTTPS. 원클릭 `deploy.sh`. |

버전 근거(2026-07 실측)는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 10. 완성도 / 개발 규칙

- 완성도: **[CENTBEAM_PARITY_CHECKLIST.md](CENTBEAM_PARITY_CHECKLIST.md)** (400항목, 현재 ✅375 / 93% · 이행률 ✅+➖ 96%). 각 항목: 구현 → 헤드리스 Playwright 검증 → 커밋.
- 브랜치: `claude/*` 피처 브랜치 → PR(draft). 커밋은 파트 접두어(`client:`/`server:`/`docs:`).
- 상세: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

## 11. 라이선스

Proprietary — © Cent Solution. 무단 배포 금지.
