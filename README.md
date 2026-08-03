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
  ├── advanced-google-login-v2.js ─ Puppeteer 로그인 엔진
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
│   ├── index.html           # 대시보드 프론트엔드 (SPA)
│   ├── upload_excels.js     # 엑셀 파서 + 업로드 API
│   ├── auto_deploy.js       # 배포/검색/로그인 API (5개 라우트)
│   └── xlsx.core.min.js     # SheetJS (클라이언트용)
├── advanced-google-login-v2.js  # Puppeteer Google 로그인 엔진
├── package.json
├── .github/workflows/
│   └── deploy-gauth.yml    # CI/CD 파이프라인
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
| POST | `/api/upload-excels` | 없음 (인증 제거됨 — 프론트엔드 사용자는 서버 토큰에 접근 불가) | multer `.array('files', 50)` → `parseExcelFile()` → atomic write | multer: https://github.com/expressjs/multer#arrayfieldname-maxcount |

사용하는 SheetJS API:
- `XLSX.readFile(path)` — https://github.com/SheetJS/sheetjs (README "Parsing Workbooks")
- `XLSX.utils.sheet_to_json(sheet, {header:1, defval:'', raw:false})` — `raw:false`는 포맷된 텍스트 반환, 선행 0 보존 (types/index.d.ts `Sheet2JSONOpts.raw`)
- `XLSX.utils.encode_cell({r, c})` — 셀 주소 인코딩 (A1 형식)
- `XLSX.utils.encode_range({s, e})` — 범위 인코딩
- `worksheet['!merges']` — 병합 셀 배열 (README "Worksheet Object")
- `cell.l.Target` — 하이퍼링크 (README "Cell Object" `.l` property)

### `auto_deploy.js` — 5개 라우트 (전부 `authMiddleware` 적용)

| 메서드 | 경로 | 핸들러 | 설명 | 참조 |
|--------|------|--------|------|------|
| POST | `/api/deploy` | git clone → 파일 복사 → npm install → systemctl restart | 코드 배포 | child_process.execFileSync: https://github.com/nodejs/node/blob/main/doc/api/child_process.md |
| POST | `/api/update-secret` | JSON 읽기 → TOTP 수정 → atomic write | 개별 TOTP 시크릿 수정 | crypto.timingSafeEqual: https://github.com/nodejs/node/blob/main/doc/api/crypto.md |
| GET | `/api/search-account?q=` | 이메일/extra 부분 검색 (최소 3글자) | 계정 검색 | |
| GET | `/api/deploy-status` | Chrome/Xvfb/Node/Display 상태 | 서버 진단 | |
| POST | `/api/login-one` | `advancedGoogleLogin()` 호출 (최대 3 동시) | 개별 Puppeteer 로그인 | |

**authMiddleware 동작** (HMAC 고정 길이 비교):
```javascript
// HMAC으로 고정 길이(SHA-256 32바이트) 다이제스트 생성 → 길이 누출 방지
// ref: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
// ref: https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
const hmac = (s) => crypto.createHmac('sha256', 'gauth').update(s).digest();
if (!crypto.timingSafeEqual(hmac(token), hmac(expected)))
```

### `rebrowser-login.js` (서버 전용, 이 저장소에 없음) — 추정 라우트

| 메서드 | 경로 | 설명 | 프론트엔드 호출 위치 |
|--------|------|------|---------------------|
| GET | `/api/accounts` | 전체 계정 (세션 정보 포함) | index.html:46 |
| GET | `/api/normalized-accounts` | 정규화 계정 목록 | index.html:47,468 |
| GET | `/api/profiles` | Puppeteer 프로필 디렉토리 목록 | index.html:469 |
| GET | `/api/failed-accounts` | 실패 계정 목록 | index.html:470 |
| DELETE | `/api/failed-accounts/:email` | 잠금 해제 | index.html:642 |
| GET | `/api/lookup/:email` | 개별 계정 조회 | index.html:695 |
| GET | `/api/parse-report` | 마지막 파싱 결과 | index.html:45 |
| POST | `/api/open-profile` | Chrome 프로필 열기 | index.html:594 |
| POST | `/api/login` | 기본 로그인 | index.html:600 |
| POST | `/api/start` | 배치 로그인 시작 | index.html:937 |
| POST | `/api/stop` | 배치 로그인 정지 | index.html:942 |
| POST | `/api/export-split` | N분할 엑셀 ZIP 내보내기 | index.html:948 |
| GET | `/codes/:secret` | TOTP 코드 실시간 생성 | index.html:706,840 |
| GET | `/api/vm/list` | GCP VM 목록 | index.html:1054 |
| POST | `/api/vm/start` | VM 시작 | index.html:1038 |
| POST | `/api/vm/stop` | VM 정지 | index.html:1040 |

---

## 프론트엔드 인증

| 항목 | 값 | 공식 문서 |
|------|-----|-----------|
| 저장소 | `sessionStorage` 키 `gauth_token` | https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage |
| UI | `<input id="apiToken">` — 🔑 API 토큰 입력 필드 | — |
| 전송 | `Authorization: Bearer <token>` 헤더 (`authHeaders()`) 또는 `?token=` 쿼리 (`authQuery()`) | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch |

---

## 프론트엔드 버튼/기능 전체 매핑

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
| 버튼 | 기능 | JS 함수 | API |
|------|------|---------|-----|
| 계정 조회 | 시간순 정렬 로드 | `tdLoad()` | 없음 (인메모리 `ALL` 사용) |
| 오래된순/최신순 | 정렬 방향 | select change → `tdLoad()` | 없음 |
| 페이지네이션 «‹›» | 20개씩 페이지 | `tdGoto()` | 없음 |
| ✏️ / 🔄 / 🔑 | 개별 시크릿 수정/코드 새로고침/로그인 | `editSecret()`, `tdRefreshCode()`, `programLogin()` | 동일 |

### GCP VM 제어
| 버튼 | 기능 | JS 함수 | API |
|------|------|---------|-----|
| 🔄 상태 새로고침 | VM 목록 로드 | `loadList()` | GET `/api/vm/list` |
| ▶ 시작 | VM 시작 | delegated click | POST `/api/vm/start` |
| ■ 정지 | VM 정지 (confirm 필요) | delegated click | POST `/api/vm/stop` |
| 🖥 SSH | GCP Cloud Shell SSH | delegated click | 없음 (외부 URL 이동) |

### 사이트맵 (하단)
| 버튼 | 기능 |
|------|------|
| 🌐 | 사이트맵 팝업 열기 |
| ✕ | 사이트맵 닫기 |

### localStorage 사용

| 키 | 용도 | 읽기 위치 | 쓰기 위치 |
|----|------|-----------|-----------|
| `gauth_uploading` | 업로드 진행 타임스탬프 | 84-111 (폴링) | 271 (업로드 시작) |
| `gauth_last_upload` | 마지막 업로드 결과 JSON | 391-415 (`updateUploadStatus`) | 354-361 (업로드 완료) |
| `gauth_last_lookup` | 마지막 조회 이메일 | 521, 816 (자동 복원) | 693, 704 (조회 시) |
| `vm_admin_pw` | VM 관리 비밀번호 (**sessionStorage** — 탭 닫으면 소멸) | 1014 (읽기) | 1015 (변경 시) |

### sessionStorage 사용

| 키 | 용도 | 공식 문서 |
|----|------|-----------|
| `gauth_token` | API 인증 토큰 | https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage |
| `vm_admin_pw` | VM 관리 비밀번호 | https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage |

### 키보드 이벤트

| 키 | 요소 | 동작 |
|----|------|------|
| Enter | `#lookup` 입력창 | `lookup()` 실행 |
| input | `#q` 필터 입력창 | `applyFilter()` 실행 |

---

## 엑셀 파싱 로직 (공식 문서 기반)

### 사용하는 SheetJS API와 공식 출처

| API | 용도 | 공식 문서 위치 |
|-----|------|---------------|
| `XLSX.readFile(path)` | 엑셀 파일 읽기 | https://github.com/SheetJS/sheetjs — "Parsing Workbooks" |
| `XLSX.utils.sheet_to_json(sheet, opts)` | 시트 → 2D 배열 변환 | https://github.com/SheetJS/sheetjs — "Utility Functions" |
| `opts.header: 1` | 첫 행을 데이터로 취급 (헤더 사용 안 함) | types/index.d.ts `Sheet2JSONOpts` |
| `opts.raw: false` | 포맷된 텍스트 반환 → 선행 0 보존 (`0812345` → `"0812345"`, `true`면 `812345`) | types/index.d.ts `Sheet2JSONOpts.raw` |
| `opts.defval: ''` | 빈 셀을 빈 문자열로 | types/index.d.ts `Sheet2JSONOpts.defval` |
| `XLSX.utils.encode_cell({r, c})` | `{r:0, c:0}` → `"A1"` | types/index.d.ts `encode_cell` |
| `sheet['!merges']` | 병합 셀 범위 배열 `[{s:{r,c}, e:{r,c}}]` | README "Worksheet Object" |
| `cell.l.Target` | 셀 하이퍼링크 (mailto:, http:) | README "Cell Object" |
| `cell.v` | 셀 raw 값 | README "Cell Object" |
| `cell.w` | 셀 formatted 텍스트 | README "Cell Object" |

### 파싱 전략 (4단계 폴백)

```
엑셀 파일 입력
  │
  ├─ 0) 전처리
  │     ├─ expandMergedCells: sheet['!merges'] 배열에서 병합된 셀 값 복제
  │     │   (공식: SheetJS "Worksheet Object" — !merges property)
  │     └─ mailto 하이퍼링크 복구: cell.l.Target이 "mailto:"면 cell.v에 이메일 복원
  │         (공식: SheetJS "Cell Object" — .l hyperlink property)
  │
  ├─ 1) 헤더 행 감지 (detectHeaderMapping)
  │     처음 10행 스캔, 정규식으로 email/password/totp/recovery/youtube 컬럼 매핑
  │     한국어(이메일/비밀번호/시크릿/복구/채널) + 영어 헤더 모두 지원
  │     조건: 2개 이상 필드 매칭 + email 필드 필수
  │     bare "id"는 email로 매핑하지 않음 (오탐 방지)
  │
  ├─ 2) 헤더 없음 → 세로/라벨-값 레이아웃 (tryVerticalExtract)
  │     ├─ 라벨-값: "이메일: xxx@gmail.com" / 2열 키-값 시트
  │     │   구분자: `:`, `：` (전각), `=`
  │     └─ 스택형: 1~4열 시트에서 이메일→비밀번호→TOTP 순서 추정
  │
  ├─ 3) 헤더 없음 → 컬럼 통계 분석 (analyzeColumns)
  │     각 컬럼의 전체 셀을 샘플링:
  │     - @포함 10%+ → email (비율 높은 컬럼이 메인, 두번째는 recovery)
  │     - Base32 10%+ → TOTP
  │     - URL 20%+ → YouTube
  │     - 순번 컬럼(1,2,3,...) 건너뜀
  │     - 나머지 첫 번째 미할당 컬럼 → password
  │
  └─ 4) 최후 수단 → 브루트포스 (bruteForceExtract)
        모든 셀 무차별 스캔, 이메일 발견 시 같은 행의 나머지 셀을 자동 분류
        중복 이메일은 normalizeEmail()로 소문자 비교하여 건너뜀
```

### TOTP 시크릿 검증 (공식 기준)

```
RFC 4648 Base32: A-Z, 2-7 문자만 허용
RFC 6238 TOTP: 30초 스텝, SHA-1, 6자리 코드

정규화 (normalizeTotp):
  1. 대문자 변환: .toUpperCase()
  2. 공백/하이픈/패딩 제거: /[\s\-_=]/g → ''
  3. 비-Base32 문자 제거: /[^A-Z2-7]/g → ''

검증 (isTotpLike):
  - @ 포함 → 이메일이므로 거부
  - 숫자만 → 전화번호/순번이므로 거부
  - http:// → URL이므로 거부
  - 특수문자 포함 → 비밀번호이므로 거부
  - 정규화 후 16자 미만 → 너무 짧아 거부
  - 정규화 후 128자 초과 → 너무 길어 거부
  - Base32 비율 80% 미만 → 비밀번호 오인 방지

otpauth:// URL 지원:
  - otpauth://totp/...?secret=XXXX&issuer=...
  - otpauth:// 접두사 검증 후 decodeURIComponent() 적용
  - secret= 파라미터 추출: /[?&]secret=([A-Z2-7=]+)/i (패딩 포함)
  - ref: https://github.com/google/google-authenticator/wiki/Key-Uri-Format

공식 문서:
  - RFC 4648 (Base32): https://www.rfc-editor.org/rfc/rfc4648#section-6
  - RFC 6238 (TOTP): https://www.rfc-editor.org/rfc/rfc6238
  - otplib: https://github.com/yeojz/otplib
```

### 데이터 머지 규칙

```
기존 계정 발견 시 (normalizeEmail로 소문자 비교):
  password     → 항상 덮어쓰기 (새 값이 있으면)
  totp_secret  → 유효한 Base32만 덮어쓰기 (isTotpLike 통과한 값만)
  recovery_email → 항상 덮어쓰기
  youtube_url  → 항상 덮어쓰기
새 계정 → 그대로 추가

저장: atomic write (tmp+rename) → accounts_normalized.json
공식 문서: fs.renameSync — https://github.com/nodejs/node/blob/main/doc/api/fs.md#fsrenamesyncoldpath-newpath
```

---

## Puppeteer 로그인 엔진 (공식 문서 기반)

### 사용하는 API와 공식 출처

| API | 용도 | 공식 문서 |
|-----|------|-----------|
| `puppeteer.launch(opts)` | 브라우저 시작 | https://pptr.dev/api/puppeteer.puppeteernode.launch |
| `page.goto(url)` | 페이지 이동 | https://pptr.dev/api/puppeteer.page.goto |
| `page.waitForSelector(sel)` | DOM 요소 대기 | https://pptr.dev/api/puppeteer.page.waitforselector |
| `page.type(sel, text, {delay})` | 키보드 입력 (지연 포함) | https://pptr.dev/api/puppeteer.page.type |
| `page.click(sel)` | 요소 클릭 | https://pptr.dev/api/puppeteer.page.click |
| `page.evaluate(fn)` | 페이지 내 JS 실행 | https://pptr.dev/api/puppeteer.page.evaluate |
| `page.screenshot({path})` | 스크린샷 저장 | https://pptr.dev/api/puppeteer.page.screenshot |
| `page.url()` | 현재 URL | https://pptr.dev/api/puppeteer.page.url |
| `page.content()` | 페이지 HTML | https://pptr.dev/api/puppeteer.page.content |
| `browser.close()` | 브라우저 종료 | https://pptr.dev/api/puppeteer.browser.close |
| `StealthPlugin()` | 봇 감지 회피 | https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth |
| `authenticator.generate(secret)` | TOTP 6자리 코드 생성 | https://github.com/yeojz/otplib |

### 로그인 흐름

```
1. 브라우저 실행 (headed 모드 + stealth 플러그인)
   └─ userDataDir: ./profiles/<email>/ (세션 유지)
       sanitizeEmail()로 경로 안전하게 처리

2. myaccount.google.com 접속
   └─ 이미 로그인됨 → 즉시 반환

3. 이메일 입력 (5개 셀렉터 시도, 50-150ms 딜레이)

4. ★ 2FA 페이지 조기 감지
   └─ Google이 비밀번호 건너뛸 때 대응
   └─ TWO_FA 셀렉터 + 페이지 텍스트 확인
   └─ 감지 시 비밀번호 입력 건너뛰고 바로 TOTP 입력

5. 비밀번호 입력 (조기 2FA가 아닌 경우)

6. 2FA 처리 (TOTP)
   └─ authenticator.generate(secret) — otplib
   └─ 6자리 코드 생성 → 150ms 딜레이로 입력

7. 보안 챌린지 감지
   └─ PASSKEY_REQUIRED / PHONE_REQUIRED
   └─ RECAPTCHA (120초 수동 대기)
   └─ DEVICE_PROMPT

8. 결과 반환 → {success, result, browser, page}
```

### 결과 타입 (LoginResult)

| 값 | 의미 | 자동 재시도 |
|----|------|------------|
| `SUCCESS` | 로그인 성공 | - |
| `ALREADY_LOGGED` | 이미 로그인 상태 | - |
| `WRONG_PASSWORD` | 비밀번호 틀림 | 수동 처리 필요 |
| `WRONG_2FA` | 2FA 코드 틀림 | 수동 처리 필요 |
| `PHONE_REQUIRED` | 전화 인증 요구 | 수동 처리 필요 |
| `CAPTCHA_REQUIRED` | CAPTCHA 발생 | 120초 대기 |
| `UNUSUAL_ACTIVITY` | 비정상 활동 감지 | 수동 처리 필요 |
| `TIMEOUT` | 시간 초과 | 자동 재시도 가능 |
| `UNKNOWN_ERROR` | 알 수 없는 오류 | 자동 재시도 가능 |

---

## CI/CD 배포 (deploy-gauth.yml)

### 트리거

- `push` → `claude/gauth-frontend-backend-fixes-cg2icv` 브랜치
- 특정 파일 변경 시만
- `workflow_dispatch` (수동)

### 배포 순서

```
1. API 배포 시도 (POST /api/deploy)
   └─ python3 assert d.get('ok') 통과 후에만 deploy_ok=true
   └─ 실패 시 SSH 배포 폴백

2. SSH 배포 (6단계)
   ├─ [1] 시스템 패키지 (Xvfb, Chrome, 한글폰트)
   ├─ [2] 가상 디스플레이 (Xvfb :99)
   ├─ [2.5] NTP 시간 동기화 (TOTP 필수)
   ├─ [3] Node.js 확인
   ├─ [4] 코드 다운로드 (6개 파일)
   ├─ [5] npm install + 모듈 등록 + TOTP 패치
   └─ [6] 서비스 재시작 + 헬스체크

3. Cloudflare 보안 레벨 설정
4. Apache 프록시 + DNS 확인
```

---

## 보안 구현 (공식 문서 기반)

| 보안 항목 | 구현 | 공식 문서 |
|-----------|------|-----------|
| 타이밍 공격 방지 | `crypto.createHmac('sha256','gauth')` → `timingSafeEqual` (HMAC 고정 길이 비교, 길이 누출 방지) | https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b |
| 셸 인젝션 방지 | `execFileSync` (인자 배열, 셸 미사용) | https://github.com/nodejs/node/blob/main/doc/api/child_process.md#child_processexecfilesyncfile-args-options |
| XSS 방지 | `escapeHtml()` — `& < > " '` 이스케이프 | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html |
| 경로 탐색 방지 | `sanitizeEmail()` — POSIX 금지 문자 + Windows 금지 문자만 제거 (`/[\/\\<>:"|?*\x00-\x1f]/g`) | https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap03.html#tag_03_170 |
| Atomic write | `writeFileSync(tmp)` + `renameSync(tmp, target)` | https://github.com/nodejs/node/blob/main/doc/api/fs.md#fsrenamesyncoldpath-newpath |
| Race condition 방지 | `withFileLock()` — Promise 체인 뮤텍스로 파일 read-modify-write 직렬화 | 자체 구현 (파싱은 잠금 밖, 머지만 잠금 안) |
| 브랜치 인젝션 방지 | `git-check-ref-format` 금지 문자 제거 (`[\x00-\x1f\x7f ~^:?*\[\\]`) | https://git-scm.com/docs/git-check-ref-format |
| 동시 로그인 제한 | `MAX_CONCURRENT_LOGINS = 3` + `loginQueue` Map | Express 자체 구현 |
| 토큰 미설정 차단 | `GAUTH_API_TOKEN` 없으면 503 반환 | 자체 구현 |

---

## 데이터 형식

### accounts_normalized.json

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

## 참조 공식 문서 (전체)

### Node.js 공식 (GitHub 원본)
| 주제 | URL |
|------|-----|
| fs 모듈 | https://github.com/nodejs/node/blob/main/doc/api/fs.md |
| path 모듈 | https://github.com/nodejs/node/blob/main/doc/api/path.md |
| crypto.timingSafeEqual | https://github.com/nodejs/node/blob/main/doc/api/crypto.md#cryptotimingsafeequala-b |
| child_process.execFileSync | https://github.com/nodejs/node/blob/main/doc/api/child_process.md#child_processexecfilesyncfile-args-options |
| Buffer.from | https://github.com/nodejs/node/blob/main/doc/api/buffer.md#static-method-bufferfromstring-encoding |
| --max-old-space-size | https://github.com/nodejs/node/blob/main/doc/api/cli.md#--max-old-space-sizesize-in-mib |

### npm 패키지 (GitHub 원본)
| 패키지 | URL |
|--------|-----|
| express | https://github.com/expressjs/express |
| multer | https://github.com/expressjs/multer |
| SheetJS (xlsx) | https://github.com/SheetJS/sheetjs |
| otplib | https://github.com/yeojz/otplib |
| puppeteer | https://pptr.dev / https://github.com/puppeteer/puppeteer |
| puppeteer-extra | https://github.com/berstend/puppeteer-extra |
| puppeteer-extra-plugin-stealth | https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth |
| archiver | https://github.com/archiverjs/node-archiver |
| ws | https://github.com/websockets/ws |
| dotenv | https://github.com/motdotla/dotenv |

### RFC 표준
| 표준 | URL |
|------|-----|
| RFC 4648 (Base32) | https://www.rfc-editor.org/rfc/rfc4648#section-6 |
| RFC 6238 (TOTP) | https://www.rfc-editor.org/rfc/rfc6238 |
| RFC 4226 (HOTP/TOTP 키 길이) | https://datatracker.ietf.org/doc/html/rfc4226#section-4 |
| RFC 5321 (SMTP/이메일) | https://www.rfc-editor.org/rfc/rfc5321 |
| RFC 5322 (이메일 주소 형식) | https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1 |

### 보안 가이드
| 주제 | URL |
|------|-----|
| XSS 방지 | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html |
| 명령어 인젝션 방지 | https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html |
| 인증 (HMAC timing-safe) | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html |

### 파일 시스템/Git 표준
| 주제 | URL |
|------|-----|
| POSIX 파일명 (3.170) | https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap03.html#tag_03_170 |
| git-check-ref-format | https://git-scm.com/docs/git-check-ref-format |
| otpauth URI 형식 | https://github.com/google/google-authenticator/wiki/Key-Uri-Format |

### W3C/브라우저 표준
| 주제 | URL |
|------|-----|
| WebDriver navigator.webdriver | https://www.w3.org/TR/webdriver2/#dom-navigatorautomationinformation-webdriver |
| HTML5 email 유효성 검사 | https://html.spec.whatwg.org/#valid-e-mail-address |

## 프론트엔드 추측 코딩 수정 (13건)

| # | 수정 항목 | 이전 (추측) | 이후 (공식 문서 기반) | 공식 문서 |
|---|----------|------------|---------------------|-----------|
| 1 | XSS 방지 (`_esc()`) | innerHTML에 사용자 데이터 직접 삽입 | `& < > " '` 5문자 이스케이프 후 삽입 | https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML#security_considerations |
| 2 | 클립보드 복사 (`doCopy()`) | `document.execCommand('copy')` (deprecated) | `navigator.clipboard.writeText()` + Selection API 폴백 | https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText |
| 3 | Selection API 폴백 | 없음 | `window.getSelection()` + `Range` | https://developer.mozilla.org/en-US/docs/Web/API/Selection |
| 4 | VM 비밀번호 저장 | `localStorage` (영구 저장) | `sessionStorage` (탭 닫으면 소멸) | https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage |
| 5 | SSH URL | 임의 패턴 | GCP 공식 `console.cloud.google.com/compute/instancesDetail/zones/ZONE/instances/NAME` | https://cloud.google.com/compute/docs/ssh-in-browser |
| 6 | 프로필 폴더→이메일 변환 | `folder.replace(/_([^_]+)_([^_]+)$/, '@$1.$2')` (2-part 도메인만) | `folder.replace(/^([^_]+)_(.+)$/, (_, u, d) => u + '@' + d.replace(/_/g, '.'))` (multi-dot 도메인 대응) | MDN String.replace: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace |
| 7 | Optional chaining 제거 | `?.` `??` 사용 (ES2020) | `&&` 체인 + 삼항 연산자 (ES5 호환) | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining |
| 8 | `@gmail.com` 자동 추가 | 이메일에 `@` 없으면 `@gmail.com` 추가 | 제거 (데이터 오염 방지) | — |
| 9 | `login_method` 고스트 필드 | 서버에 없는 필드 표시 | 제거 | — |
| 10 | `recovery_phone` 고스트 필드 | 서버에 없는 필드를 테이블 컬럼으로 표시 | 제거 | — |
| 11 | `source_row` 고스트 필드 | 서버에 없는 필드 표시 | 제거 | — |
| 12 | `doUpload` 클로저 변수 | 외부 `valid.length` 참조 (비동기 시 stale) | `fileCount` 매개변수로 전달 | MDN Closures: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures |
| 13 | `source_mtime` 해석 | 문서화 없음 | epoch 밀리초 (정렬/비교용) | MDN Date: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date |

## 백엔드 추측 코딩 수정 (전체)

| # | 파일 | 수정 항목 | 이전 (추측) | 이후 (공식 문서 기반) | 공식 문서 |
|---|------|----------|------------|---------------------|-----------|
| 1 | auto_deploy.js | authMiddleware 타이밍 공격 | `Buffer.from()` 길이 비교 → 길이 누출 | HMAC SHA-256 고정 길이 다이제스트 비교 | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html |
| 2 | auto_deploy.js | 브랜치 sanitize | `/[^a-zA-Z0-9\/_\-\.]/g` (과도한 제한) | git-check-ref-format 금지 문자만 제거 | https://git-scm.com/docs/git-check-ref-format |
| 3 | auto_deploy.js | TOTP 길이 검증 | 16, 32, 52, 64 (52는 근거 없음) | 16, 20, 32, 64 (RFC 4226 Section 4) | https://datatracker.ietf.org/doc/html/rfc4226#section-4 |
| 4 | auto_deploy.js | login-one 이메일 비교 | 대소문자 구분 비교 | `.toLowerCase()` 적용 | — |
| 5 | auto_deploy.js | LOGIN_TIMEOUT 매직넘버 | 120000 (주석 없음) | 주석: Puppeteer 90초 + 버퍼 30초 | — |
| 6 | auto_deploy.js | MAX_CONCURRENT_LOGINS 매직넘버 | 3 (주석 없음) | 주석: Chrome ~300MB RAM, 서버 2GB 기준 | — |
| 7 | upload_excels.js | uploadAuthMiddleware 데드코드 | 사용하지 않는 인증 함수 존재 | 제거 (프론트엔드 인증 불필요) | — |
| 8 | upload_excels.js | otpauth URL 파싱 | `secret=([A-Z2-7]+)` (접두사 미검증, percent-encoding 미지원) | `otpauth://` 검증 + `decodeURIComponent` + `=` 패딩 허용 | https://github.com/google/google-authenticator/wiki/Key-Uri-Format |
| 9 | upload_excels.js | isTotpLike 길이 | 주석 없음 | RFC 4226 Section 4 참조 주석 추가 | https://datatracker.ietf.org/doc/html/rfc4226#section-4 |
| 10 | upload_excels.js | 열 감지 임계값 | 10%/20% (주석 없음) | 경험적 임계값임을 명시 (공식 규격 없음) | — |
| 11 | upload_excels.js | 파일 크기/개수 제한 | 200MB/50파일 (주석 없음) | multer 공식 문서 참조 주석 | https://github.com/expressjs/multer#limits |
| 12 | upload_excels.js | 타임아웃 | 600000ms (주석 없음) | 주석: 10분 — 대용량 엑셀 다수 파싱+머지 허용 | — |
| 13 | upload_excels.js | isEmail 정규식 | 주석 없음 | RFC 5322 Section 3.4.1 간소화임을 명시 | https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1 |
| 14 | upload_excels.js | Race condition | 파일 lock 없이 동시 read-modify-write | `withFileLock()` Promise 체인 뮤텍스 | — |
| 15 | login-v2.js | sanitizeEmail | `/[^a-zA-Z0-9@._-]/g` (임의 화이트리스트) | POSIX + Windows 금지 문자만 제거 | https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap03.html#tag_03_170 |
| 16 | login-v2.js | 셀렉터 출처 | "99.9% 신뢰도" 주장 | 역공학 기반임을 명시, 공식 API 없음 | https://developers.google.com/identity |
| 17 | login-v2.js | Chrome 경로 | 주석 없음 | Puppeteer.executablePath() 미사용 이유 명시 | https://pptr.dev/api/puppeteer.browser.executablepath |
| 18 | login-v2.js | launch flags | 주석 없음 | 각 플래그 공식/비공식 출처 명시 | https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox |
| 19 | login-v2.js | headless 파라미터 | 무시 (항상 false) | options.headless 존중 | — |
| 20 | login-v2.js | delay(5000, 5000) | min===max (랜덤 의미 없음) | delay(3000, 5000) 수정 | — |
| 21 | login-v2.js | navigator.webdriver 제거 | 주석 없음 | W3C WebDriver spec 참조 | https://www.w3.org/TR/webdriver2/#dom-navigatorautomationinformation-webdriver |
| 22 | login-v2.js | 타이핑 딜레이 | "인간처럼" (근거 없음) | 50~150ms/char — 평균 타이핑 속도 범위, 역공학 기반 명시 | — |
| 23 | login-v2.js | skip 버튼 텍스트 | 주석 없음 | Google UI 역공학, 공식 문서 없음 명시 | — |
| 24 | login-v2.js | 2FA 감지 텍스트 | 주석 없음 | Google UI 역공학, 공식 문서 없음 명시 | — |
| 25 | login-v2.js | 로그인 성공 URL 판정 | 주석 없음 | 역공학 기반, 공식 문서 없음 명시 | — |
| 26 | index.html | 프로필 폴더→이메일 | `_([^_]+)_([^_]+)$` (2-part 도메인만) | multi-dot 도메인(co.uk 등) 대응 | — |
| 27 | index.html | day 계산 매직넘버 | `24*3600*1000` (주석 없음) | 86400000 = POSIX day in ms 명시 | — |
| 28 | index.html | 업로드 타임아웃 600000 | 주석 없음 | 10분 — 서버 req.setTimeout과 일치 명시 | — |
| 29 | index.html | XHR timeout 300000 | 주석 없음 | 5분 — 서버측 10분보다 짧게 설정 명시 | — |
| 30 | index.html | lookup XSS | innerHTML에 서버 데이터 직접 삽입 | `escapeHtml()` 전처리 | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html |
| 31 | index.html | YouTube URL XSS | `javascript:` 스킴 허용 | `/^https?:\/\//i` 검증 | — |
| 32 | index.html | load() 인증 | authHeaders 미적용 | `authQuery()` + `authHeaders()` 적용 | — |
| 33 | index.html | 중복 escapeHtml | `_esc` + `escapeHtml` × 2 (3개 중복) | `_esc` 1개 + `var escapeHtml=_esc` alias | — |
| 34 | index.html | /codes/ fetch 인증 | 7개 fetch에 `authHeaders()` 미적용 | 전체 `authHeaders()` 추가 | — |
| 35 | login-v2.js | reCAPTCHA 주석 코드 | 유료 API 키 플레이스홀더 포함 10줄 주석 | 삭제 | — |
| 36 | login-v2.js | TOTP 콘솔 출력 | 실제 코드값 평문 출력 | 자릿수만 출력 (마스킹) | — |
| 37 | login-v2.js | 테스트 계정 제한 | `slice(0, 3)` 하드코딩 | 전체 계정 사용 | — |
| 38 | auto_deploy.js | 기본 브랜치 | feature 브랜치 하드코딩 | `'main'` | — |
| 39 | deploy-gauth.yml | 일회성 정리 블록 | TOTP clearing/dedup/diagnostics 매 배포 실행 | 삭제 (일회성 작업 반복 불필요) | — |
| 40 | deploy-gauth.yml | 테스트 이메일 | 하드코딩된 이메일로 검색 검증 | 삭제 (credential 누출 위험) | — |
| 41 | deploy-gauth.yml | 로그 출력량 | journalctl 150줄 + 모듈 체크 | 서비스 상태 10줄로 축소 | — |
| 42 | package.json | multer 버전 | ^1.4.5-lts.1 유지 | v2.x API 비호환 → 롤백 | https://github.com/expressjs/multer |
| 43 | index.html | CSS 이중 세미콜론 | `;;` | `;` | — |

---

## 제약사항

- Google 보안 챌린지 (패스키/기기인증/전화인증) 자동화 불가
- CAPTCHA 발생 시 120초 수동 대기 필요
- headed 모드 전용 (headless 감지됨)
- Xvfb 가상 디스플레이 필수 (서버에 모니터 없음)
