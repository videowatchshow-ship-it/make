# 클라이언트 — 센트빔 스튜디오 (`studio.html`)

> 브라우저 씬 컴포저 + WHIP 송출. **단일 파일, 의존성 0, 빌드 불필요.** 이 문서만 읽으면 내부 구조를 다 이해할 수 있게 작성한다.

---

## 1. 실행

```bash
open studio.html         # 또는 브라우저에 드래그
```
- 로컬 파일(`file://`)은 보안 컨텍스트라 카메라/마이크가 동작한다.
- **폰에서 네트워크로 접속 시 HTTPS 필수** (HTTP는 브라우저가 카메라 차단). → [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)

---

## 2. 화면 구성

```
┌─────────────┬───────────────────────┬─────────────┐
│ 사이드       │  스테이지(캔버스)        │  속성        │
│ - 브랜드     │  - 방향 토글 가로/세로   │ - X/Y/W/H/회전│
│ - 소스 추가  │  - 해상도               │ - 텍스트/웹   │
│ - 레이어 목록│  - 캔버스 + 선택 핸들    │ - 송출(WHIP) │
└─────────────┴───────────────────────┴─────────────┘
```
> ⚠️ 현재 레이아웃은 **데스크톱 3패널 고정**이다. 모바일 반응형은 로드맵 최우선 항목(체크리스트 C·S).

---

## 3. 내부 모듈 (한 파일 안의 논리적 파트)

`studio.html`의 `<script>`는 아래 순서의 논리 블록으로 구성된다. 각 블록은 주석 배너(`/* ── ... ── */`)로 구분되어 있다.

| # | 블록 | 책임 | 핵심 심볼 |
|--|--|--|--|
| 1 | **상태(state)** | 전역 씬 상태 | `state = {orient,res,layers,selId,live}`, `nextId` |
| 2 | **캔버스 크기** | 방향·해상도 → 캔버스 픽셀, 프리뷰 스케일 | `canvasDims()`, `applyCanvasSize()` |
| 3 | **리핏** | 방향/해상도 변경 시 레이어 재배치 | `refitLayers()`, `coverFit()`, `fillSelected()` |
| 4 | **레이어 생성** | 소스 추가 공통 | `addLayer(type,data)` |
| 5 | **소스 핸들러** | 카메라/화면/이미지/텍스트/웹 | `addVideoSource()`, `imgFile.onchange`, addText/addWeb |
| 6 | **렌더 루프** | z순서 draw, 웹 iframe 위치 동기 | `draw()`, `positionIframe()` |
| 7 | **선택 핸들** | 드래그/리사이즈/회전 제스처 | `drawHandles()`, pointer 이벤트, `sel()` |
| 8 | **방향/해상도 UI** | 토글·셀렉트 | `#orient`, `#resSel` |
| 9 | **레이어 목록** | 사이드 목록·z이동 | `renderLayers()`, `bump()`, `normalizeZ()` |
| 10 | **속성 패널** | 선택 레이어 편집 | `showProps()`, `syncProps()` |
| 11 | **방송** | captureStream + 마이크 → WHIP | `goLive`, `whipPublish()`, `setLive()` |
| 12 | **씬 저장/복원** | localStorage 영속화 | `saveScene()`, `restoreScene()` |

---

## 4. 데이터 모델 — Layer

모든 소스는 `state.layers[]`의 객체다.

```js
{
  id: 1,                 // 고유 ID
  type: 'camera',        // camera|screen|image|text|web
  name: '카메라',
  x: 960, y: 540,        // 중심 좌표 (캔버스 픽셀)
  w: 1920, h: 1080,      // 크기
  rot: 0,                // 회전(도)
  z: 0,                  // 스택 순서(클수록 앞)
  fill: true,            // 방향전환 시 캔버스 cover 대상인지
  aspect: 1.777,         // 원본 비율(cover 계산용)
  // ── type별 ──
  video, stream,         // camera|screen
  img, src,              // image (src=dataURL, 영속화용)
  text, font, color,     // text
  url, iframe,           // web
}
```

렌더는 항상 **중심 기준**: `translate(x,y) → rotate → drawImage(-w/2,-h/2,w,h)`.

---

## 5. 렌더 파이프라인

```
requestAnimationFrame(draw)
  └ clear + 검정 배경
  └ layers를 z 오름차순 정렬
  └ 각 레이어: save → translate(center) → rotate → drawImage/fillText → restore
       - camera/screen: video 프레임 (readyState>=2)
       - image: img (complete)
       - text: fillText (그림자 포함)
       - web: 캔버스엔 자리표시 사각형(CORS로 합성 불가), 실제는 프리뷰 iframe
  └ drawHandles(): 선택 레이어에 변형 핸들
```

> **웹 URL 소스의 한계**: 브라우저는 외부 origin을 캔버스에 그릴 수 없다(CORS). 프리뷰 오버레이 iframe으로만 보인다. 실제 송출 합성이 필요하면 서버 headless 렌더 또는 네이티브 WebView 캡처가 필요(체크리스트 71).

---

## 6. 송출 (WHIP)

```js
canvas.captureStream(30) + mic → new MediaStream
→ RTCPeerConnection.addTrack
→ createOffer → POST offer.sdp to WHIP endpoint (Content-Type: application/sdp)
→ setRemoteDescription(answer)
```
- 엔드포인트: 속성 패널의 `WHIP 엔드포인트` (예: `https://studio.xn--9d0bw2fjtyymch7de9d.info/whip/tak/whip` 또는 `http://34.104.233.35:8889/tak/whip`).
- 미디어는 WebRTC 표준상 DTLS-SRTP로 암호화된다(RFC 8826/8827).
- **TODO(보안)**: Bearer 토큰 헤더(RFC 9725). 현재 미구현.

---

## 7. 씬 영속화

- `setInterval(saveScene, 2500)` — 2.5초마다 localStorage(`prisent.scene`)에 저장.
- 저장 대상: image(dataURL)/text/web + 방향/해상도. **camera·screen 스트림은 저장 불가**(리로드 후 재추가 필요).
- 로드 시 `restoreScene()`가 복원.

---

## 8. 확장 가이드 (새 소스 추가 예)

1. 사이드 `.addbar`에 버튼 추가.
2. 핸들러에서 `addLayer('mytype', {...})`.
3. `draw()`에 `else if(L.type==='mytype')` 렌더 분기.
4. 필요 시 `showProps()`/`syncProps()`에 속성 UI.
5. 영속화하려면 `saveScene`/`restoreScene`에 직렬화 규칙.

---

## 9. 검증 방법 (헤드리스)

Playwright(크로미움 가짜 장치)로 회귀 테스트한다. 스크립트 예는 개발 노트 참조. 확인 항목:
- 소스 추가 후 캔버스 픽셀 비검정(렌더 확인)
- 가로↔세로 토글 후 모서리 cover 유지(리핏)
- 리로드 후 레이어 복원 수
- 콘솔 에러 0

---

## 10. 알려진 제약 / TODO (요약)

| 영역 | 상태 |
|--|--|
| 모바일 반응형 | ❌ 데스크톱 고정 |
| 오디오 믹서 | ❌ 마이크 캡처만 |
| 비트레이트/FPS 제어 | ❌ 브라우저 자동 |
| 화면 조정(크롭/불투명도/색보정) | ❌ |
| 웹 URL 캔버스 합성 | ⚠️ CORS 제약 |
| WHIP 인증 | ❌ |

전체는 [../CENTBEAM_PARITY_CHECKLIST.md](../CENTBEAM_PARITY_CHECKLIST.md).
