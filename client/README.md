# 클라이언트 — 센트빔 스튜디오 (`studio.html`)

> 브라우저 씬 컴포저 + WHIP 송출. **단일 파일, 의존성 0, 빌드 불필요, 설치형 PWA.**
> 캔버스로 카메라·화면·이미지·위젯을 합성 → WebAudio로 믹싱 → WHIP(WebRTC)로 릴레이에 송출.

---

## 1. 실행

```bash
open studio.html          # 또는 브라우저에 드래그
```
- 로컬 파일(`file://`)은 보안 컨텍스트라 카메라/마이크가 동작한다.
- **폰에서 네트워크 접속 시 HTTPS 필수**(HTTP는 브라우저가 `getUserMedia` 차단). → 배포: [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)
- 라이브: **https://panda-avata.cc/studio.html** (카메라 허용 → 홈화면 추가 = 앱 설치).

---

## 2. 화면 구성 (반응형)

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

---

## 3. 내부 모듈 (한 파일 안의 논리 파트)

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
| OAuth | YouTube/Twitch/Facebook 연동(PKCE) | `oauthConnect()`, `handleOAuthReturn()` |
| PWA | manifest·service worker·설치유도·Wake Lock | `sw.js`, `installBtn` |
| i18n | data-i18n 스냅샷 한/영 전환 | `applyLang()`, `I18N_EN` |

---

## 4. 데이터 모델 — Layer

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

---

## 5. 렌더 파이프라인

```
requestAnimationFrame(draw)  (FPS 캡: 저전력 15 / 일반 30·60)
  └ clear + 배경(색/이미지)
  └ layers z 오름차순 → 각 레이어: save → transform → 효과필터 → draw → restore
       camera/screen: video 프레임 · image/video · text(그림자) · 위젯(시계/게이지/채팅/룰렛…)
       web: 캔버스엔 '방송 미표시' 라벨(브라우저 한계), 실제는 프리뷰 iframe
  └ drawHandles(): 선택 레이어 변형 핸들
```

> **웹 URL 소스 한계**: 브라우저는 임의 외부 페이지를 캔버스에 래스터화할 수 없다(OBS는 내장 크로뮴/CEF). iframe은 **송출자 프리뷰에만** 보이고 방송엔 자리표시만 나간다 → 웹 콘텐츠를 방송하려면 **화면공유(탭 선택)**. (체크리스트 391)

---

## 6. 송출 (WHIP · WebRTC)

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

---

## 7. 씬 영속화

- 다중 씬은 `localStorage`(`centbeam.scenes`)에, 단일 씬 스냅샷은 주기 저장(`prisent.scene`).
- 저장: image(dataURL)/video/text/web/위젯 + 방향·해상도·효과. **camera·screen 스트림은 저장 불가**(리로드 후 재추가).
- 대상 목록·WHIP 토큰은 난독화(base64) 저장.

---

## 8. 확장 가이드 (새 소스)

1. 사이드 `.addbar`에 버튼(+ `data-i18n`).  2. 핸들러 `addLayer('mytype',{…})`.
3. `draw()`에 `else if(L.type==='mytype')` 렌더.  4. 필요 시 속성 UI.  5. 영속화 직렬화 규칙.

---

## 9. 검증 (헤드리스)

Playwright(크로미움 가짜 장치)로 회귀. 확인: 소스 추가 후 캔버스 비검정·가로↔세로 cover 유지·리로드 복원·언어 전환·SDP munger 적합·**콘솔 에러 0**. 각 커밋은 헤드리스 검증 후 반영.

---

## 10. 구현 상태 (요약)

| 영역 | 상태 |
|--|--|
| 반응형 셸(모바일/태블릿/폴더블) | ✅ |
| 오디오 믹서(EQ·컴프·리미터·덕킹·게이트) | ✅ |
| 비트레이트/FPS/해상도/코덱 제어 | ✅ |
| 화면 조정(크로마키·색보정·블러·블렌드·크롭) | ✅ |
| WHIP Bearer 인증 + DELETE 정리 | ✅ |
| 플랫폼 OAuth(YouTube·Twitch·Facebook) | ✅ |
| 다국어(한/영) | ✅ |
| 웹 URL 캔버스 합성 | ➖ 브라우저 한계(화면공유로 대체) |

전체 400문항 → [../CENTBEAM_PARITY_CHECKLIST.md](../CENTBEAM_PARITY_CHECKLIST.md).
