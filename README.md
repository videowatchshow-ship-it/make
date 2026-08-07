# gauth — YouTube 멀티라이브 채널 자동연결

## 서버

| 항목 | 값 |
|------|---|
| URL | https://gauth.cent-solution.online |
| 인스턴스 | `gucci-yanolza` (GCP asia-southeast1-b, e2-small) |
| IP | 35.247.130.253 |
| GCP 프로젝트 | `quantum-bonus-455522-b4` |
| SSH 유저 | `chamgyo` |
| 서비스 | systemd `gauth` (Express, port 4000) |

## 파일 구조

### 서버 (`/opt/gauth-full/`)

| 파일 | 역할 |
|------|------|
| `auto_deploy.js` | Express API (계정 조회, batch-connect, 배포) |
| `youtube-oauth-auto.js` | Puppeteer OAuth consent → refresh_token |
| `lib/login/google.js` | Google 자동 로그인 (CAPTCHA/TOTP/URL분류/디버그) |
| `lib/login/selectors.js` | 셀렉터 사전 (40+개 fallback) |
| `lib/login/urls.js` | URL 분류기 (classify — RECOVERY_EMAIL_CHALLENGE 포함) |
| `lib/providers/proxy/index.js` | 프록시 회전 (환경변수 + proxy_pool.json) |
| `lib/providers/proxy/fetch_free.js` | 무료 SOCKS5 프록시 자동 갱신 (30분 cron) |
| `lib/providers/captcha/gemini_visual.js` | Gemini Vision CAPTCHA solver (safeBfAction) |
| `proxy_pool.json` | 무료 프록시 200개 (자동 갱신) |
| `accounts_normalized.json` | 계정 데이터 (4272개) |
| `upload_excels.js` | 엑셀 파서 (TOTP/URL sanitize) |

### 프론트엔드 (`/var/www/sites/gauth/public/`)

| 파일 | 역할 |
|------|------|
| `index.html` | UI (계정 목록, 자동연결 버튼) |

### 로컬 (`gauth/`)

| 파일 | 역할 |
|------|------|
| `auto_deploy.js` | 서버 배포용 소스 |
| `index.html` | 프론트엔드 소스 |
| `youtube-oauth-auto.js` | OAuth 모듈 소스 |

## 자동연결

### API

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/batch-connect/start` | `{count}` — 자동연결 시작 |
| GET | `/api/batch-connect/status` | 진행 상태 |
| POST | `/api/batch-connect/stop` | 중지 |

인증: `Authorization: Bearer 1147`

### 흐름

1. Chrome + Xvfb (port 9222, `--disable-blink-features=AutomationControlled`)
2. 프록시 회전 (proxy_pool.json 200개 SOCKS5 — CAPTCHA 회피)
3. `lib/login/google.js`로 Google 로그인 (이메일→비밀번호→TOTP/복구이메일)
4. RECOVERY_EMAIL_CHALLENGE → recovery_email 자동 입력
5. DEVICE_PROMPT/PHONE_REQUIRED → challenge selection → TOTP 또는 복구이메일
6. OAuth consent 자동 처리 → refresh_token 획득
7. 참교육 DB (`gucci_yt_channels`, `gucci_yt_channel_tokens`) 등록

### 제외 규칙

- `vin7899`, `videowatch.show`, `rhkdrh999` 포함 계정 절대 사용 금지
- 리스트 상위 30개 계정 무작위 선택에서 제외

## 참교육 멀티라이브

| 항목 | 값 |
|------|---|
| 서버 | `my-site-1` (GCP Tokyo, 34.85.126.48) |
| GitHub | `videowatchshow-ship-it/chamgyo` → main push → Actions 자동배포 |
| 관리 | `/admin/mode-a/03/` |
| 영상 | A/B/C/D 4개 체제 |
| 채팅 | `ml-chat-cron.php` (시작 1회 + 60분마다) |
| 비밀번호 | 1147 |

### OAuth Client 4개

| # | 용도 |
|---|------|
| 1 | 기본 |
| 2 | 백업 |
| 3 | 백업 |
| 4 | 최신 (`.env`에 설정) |

## 배포

GitHub push → 서버 SSH로 clone + cp + 서비스 재시작.

## 원본 참조 (GitHub)

### Google 로그인 자동화
- 셀렉터 (continue-with-google, 2026-06): https://github.com/the-type-founders/continue-with-google/blob/main/src/index.ts
- TOTP fallback (puppeteer_admin_google): https://github.com/hasanbasri1993/puppeteer_admin_google/blob/main/services/authService.js
- Challenge URL 패턴 (Gmail_tools): https://github.com/AfterDawn1130/Gmail_tools/blob/main/oauth-login/src/google-login.js
- Recovery phone 처리 (crawlspec/google-login): https://github.com/crawlspec/google-login/blob/main/puppeteer.js
- Google 공식 challenge 종류: https://support.google.com/a/answer/6002699

### Puppeteer / rebrowser
- rebrowser-patches (자동화 감지 우회): https://github.com/rebrowser/rebrowser-patches
- rebrowser-puppeteer (drop-in 대체): https://github.com/rebrowser/rebrowser-puppeteer
- Puppeteer 공식 cookies API: https://pptr.dev/guides/cookies
- Puppeteer BrowserContext proxy: https://pptr.dev/api/puppeteer.browsercontextoptions

### CAPTCHA
- Gemini Vision API 공식: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini generationConfig 공식: https://ai.google.dev/api/generate-content
- reCAPTCHA solver 프롬프트 패턴: https://github.com/njraladdin/recaptcha-v2-solver

### 프록시 (무료, GitHub 자동 갱신)
- proxifly/free-proxy-list (5분 갱신): https://github.com/proxifly/free-proxy-list
- TheSpeedX/PROXY-List (매일): https://github.com/TheSpeedX/PROXY-List
- vakhov/fresh-proxy-list (5-20분): https://github.com/vakhov/fresh-proxy-list

### YouTube / OAuth
- YouTube OAuth 공식: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube Channels API: https://developers.google.com/youtube/v3/docs/channels/list

### 서버
- Express 라우터: https://github.com/expressjs/express/blob/master/lib/router/index.js
- Node.js crypto (TOTP): https://github.com/nodejs/node/blob/main/doc/api/crypto.md
- TOTP RFC 6238: https://www.rfc-editor.org/rfc/rfc6238
- Base32 RFC 4648: https://www.rfc-editor.org/rfc/rfc4648
- multer (파일 업로드): https://www.npmjs.com/package/multer
- xlsx (엑셀 파서): https://docs.sheetjs.com/

### 프론트엔드
- Fetch API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
