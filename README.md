<div align="center">

# ◭ 센트빔 CENTBEAM

**하나의 방송을 모든 곳으로 — 모바일 우선 멀티스트리밍 스튜디오**

한 번 송출하면 서버가 여러 플랫폼(YouTube·Facebook·Twitch·자체 사이트 등)으로 동시에 뿌리는(fan-out) 라이브 스튜디오.
PRISM/OBS의 씬 합성 경험을 **브라우저(PWA)** 로 구현했다. 설치·빌드 없이 폰에서 바로.

![status](https://img.shields.io/badge/parity-77%25%20(270%2F350)-green) ![client](https://img.shields.io/badge/client-PWA%20단일HTML-blue) ![server](https://img.shields.io/badge/relay-MediaMTX%2BFFmpeg-informational) ![deploy](https://img.shields.io/badge/domain-panda--avata.cc-orange)

**라이브: [https://panda-avata.cc/studio.html](https://panda-avata.cc/studio.html)** (배포 후)

</div>

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

| 경로 | 파트 | 설명 | 문서 |
|--|--|--|--|
| `client/studio.html` | **스튜디오** | 브라우저 씬 컴포저 + WHIP 송출. **단일 파일, 의존성 0, 빌드 불필요.** | [client/README.md](client/README.md) |
| `server/` | **릴레이** | MediaMTX + `fanout.sh` + Express API. RTMP/WHIP 수신 → 다중 대상 fan-out. | [server/README.md](server/README.md) |
| `server/deploy.sh` | **배포** | 서버 원클릭 배포(멱등): 파일배치 + Apache vhost + certbot SSL. | — |
| `docs/` | **문서** | ARCHITECTURE / DEPLOYMENT / CLOUDFLARE_API / CONTRIBUTING / GLOSSARY. | [docs/](docs/) |
| `CENTBEAM_PARITY_CHECKLIST.md` | **품질 기준** | PRISM 모바일 동등성 350항목 감사 (현재 ✅270). | — |
| `legacy/` | 범위 밖 | 피벗 이전 도구, 참고 보관. | [legacy/README.md](legacy/README.md) |

> **설계 원칙**: 클라이언트와 서버는 **프로토콜(WHIP/RTMP)로만** 결합. 서버는 어떤 클라이언트(센트빔/OBS/PRISM)든 스트림키만 맞으면 받는다.

---

## 3. 기능 (구현 완료 — 전 항목 헤드리스 검증, 콘솔 에러 0)

**소스 (19종)**
카메라(전/후면·장치선택·전면미러·탭초점/노출/플래시)·화면공유(+시스템오디오)·이미지·비디오·텍스트·웹위젯·단색·시계·로워서드·카운트다운·게이지·채팅·스티커·프레임·이모지플로팅·투표·후원목록·BGM정보·오디오비주얼라이저·룰렛·슬라이드쇼

**효과/화면조정**
불투명도·좌우상하반전·색보정(밝기/대비/채도)·흐림·**크로마키**·필터프리셋(뷰티/빈티지/쿨/웜/흑백/비비드)·블렌드모드 7종·둥근모서리·테두리·그림자·화이트밸런스·모자이크·크롭·비율고정

**편집/제스처**
드래그·리사이즈·회전·**두손가락 핀치확대/회전**·정렬 6종·가이드(세이프존/그리드/눈금자/스냅)·z순서·**드래그 순서변경**·복제·잠금·숨김·다중선택·그룹화·균등배분·키보드 미세이동·**Undo/Redo**·롱프레스 메뉴·**다중 씬 + 페이드전환 + 숫자키**·씬 썸네일·템플릿 4종·**에디터 줌(핀치/휠 25~400%)**·패널 리사이즈

**오디오 (WebAudio 믹서)**
마이크/BGM 소스별 볼륨·뮤트·레벨미터 + 마스터 EQ 3밴드·컴프레서·리미터·**덕킹**·노이즈게이트·페이드·파형·클리핑경고·스테레오/모노·모니터링·싱크딜레이·**BGM 플레이리스트**·시스템오디오 캡처·Opus 비트레이트(SDP)·알림음

**송출/인코딩**
WHIP(WebRTC)·다중대상 fan-out·비트레이트·FPS(30/60)·레이트컨트롤·출력 다운스케일·코덱선호·자동재연결(지수백오프)·**워치독**·연결상태·드롭/재전송 통계·가용대역폭·방송요약·시작 카운트다운·BRB·**방송예약**·음성전용·로컬녹화·스냅샷·**PiP**·대상 on/off·WHIP Bearer 인증·랜덤 스트림경로

**모바일/PWA**
반응형 셸(하단 탭바·드로어)·태블릿 레이아웃·**Wake Lock**·저전력·방향잠금·스플래시·About·설치유도·풀스크린·몰입모드·라이트/고대비/**색약**/시스템 테마·강조색·햅틱·도움말·온보딩·오프라인 배너·네트워크/배터리 표시·스와이프 삭제·manifest shortcuts

**보안**
CSP·iframe sandbox·WHIP Bearer·랜덤경로·서버 레이트리밋·MediaMTX 인증·보안헤더·npm audit·로그 위생 (근거: RFC 9725 / OWASP / MDN)

> 남은 항목(~38)은 대부분 **외부 인프라 필요**(YouTube/Facebook OAuth, 실시간 시청자수, VOD, 멀티게스트 mesh)이거나 **WebRTC가 자동 관리**(CBR/키프레임/B프레임)라 브라우저 단독 구현 불가. → [체크리스트](CENTBEAM_PARITY_CHECKLIST.md)

---

## 4. 빠른 시작

### 로컬에서 열기 (개발)
```bash
open client/studio.html        # macOS (또는 브라우저에 드래그)
```
> ⚠️ 폰에서 네트워크로 접속해 카메라를 쓰려면 **HTTPS 필수** (secure context). → 배포.

### 서버 릴레이 (API)
```bash
cd server && npm install
mkdir -p data && cp destinations.example.json data/destinations.json
node server.js                 # http://localhost:3000/api/health
# MediaMTX 는 별도 바이너리로 실행 → server/README.md
```

---

## 5. 배포 (도메인: **panda-avata.cc**)

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

## 6. 기술 스택

| 파트 | 스택 |
|--|--|
| 클라이언트 | Vanilla JS + Canvas 2D + WebRTC(WHIP) + WebAudio + `getUserMedia`/`getDisplayMedia`. 의존성 0, 단일 HTML, PWA. |
| 서버 | Node 22(LTS) + Express 5.2.1, MediaMTX v1.19.2, FFmpeg, PM2 |
| 배포 | 서버 34.104.233.35(Apache) + Cloudflare DNS. `panda-avata.cc` Apache vhost + certbot HTTPS. 원클릭 `deploy.sh`. |

버전 근거(2026-07 실측)는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 7. 완성도 / 개발 규칙

- 완성도: **[CENTBEAM_PARITY_CHECKLIST.md](CENTBEAM_PARITY_CHECKLIST.md)** (350항목, 현재 ✅270 / 77%). 각 항목: 구현 → 헤드리스 Playwright 검증 → 커밋.
- 브랜치: `claude/*` 피처 브랜치 → PR(draft). 커밋은 파트 접두어(`client:`/`server:`/`docs:`).
- 상세: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

## 8. 라이선스

Proprietary — © Cent Solution. 무단 배포 금지.
