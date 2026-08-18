# gauth — Google Account Management System

## 시스템 구조

```
[브라우저] ──HTTPS──> [Cloudflare] ──> [Apache 리버스프록시 :443]
                                           │
                                    ┌──────┴──────┐
                                    │  /api/*  ───┼──> Express :4000
                                    │  정적파일 ──┼──> /var/www/sites/gauth/public/
                                    └─────────────┘

Express :4000 (rebrowser-login.js)
  ├── upload_excels.js    ─ 엑셀 업로드/파싱
  ├── auto_deploy.js      ─ 배포/검색/로그인 API
  ├── youtube-oauth-auto.js ─ YouTube OAuth 자동 연결
  ├── lib/
  │   ├── login/
  │   │   ├── google.js    ─ Puppeteer Google 로그인 엔진 (모듈화)
  │   │   ├── selectors.js ─ Google 로그인 페이지 CSS 셀렉터
  │   │   └── urls.js      ─ Google 인증 URL 상수
  │   ├── captcha/
  │   │   ├── index.js     ─ CAPTCHA 솔버 메인
  │   │   ├── audio_solver.js ─ 오디오 CAPTCHA (Gemini STT)
  │   │   └── gemini_visual.js ─ 이미지 CAPTCHA (Gemini Vision)
  │   └── providers/
  │       ├── proxy/       ─ 프록시 풀 관리
  │       └── captcha/     ─ CAPTCHA 프로바이더
  ├── advanced-google-login-v2.js ─ Puppeteer 로그인 (레거시)
  └── accounts_normalized.json    ─ 계정 데이터 (마스터)
```

## 서버 정보

| 항목 | 값 |
|------|-----|
| URL | `https://gauth.cent-solution.online/` |
| 프론트엔드 | `/var/www/sites/gauth/public/index.html` |
| Express 서버 | `/opt/gauth-full/rebrowser-login.js` (port 4000) |
| 데이터 파일 | `/opt/gauth-full/accounts_normalized.json` |
| systemd 서비스 | `gauth` |
| 가상 디스플레이 | Xvfb :99 (Puppeteer용) |
| 서버 IP | (마스킹) |

## 파일 구조

```
make/
├── gauth/
│   ├── index.html              # 대시보드 프론트엔드 (SPA, 1330줄)
│   ├── sw.js                   # Service Worker (캐시 gauth-v7)
│   ├── manifest.json           # PWA 매니페스트
│   ├── upload_excels.js        # 엑셀 파서 + 업로드 API (905줄)
│   ├── auto_deploy.js          # 배포/검색/로그인 API (666줄)
│   ├── youtube-oauth-auto.js   # YouTube OAuth 자동 연결 (372줄)
│   ├── diagnose.sh             # 서버 진단 스크립트
│   ├── search-email.sh         # 이메일 검색 스크립트
│   ├── xlsx.core.min.js        # SheetJS (클라이언트용)
│   └── lib/
│       ├── login/
│       │   ├── google.js       # 모듈화된 Google 로그인 (738줄)
│       │   ├── selectors.js    # CSS 셀렉터 정의 (149줄)
│       │   └── urls.js         # 인증 URL 상수 (110줄)
│       ├── captcha/
│       │   ├── index.js        # CAPTCHA 솔버 메인 (79줄)
│       │   ├── audio_solver.js # 오디오 CAPTCHA 솔버 (366줄)
│       │   └── gemini_visual.js # 이미지 CAPTCHA 솔버 (122줄)
│       └── providers/
│           ├── proxy/
│           │   ├── index.js    # 프록시 풀 매니저
│           │   └── fetch_free.js # 무료 프록시 수집
│           └── captcha/
│               ├── index.js    # CAPTCHA 프로바이더
│               └── gemini_text.js # Gemini 텍스트 CAPTCHA
├── advanced-google-login-v2.js # Puppeteer 로그인 엔진 (레거시, 739줄)
├── package.json
├── trigger/
│   └── render-fix.txt          # photo3 렌더 수정 트리거
├── .github/workflows/
│   ├── deploy-gauth.yml        # gauth CI/CD 파이프라인
│   ├── gauth-api-test.yml      # gauth API 테스트 (300항목)
│   ├── gauth-diagnose.yml      # 서버 진단
│   ├── gauth-server-diagnose.yml # 서버 SSH 진단
│   ├── gauth-server-html-check.yml # 서버 HTML 검증
│   ├── fix-photo3-*.yml        # 참교육 photo3 수정 (7개)
│   ├── diag-photo3-html.yml    # photo3 HTML 진단
│   ├── test-photo3-verify.yml  # photo3 검증
│   └── yt-portrait-test-push.yml # YouTube 세로 테스트
├── CLAUDE.md
└── README.md
```

---

## 의존성 + 공식 문서 매핑

### Node.js 핵심 모듈

| 모듈 | 사용 위치 | 사용 API | 공식 문서 |
|------|-----------|----------|-----------|
| `fs` | upload_excels.js, auto_deploy.js, login-v2.js | `readFileSync`, `writeFileSync`, `renameSync`, `unlinkSync`, `mkdirSync`, `existsSync`, `copyFileSync` | https://github.com/nodejs/node/blob/main/doc/api/fs.md |
| `path` | 전체 | `join`, `basename`, `resolve` | https://github.com/nodejs/node/blob/main/doc/api/path.md |
| `crypto` | auto_deploy.js | `createHmac`, `timingSafeEqual` | https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b |
| `child_process` | auto_deploy.js | `execSync`, `execFileSync` | https://github.com/nodejs/node/blob/main/doc/api/child_process.md#child_processexecfilesyncfile-args-options |

### npm 패키지

| 패키지 | 버전 | 사용 위치 | 용도 | 공식 문서 (GitHub 원본) |
|--------|------|-----------|------|------------------------|
| express | ^4.21.2 | rebrowser-login.js | HTTP 서버, 라우팅 | https://github.com/expressjs/express |
| multer | ^1.4.5-lts.1 | upload_excels.js | multipart 파일 업로드 | https://github.com/expressjs/multer#readme |
| xlsx (SheetJS) | ^0.18.5 | upload_excels.js, index.html | 엑셀 파싱 (`.xlsx`, `.xls`, `.csv`) | https://github.com/SheetJS/sheetjs |
| otplib | ^12.0.1 | login-v2.js, rebrowser-login.js | TOTP 코드 생성 (RFC 6238) | https://github.com/yeojz/otplib |
| hi-base32 | ^0.5.1 | (otplib 내부) | Base32 인코딩/디코딩 (RFC 4648) | https://github.com/emn178/hi-base32 |
| rebrowser-puppeteer | ^24.8.1 | login-v2.js | 봇 감지 회피 Puppeteer | https://github.com/rebrowser/rebrowser-puppeteer |
| puppeteer | ^25.0.0 | login-v2.js | 브라우저 자동화 | https://github.com/puppeteer/puppeteer (공식: https://pptr.dev) |
| puppeteer-extra | ^3.3.6 | login-v2.js | Puppeteer 플러그인 프레임워크 | https://github.com/berstend/puppeteer-extra |
| puppeteer-extra-plugin-stealth | ^2.11.2 | login-v2.js | Stealth 플러그인 (봇 감지 회피) | https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth |
| archiver | ^7.0.1 | rebrowser-login.js | ZIP 파일 생성 (엑셀 내보내기) | https://github.com/archiverjs/node-archiver |
| ws | ^8.18.0 | (미사용 또는 WebSocket) | WebSocket 클라이언트 | https://github.com/websockets/ws |
| dotenv | ^16.4.7 | (환경변수 로드) | `.env` 파일 파서 | https://github.com/motdotla/dotenv |

### 프론트엔드 라이브러리

| 라이브러리 | 파일 | 용도 | 공식 문서 |
|-----------|------|------|-----------|
| SheetJS (xlsx.core.min.js) | gauth/xlsx.core.min.js | 클라이언트 측 mailto 하이퍼링크 복구 | https://github.com/SheetJS/sheetjs |

---

## API 엔드포인트 전체 매핑

### `upload_excels.js` — 1개 라우트

| 메서드 | 경로 | 인증 | 핸들러 | 공식 문서 참조 |
|--------|------|------|--------|---------------|
| POST | `/api/upload-excels` | 없음 | multer `.array('files', 50)` → `parseExcelFile()` → atomic write | multer: https://github.com/expressjs/multer#arrayfieldname-maxcount |

### `auto_deploy.js` — 5개 라우트 (전부 `authMiddleware` 적용)

| 메서드 | 경로 | 핸들러 | 설명 |
|--------|------|--------|------|
| POST | `/api/deploy` | git clone → 파일 복사 → npm install → systemctl restart | 코드 배포 |
| POST | `/api/update-secret` | JSON 읽기 → TOTP 수정 → atomic write | 개별 TOTP 시크릿 수정 |
| GET | `/api/search-account?q=` | 이메일/extra 부분 검색 (최소 3글자) | 계정 검색 |
| GET | `/api/deploy-status` | Chrome/Xvfb/Node/Display 상태 | 서버 진단 |
| POST | `/api/login-one` | `advancedGoogleLogin()` 호출 (최대 3 동시) | 개별 Puppeteer 로그인 |

### `rebrowser-login.js` (서버 전용, 이 저장소에 없음) — 추정 라우트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/accounts` | 전체 계정 (세션 정보 포함) |
| GET | `/api/normalized-accounts` | 정규화 계정 목록 |
| GET | `/api/profiles` | Puppeteer 프로필 디렉토리 목록 |
| GET | `/api/failed-accounts` | 실패 계정 목록 |
| DELETE | `/api/failed-accounts/:email` | 잠금 해제 |
| GET | `/api/lookup/:email` | 개별 계정 조회 |
| GET | `/api/parse-report` | 마지막 파싱 결과 |
| POST | `/api/open-profile` | Chrome 프로필 열기 |
| POST | `/api/login` | 기본 로그인 |
| POST | `/api/start` | 배치 로그인 시작 |
| POST | `/api/stop` | 배치 로그인 정지 |
| POST | `/api/export-split` | N분할 엑셀 ZIP 내보내기 |
| GET | `/codes/:secret` | TOTP 코드 실시간 생성 |

**authMiddleware 동작** (HMAC 고정 길이 비교):
```javascript
const key = process.env.GAUTH_API_TOKEN || 'gauth';
const hmac = (s) => crypto.createHmac('sha256', key).update(s).digest();
if (!crypto.timingSafeEqual(hmac(token), hmac(expected)))
```

---

## 프론트엔드 구성 (index.html)

### 상단 통계 바
| UI 요소 | 기능 | JS 함수 | API |
|---------|------|---------|-----|
| 📊 로딩 중... | 계정 통계 자동 로드 | `refreshAccStats()` | `/api/parse-report`, `/api/accounts`, `/api/normalized-accounts` |
| 📁 파일별 계정 수 | 파일별 계정 통계 (접기/펼치기) | `refreshAccStats()` 내부 | 동일 |

### 엑셀 업로드
| 버튼 | 기능 | JS 함수 | API |
|------|------|---------|-----|
| 📁 폴더 전체 스캔 | `webkitdirectory`로 폴더 재귀 스캔 | `#folderInput` change | 없음 (클라이언트) |
| 🗑 초기화 | 선택 파일 목록 초기화 | `renderList()` 내부 | 없음 |
| ▶ 업로드 & 취합 | 엑셀 업로드 → 서버 파싱 → 머지 | `fixHyperlinksAndUpload()` → `doUpload()` | POST `/api/upload-excels` |

### 계정 조회
| 버튼 | 기능 | JS 함수 | API |
|------|------|---------|-----|
| 조회 (Enter) | 이메일로 계정 검색 | `lookup()` | GET `/api/lookup/:email`, 폴백: GET `/api/search-account?q=` |
| ✏️ 시크릿 수정 | TOTP 시크릿 직접 편집 | `editSecret()` | POST `/api/update-secret` |
| 🔄 새로고침 | TOTP 코드 재생성 | `lookupRefreshCode()` | GET `/codes/:secret` |
| 🔑 프로그램 로그인 | Puppeteer 자동 로그인 | `programLogin()` | POST `/api/login-one` |
| 🔓 Chrome 열기 | 기존 세션 브라우저 열기 | `openIt()` | POST `/api/open-profile` |

### 계정 목록 (메인 테이블)
| 버튼 | 기능 | JS 함수 | API |
|------|------|---------|-----|
| 이메일 클릭 | 빠른 조회 | `quickLookup()` | GET `/api/lookup/:email` |
| 🔍 정보 | 세션 없는 계정 조회 | `quickLookup()` | 동일 |
| 🔑 로그인 | 개별 자동 로그인 | `programLogin()` | POST `/api/login-one` |
| 🔓 잠금해제 | 실패 잠금 해제 | `unlockAccount()` | DELETE `/api/failed-accounts/:email` |

### 필터/내보내기
| 버튼 | 기능 | JS 함수 | API |
|------|------|---------|-----|
| 🔍 필터 입력 | 이메일 부분 검색 | `applyFilter()` | 없음 (클라이언트) |
| 전체/오늘/2FA/미접속/잠김 | 카테고리 필터 | `applyFilter()` | 없음 |
| 📥 다운로드 | N분할 엑셀 ZIP | click handler | POST `/api/export-split` |
| ▶ 미로그인만 로그인 | 배치 자동 로그인 | click handler | POST `/api/start` |
| ■ 정지 | 배치 정지 | click handler | POST `/api/stop` |

### 시간 순서 뷰
| 버튼 | 기능 | JS 함수 |
|------|------|---------|
| 계정 조회 | 시간순 정렬 로드 | `tdLoad()` |
| 오래된순/최신순 | 정렬 방향 | select → `tdLoad()` |
| 페이지네이션 «‹›» | 20개씩 페이지 | `tdGoto()` |
| ✏️ / 🔄 / 🔑 | 시크릿 수정/코드 새로고침/로그인 | `editSecret()`, `tdRefreshCode()`, `programLogin()` |

### 하단 메뉴 (bottom-menu)
| 버튼 | 기능 |
|------|------|
| 🌐 사이트맵 | 사이트맵 패널 토글 (site-map-footer-inline) |
| 📡 YouTube 일괄 | YouTube 일괄 연결 패널 토글 (yt-batch-box) |

### 프론트엔드 인증

| 항목 | 값 | 공식 문서 |
|------|-----|-----------|
| 저장소 | `sessionStorage` 키 `gauth_token` | https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage |
| 전송 | `Authorization: Bearer <token>` 헤더 또는 `?token=` 쿼리 | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch |

### localStorage / sessionStorage

| 키 | 저장소 | 용도 |
|----|--------|------|
| `gauth_uploading` | localStorage | 업로드 진행 타임스탬프 |
| `gauth_last_upload` | localStorage | 마지막 업로드 결과 JSON |
| `gauth_last_lookup` | localStorage | 마지막 조회 이메일 |
| `gauth_token` | sessionStorage | API 인증 토큰 |

---

## 엑셀 파싱 로직

### 파싱 전략 (4단계 폴백)

```
엑셀 파일 입력
  │
  ├─ 0) 전처리: 병합 셀 확장 + mailto 하이퍼링크 복구
  ├─ 1) 헤더 행 감지 (detectHeaderMapping) — 한/영 헤더 자동 매핑
  ├─ 2) 세로/라벨-값 레이아웃 (tryVerticalExtract)
  ├─ 3) 컬럼 통계 분석 (analyzeColumns) — @비율, Base32비율 등
  └─ 4) 브루트포스 (bruteForceExtract) — 전체 셀 무차별 스캔
```

### TOTP 시크릿 검증

```
RFC 4648 Base32: A-Z, 2-7만 허용
RFC 6238 TOTP: 30초 스텝, SHA-1, 6자리

검증 (isTotpLike):
  - @포함 → 거부 (이메일)
  - 숫자만 → 거부 (전화번호)
  - http:// → 거부 (URL)
  - 특수문자 → 거부 (비밀번호)
  - 정규화 후 16자 미만 / 128자 초과 → 거부
  - Base32 비율 80% 미만 → 거부

otpauth:// URL: secret= 파라미터 추출 지원
```

### 데이터 머지 규칙

```
기존 계정 발견 시 (normalizeEmail로 소문자 비교):
  password     → 항상 덮어쓰기
  totp_secret  → isTotpLike 통과한 값만 덮어쓰기
  recovery_email → 항상 덮어쓰기
  youtube_url  → 항상 덮어쓰기

저장: atomic write (tmp+rename)
동시 접근: withFileLock() Promise 체인 뮤텍스
```

---

## Puppeteer 로그인 엔진

### 로그인 흐름

```
1. 브라우저 실행 (headed + stealth) → userDataDir: ./profiles/<email>/
2. myaccount.google.com 접속 → 이미 로그인 시 즉시 반환
3. 이메일 입력 (5개 셀렉터, 50-150ms 딜레이)
4. 2FA 조기 감지 (Google이 비밀번호 건너뛸 때)
5. 비밀번호 입력
6. 2FA 처리 (otplib TOTP 6자리)
7. 보안 챌린지 감지 (패스키/전화/reCAPTCHA/기기인증)
8. 결과 반환
```

### CAPTCHA 솔버 (lib/captcha/)

| 솔버 | 파일 | 방식 |
|------|------|------|
| 오디오 CAPTCHA | audio_solver.js | Gemini STT API |
| 이미지 CAPTCHA | gemini_visual.js | Gemini Vision API |
| Gemini 키 로테이션 | — | GEMINI_API_KEY ~ GEMINI_API_KEY_8 |

### 결과 타입

| 값 | 의미 |
|----|------|
| `SUCCESS` | 로그인 성공 |
| `ALREADY_LOGGED` | 이미 로그인 상태 |
| `WRONG_PASSWORD` | 비밀번호 틀림 |
| `WRONG_2FA` | 2FA 코드 틀림 |
| `PHONE_REQUIRED` | 전화 인증 요구 |
| `CAPTCHA_REQUIRED` | CAPTCHA 발생 |
| `UNUSUAL_ACTIVITY` | 비정상 활동 감지 |
| `TIMEOUT` | 시간 초과 |
| `UNKNOWN_ERROR` | 알 수 없는 오류 |

---

## CI/CD 배포 (deploy-gauth.yml)

### 트리거

- `push` → `claude/gauth-frontend-backend-fixes-cg2icv` 브랜치
- `workflow_dispatch` (수동)

### 배포 순서

```
1. API 배포 시도 (POST /api/deploy)
   └─ 실패 시 SSH 배포 폴백

2. SSH 배포 (6단계)
   ├─ [1] 시스템 패키지 (Xvfb, Chrome, 한글폰트)
   ├─ [2] 가상 디스플레이 (Xvfb :99)
   ├─ [2.5] NTP 시간 동기화 (TOTP 필수)
   ├─ [3] Node.js 확인
   ├─ [4] 코드 다운로드 (프론트엔드 + 백엔드 파일)
   ├─ [5] npm install + 모듈 등록 + TOTP 패치
   └─ [6] 서비스 재시작 + 헬스체크

3. 서버 HTML 진단 (SSH)
   └─ id 목록, 핵심 키워드 검색, md5sum 확인

4. Cloudflare 보안 레벨 설정
5. Apache 프록시 + DNS 확인
```

### 배포 대상 파일

| 서버 경로 | 소스 |
|-----------|------|
| `/var/www/sites/gauth/public/index.html` | gauth/index.html |
| `/var/www/sites/gauth/public/sw.js` | gauth/sw.js |
| `/var/www/sites/gauth/public/manifest.json` | gauth/manifest.json |
| `/var/www/sites/gauth/public/xlsx.core.min.js` | gauth/xlsx.core.min.js |
| `/opt/gauth-full/upload_excels.js` | gauth/upload_excels.js |
| `/opt/gauth-full/auto_deploy.js` | gauth/auto_deploy.js |
| `/opt/gauth-full/youtube-oauth-auto.js` | gauth/youtube-oauth-auto.js |
| `/opt/gauth-full/lib/` | gauth/lib/ (전체) |

---

## 보안 구현

| 보안 항목 | 구현 | 공식 문서 |
|-----------|------|-----------|
| 타이밍 공격 방지 | HMAC SHA-256 + `timingSafeEqual` | https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b |
| 셸 인젝션 방지 | `execFileSync` (인자 배열) | https://github.com/nodejs/node/blob/main/doc/api/child_process.md |
| XSS 방지 | `escapeHtml()` — `& < > " '` 이스케이프 | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html |
| 경로 탐색 방지 | `sanitizeEmail()` — POSIX/Windows 금지 문자 제거 | https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap03.html#tag_03_170 |
| Atomic write | `writeFileSync(tmp)` + `renameSync(tmp, target)` | https://github.com/nodejs/node/blob/main/doc/api/fs.md |
| Race condition 방지 | `withFileLock()` Promise 체인 뮤텍스 | 자체 구현 |
| 동시 로그인 제한 | `MAX_CONCURRENT_LOGINS = 3` | Express 자체 구현 |
| 토큰 미설정 차단 | `GAUTH_API_TOKEN` 없으면 503 | 자체 구현 |

---

## 데이터 형식 (accounts_normalized.json)

```json
[
  {
    "email": "user@gmail.com",
    "password": "비밀번호",
    "totp_secret": "BASE32SECRET",
    "recovery_email": "backup@gmail.com",
    "youtube_url": "https://youtube.com/@channel",
    "extra": [],
    "source_file": "원본파일.xlsx"
  }
]
```

---

## 참조 공식 문서

### Node.js
| 주제 | URL |
|------|-----|
| fs | https://github.com/nodejs/node/blob/main/doc/api/fs.md |
| path | https://github.com/nodejs/node/blob/main/doc/api/path.md |
| crypto | https://github.com/nodejs/node/blob/main/doc/api/crypto.md |
| child_process | https://github.com/nodejs/node/blob/main/doc/api/child_process.md |

### npm 패키지
| 패키지 | URL |
|--------|-----|
| express | https://github.com/expressjs/express |
| multer | https://github.com/expressjs/multer |
| SheetJS | https://github.com/SheetJS/sheetjs |
| otplib | https://github.com/yeojz/otplib |
| puppeteer | https://pptr.dev |
| puppeteer-extra | https://github.com/berstend/puppeteer-extra |
| stealth | https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth |
| archiver | https://github.com/archiverjs/node-archiver |

### RFC 표준
| 표준 | URL |
|------|-----|
| RFC 4648 (Base32) | https://www.rfc-editor.org/rfc/rfc4648#section-6 |
| RFC 6238 (TOTP) | https://www.rfc-editor.org/rfc/rfc6238 |
| RFC 4226 (HOTP) | https://datatracker.ietf.org/doc/html/rfc4226#section-4 |

---

## 변경 이력

### 프론트엔드 수정 (13건)

| # | 항목 | 변경 내용 |
|---|------|----------|
| 1 | XSS 방지 | innerHTML → `escapeHtml()` 전처리 |
| 2 | 클립보드 | `execCommand` → `navigator.clipboard.writeText()` + Selection API 폴백 |
| 3 | VM 비밀번호 | localStorage → sessionStorage |
| 4 | 프로필 폴더 변환 | 2-part 도메인 → multi-dot 도메인 대응 |
| 5 | Optional chaining | `?.` `??` → `&&` 체인 (ES5 호환) |
| 6 | `@gmail.com` 자동 추가 | 제거 (데이터 오염 방지) |
| 7-11 | 고스트 필드 | `login_method`, `recovery_phone`, `source_row` 삭제 |
| 12 | CSS 이중 세미콜론 | `;;` → `;` |
| 13 | 스크롤 정렬 | `position:absolute` → 자연 문서 흐름 |

### 백엔드 수정 (42건)

| 영역 | 주요 변경 |
|------|----------|
| auto_deploy.js | HMAC 타이밍 공격 방지, 브랜치 sanitize, TOTP 길이 RFC 준수 |
| upload_excels.js | otpauth URL 파싱 개선, Race condition 방지 (withFileLock) |
| login-v2.js | sanitizeEmail POSIX 준수, TOTP 마스킹, reCAPTCHA 유료 코드 삭제 |
| deploy-gauth.yml | 테스트 이메일 삭제, 로그 축소, 일회성 정리 블록 삭제 |

### 삭제된 기능

| 기능 | 사유 |
|------|------|
| GCP 서버 제어 (vmCtrlBox) | 불필요 — HTML + CSS + JS 164줄 삭제 |
| 자동연결 배치 (startBatchConnect) | 불필요 — HTML 버튼 + JS 함수 삭제 |
| 중복 사이트맵 (floating) | 인라인 버전과 중복 — floating 버전 삭제 |

---

## 제약사항

- Google 보안 챌린지 (패스키/기기인증/전화인증) 자동화 불가
- CAPTCHA 발생 시 Gemini API 솔버 시도 → 실패 시 120초 대기
- headed 모드 전용 (headless 감지됨)
- Xvfb 가상 디스플레이 필수
