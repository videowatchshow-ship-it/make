# gauth · jump — 계정 관리 시스템

두 사이트, 서로 다른 역할.

| | https://gauth.cent-solution.online/ | https://jump.cent-solution.online/ |
|---|---|---|
| 역할 | 마스터 계정 관리 (마스터 DB, 업로드, 로그인, TOTP, YouTube API) | 보물섬 채널 현황 (표시 전용 PWA) |
| 쓰기 | 있음 (업로드/로그인/토큰) | 없음 |
| 로그인 | 구글 GIS (우상단, 10년 쿠키) | 없음 |
| 데이터 소스 | `/opt/gauth-full/accounts_normalized.json` | gauth API 프록시 읽기 전용 |
| 하위 사이트 계정 UI | `/subsites.html` 에만 (메인에는 없음) | 메인에 카드 페이지네이션 |

메인에서는 겹치지 않음 — gauth 메인은 마스터만, 하위 사이트 계정 조회는 `/subsites.html` 또는 jump.

---

## https://gauth.cent-solution.online/ (쉼이)

### 경로
- 프론트: `/var/www/sites/gauth/public/index.html`
- 하위 계정 조회 페이지: `/var/www/sites/gauth/public/subsites.html`
- 엑셀 파서: `/opt/gauth-full/upload_excels.js`
- Express 서버: `/opt/gauth-full/rebrowser-login.js` (port 4000)
- 마스터 데이터: `/opt/gauth-full/accounts_normalized.json`
- 구글 GIS 사용자: `/opt/gauth-full/google_users.json`
- systemd: `gauth`
- 서버: 싱가포르 (gucci-yanolza), IP는 문서에 노출하지 않음

### 메인 페이지 구성
- 엑셀 업로드 (단일/일괄)
- 계정 순회, 로그인 시도, TOTP 코드
- YouTube API 유틸리티 (모데레이터 추가, 채팅서 메시지 등)
- 상단: 직접 이메일 입력 조회
- 우상단:
  - 구글 GIS 로그인 버튼 → 로그인 후 아바타+이름 표시 (로그아웃 버튼 없음)
  - "📦 하위 계정 →" 링크 → `/subsites.html` 이동

### `/subsites.html` (하위 사이트별 계정 전용)
- `/api/subsite-accounts`에서 다운로드, 카드 개수 표시
- 카드 클릭 → 이메일 페이지네이션 (10개/페이지)

### API 엔드포인트
- `POST /api/auth/google` — GIS credential(id_token) 검증 → 10년 httpOnly 쿠키
  - 서버는 `https://oauth2.googleapis.com/tokeninfo` 공식 엔드포인트에서 aud/iss/exp 검증
- `GET  /api/auth/me` — 로그인된 사용자 정보
- `GET  /api/auth/config` — client_id 반환 (설정 여부 확인)
- `GET  /api/subsite-accounts` — 하위 사이트별 계정 상세 (jump와 /subsites.html 에서 사용)
- `GET  /api/subsite-counts` — 개수만
- 기타 기존: `/api/accounts`, `/api/login-one`, `/api/lookup`, `/api/search-account?q=`, `/api/codes/<totp_secret>`, `/api/youtube/*`

### 필수 GitHub Secrets
- `GAUTH_HOST` / `GAUTH_USER` / `GAUTH_SSH_KEY`
- `CLOUDFLARE_TOKEN` / `CLOUDFLARE_ZONE_ID`
- `GOOGLE_OAUTH_CLIENT_ID` — 구글 로그인 위젯이 렌더되려면 필요 (없으면 "미설정" 표시)

### 구글 로그인 (진행 상태 · 백엔드는 gauth 자체)

백엔드는 **gauth의 Node 서버**(`/opt/gauth-full/rebrowser-login.js`)에만 둔다. 다른 사이트에 두지 않는다.

- **GCP 프로젝트**: `quantum-bonus-455522-b4` (client_id 앞자리 `956283750273`와 동일 프로젝트).
  gauth 박스에 gcloud가 서비스 계정 `956283750273-compute@developer.gserviceaccount.com`로 인증돼 있어 콘솔 없이 API 조작 가능.
- **origin_mismatch 원인**: raw GSI(`google.accounts.id`) 버튼은 OAuth 클라이언트의 "승인된 JavaScript 원본"을 검사하는데, 이건 콘솔에서만 편집 가능(공개 API 없음 — clientauthconfig 404, IAP admin 폐기예정/org 필요).
- **콘솔 0클릭 해결책 = GCIP(Firebase Auth) 전환**:
  1. `gcloud services enable identitytoolkit.googleapis.com` — 완료
  2. `POST /v2/projects/{p}/identityPlatform:initializeAuth` — 완료
  3. `PATCH /admin/v2/projects/{p}/config?updateMask=authorizedDomains` 로
     `gauth.cent-solution.online` 추가 — **완료** (현재 authorizedDomains에 포함됨)
- **Firebase 웹 config (실측)**: `apiKey=AIzaSy…`(브라우저 키), `authDomain=quantum-bonus-455522-b4.firebaseapp.com`, `projectId=quantum-bonus-455522-b4`
- **남은 단 하나의 입력**: GCIP Google IdP(`defaultSupportedIdpConfigs/google.com`) 활성화에 OAuth **client_secret(`GOCSPX-…`)**이 필요.
  기존 클라이언트의 secret을 읽는 공개 API가 없어 프로젝트 소유자만 제공 가능. secret 확보 시 프론트를 공식 문서(`firebase.google.com/docs/auth/web/google-signin`)의 `signInWithPopup(GoogleAuthProvider)`로 전환하면 로그인 완료.
- **세션 정책**: 로그인 1회 → Firebase `browserLocalPersistence`(영구) 또는 gauth 10년 httpOnly 쿠키. 로그아웃 버튼 누르기 전까지 유지.
- **로그인 후 계정 점검(읽기 전용, 삭제 없음)**: YouTube Data API로 계정별 ① 삭제/경고 상태 ② 스트리밍 방송 횟수 ③ 마지막 생방송 경과일 조회 — 로그인 작동 후 구현.

---

## https://jump.cent-solution.online/ (오른쪽)

### 경로
- `/var/www/sites/jump/public/` — `index.html`, `manifest.json`, `sw.js`
- 소스: `jump/` 저장소 디렉토리

### 메인 페이지 구성
- 헤더: 보물섬 채널 현황
- PWA 설치 버튼
- 엑셀 단일 업로드 버튼 (gauth로 프록시)
- 하위 사이트 카드 목록: 이모지 + 영문명 + 한글표기 + 계정수
- 카드 클릭 → 이메일 페이지네이션 (10개/페이지)

### 데이터
- gauth의 `/api/subsite-accounts`를 jump vhost에서 읽기 전용으로 프록시
- 로그인/2FA/토큰 엔드포인트는 프록시되지 않음 (보안)

### 캐시 정책
- Apache vhost에서 `.html/.json/.js`에 `no-store` + `Clear-Site-Data: cache, storage` 강제
- 브라우저의 이전 서비스 워커와 캐시 자동 폐기

### 한글 라벨 매핑 (14 사이트)
gain(게인), woodong(우동), sunbi(선비), simmani(심마니), win(윈), aura(아우라),
bacad(바칽), camstouch(칠스터치), james(제임스), misskim(미스김), naman(나만),
romi(로미), second(세컨드), soktv(속TV), cham(참)

---

## 데이터 무결성 현황 (2026-08-20 기준, 총 4,875건)

| 버킷 | 건수 |
|---|---|
| 이메일 무효 | 4 |
| 비밀번호 누락 | 44 |
| **비밀번호에 한글 별명** — 스왈 필요 | **1,941** |
| 비밀번호 형식 = URL | 0 |
| 비밀번호 형식 = 앜 패스워드 (정상) | 400 |
| YouTube URL 누락 | 383 |
| YouTube URL 자리에 앜 패스워드 (미스왈) | 0 (완료) |
| YouTube URL이 유튜브가 아닐 | 383 |
| 2FA 누락 | 460 |
| 2FA 형식 무효 | 0 |
| 파일명 mojibake 잔존 | 0 (4,026건 복구 완료) |
| 이메일 중복 | 0 |

### 수정 이력
- 파일명 UTF-8/latin1 mojibake 복구: **4,026건**
- 앜 패스워드가 youtube_url 자리에 있던 경우 스왈: **268건**
- 대체 후보(`extra`/`password_alts`)에서 앜 패스워드 추출 → password: **75건**

---

## 계정 상태·인증 기능 계획표 (공식 문서 기준 · 버전 정합)

### 버전 (공식 문서에 맞춤)
| 구성 | 버전/엔드포인트 | 공식 문서 |
|---|---|---|
| YouTube Data API | **v3** (`www.googleapis.com/youtube/v3`) | developers.google.com/youtube/v3/docs |
| Google Identity Services (로그인) | `accounts.google.com/gsi/client` (버전리스, 항상 최신) | developers.google.com/identity/gsi/web |
| Identity Platform Admin | `identitytoolkit.googleapis.com/admin/v2` + `/v2` | cloud.google.com/identity-platform/docs/reference/rest |
| Firebase JS SDK (미사용/대안) | `10.12.2` (gstatic CDN) | firebase.google.com/docs/auth/web/google-signin |
| 계정 자동화 엔진 | 서버 기존 `rebrowser-login.js` + Puppeteer/rebrowser (서버 설치 버전 그대로) | pptr.dev |
| Node 런타임 | gauth 서버 설치본 (`node -c` 문법검사로 정합 확인) | nodejs.org |
| GitHub Actions | `actions/checkout@v4`, `appleboy/ssh-action@v1.0.3`, `appleboy/scp-action@v0.1.7` | — |

### 기능 계획표 (단계 · 엔드포인트 · 프론트 · 상태)
| 단계 | 기능 | 데이터 소스 | 엔드포인트 (gauth Node) | 프론트 | 상태 |
|---|---|---|---|---|---|
| 1 | 채널 현황 (구독·영상·조회·생방송횟수·날짜·진행시간·공개상태) | YouTube Data API v3 (키) | `GET /api/youtube/channel-status?url=` | `/subsites.html` 계정별 `📊 채널상태` 버튼 | ✅ 완료 |
| 2 | 보안 점검 (2단계인증 유무·전화번호·복구정보·로그인성공) | Puppeteer(accounts.google.com) | `GET /api/account/security?email=` | `🔐 보안` 버튼 + 배지 | 🚧 진행 |
| 3 | 전화 2SV 강제 온보딩 (최초 로그인 자동 이동·SMS 발송·코드 입력) | Puppeteer | `POST /api/account/enforce-2sv` | `/onboarding.html` 자동 이동 | ⏳ 대기 |
| 4 | 커뮤니티/저작권 양호여부 (불리언) | OAuth `channels.list part=auditDetails` | `GET /api/account/standing?email=` | 배지 🟢/🔴 | ⏳ 대기 |

### API로 불가능(공식 확인) — 자동화로만 또는 불가
- **스트라이크 상세**(횟수·시기·사유·교육 이수): YouTube 스튜디오 전용, 공개 API 없음 → auditDetails 불리언이 최대치
- **종료 방송 피크/최저 시청자**: Data API 미제공 (생방송 중 `concurrentViewers`만)
- **Google 2SV 유무·전화번호**: 계정 보안설정 API 없음 → Puppeteer 자동화로만

### 로직 연결 (코드 간 의존)
- 계정 DB(`accounts_normalized.json`: email·password·totp_secret·youtube_url)
  → ①은 `youtube_url`로 채널 조회, ②③은 `email`+`password`+`totp_secret(/codes)`로 Puppeteer 로그인
- 로그인 세션(`gauth_uid` 쿠키) → `/api/account-status` 실시간 폴링(5초) → 상태 배지 갱신

---

## GitHub Actions 워크플로우 (배포/운영)

- `diag-gauth-excel.yml` — jump 배포 (index/manifest/sw + Apache vhost + no-store + Let's Encrypt)
- `create-cham-site.yml` — cham.cent-solution.online 사이트 생성
- `cham-ssl-retry.yml` — cham SSL 재시도
- `list-smm-gmails.yml` — SMM 주문 URL ↔ gauth DB gmail 매칭 조회
- `distribute-matched-gmails.yml` — 매칭된 gmail 1개/사이트 배포
- `gauth-restore-main.yml` — gauth 메인 index.html 복원 + 하위 탭 제거
- `gauth-strip-subsite-from-main.yml` — 메인에서 하위 사이트 카드 삭제 (재발 방지)
- `gauth-fix-authquery.yml` — `authQuery`/`noCacheQuery` pass-through shim 주입
- `gauth-diag-fetch-html.yml` — fetch가 HTML 돌려주는 URL 진단
- `gauth-excel-diag.yml` — 엑셀 파서 컬럼 매핑 진단
- `gauth-excel-fix.yml` — mojibake/password swap DB 재정규화
- `gauth-audit.yml` — 4,875건 무결성 버킷 집계
- `gauth-google-signup.yml` — GIS 우상단 위젯 배포 (10년 쿠키)
- 각 워크플로우는 `workflow_dispatch` 또는 `.github/trigger-*.txt` 파일 변경으로 발동

---

## 준수 규칙 (절대)

- 사용자에게 터미널 명령 지시 금지 — 모든 배포는 GitHub Actions/SSH 자동화
- 유료 라이브러리/서비스 금지
- 공식 문서만 참조 (MDN, GitHub 원본, W3C, Google Identity Services 공식)
- 서버 IP 마스킹 — 문서에 노출 금지
- gauth 메인은 마스터 전용, 하위 계정 UI 재삽입 금지
- 도박 단어 사용 금지
- 삭제된 서버 언급 금지 (우동카1~4, 우주1, 망치1, 의리1)
