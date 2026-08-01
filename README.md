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

## API 엔드포인트

### 엑셀 업로드 (`upload_excels.js`)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/upload-excels` | 엑셀 파일 업로드 + 파싱 + 머지 |

- multer: 최대 50파일, 파일당 200MB
- 업로드 임시 경로: `/opt/gauth-full/uploads/`
- 파싱 후 임시 파일 자동 삭제

### 관리 API (`auto_deploy.js`)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/deploy` | GitHub에서 코드 풀 + 서비스 재시작 |
| POST | `/api/update-secret` | 개별 계정 TOTP 시크릿 수정 |
| GET | `/api/search-account?q=` | 계정 검색 (최소 3글자) |
| GET | `/api/deploy-status` | 서버 상태 (Chrome/Xvfb/Node) |
| POST | `/api/login-one` | 개별 계정 Puppeteer 로그인 |

### 메인 서버 (`rebrowser-login.js`)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/accounts` | 전체 계정 목록 |
| GET | `/api/normalized-accounts` | 정규화된 계정 목록 |
| GET | `/api/lookup/:email` | 개별 계정 조회 |
| GET | `/codes/:secret` | TOTP 코드 실시간 생성 |
| POST | `/api/start` | 배치 로그인 (동시성 8) |
| POST | `/api/export-split` | N분할 엑셀 내보내기 (ZIP) |

---

## 엑셀 파싱 로직

```
엑셀 파일 입력
  │
  ├─ 1) 헤더 행 감지 (email/password/totp 패턴 매칭)
  │     한국어/영어 헤더 모두 지원
  │
  ├─ 2) 헤더 없음 → 세로/라벨-값 레이아웃 감지
  │     "이메일: xxx@gmail.com" 형식 / 2열 키-값 시트
  │
  ├─ 3) 헤더 없음 → 컬럼 통계 분석
  │     @포함 20%+ = 이메일 / Base32 20%+ = TOTP
  │     URL 30%+ = YouTube / 나머지 = 비밀번호
  │
  └─ 4) 최후 수단 → 모든 셀 무차별 스캔
        이메일 발견 시 같은 행 나머지 셀 자동 분류
```

### TOTP 시크릿 검증

- Base32 문자만: `A-Z`, `2-7`
- 유효 길이: 16자 (80bit), 32자 (160bit), 52자, 64자
- 원본 대비 Base32 비율 80% 미만 → 비밀번호로 판정

### 데이터 머지 규칙

```
기존 계정 발견 시:
  password     → 항상 덮어쓰기 (새 값이 있으면)
  totp_secret  → 유효한 Base32만 덮어쓰기
  recovery_email → 항상 덮어쓰기
  youtube_url  → 항상 덮어쓰기
새 계정 → 그대로 추가
```

---

## Puppeteer 로그인 엔진

### 로그인 흐름

```
1. 브라우저 실행 (headed 모드 + stealth 플러그인)
   └─ userDataDir: ./profiles/<email>/ (세션 유지)

2. myaccount.google.com 접속
   └─ 이미 로그인됨 → 즉시 반환

3. 이메일 입력 (5개 셀렉터 시도, 50-150ms 딜레이)

4. ★ 2FA 페이지 조기 감지
   └─ Google이 비밀번호 건너뛸 때 대응
   └─ TWO_FA 셀렉터 + 페이지 텍스트 확인
   └─ 감지 시 비밀번호 입력 건너뛰고 바로 TOTP 입력

5. 비밀번호 입력 (조기 2FA가 아닌 경우)

6. 2FA 처리 (TOTP)
   └─ otplib authenticator.generate(secret)
   └─ 6자리 코드 생성 → 150ms 딜레이로 입력

7. 보안 챌린지 감지
   └─ PASSKEY_REQUIRED / PHONE_REQUIRED
   └─ RECAPTCHA (120초 수동 대기)
   └─ DEVICE_PROMPT

8. 결과 반환 → {success, result, browser, page}
```

### TOTP 코드 생성

```javascript
// Base32 정규화 → otplib 생성 (RFC 6238, 30초 스텝)
secret = secret.toUpperCase()
  .replace(/[\s\-_=]/g, '')    // 공백/하이픈/패딩 제거
  .replace(/[^A-Z2-7]/g, ''); // Base32 외 문자 제거
authenticator.generate(secret);
```

---

## 프론트엔드 기능

| 기능 | 설명 |
|------|------|
| 엑셀 업로드 | 드래그앤드롭 / 파일선택, 4단계 진행률 UI |
| 계정 검색 | 이메일 검색, 상세 조회 |
| 프로그램 로그인 | 개별 계정 Puppeteer 로그인 (🔑 버튼) |
| TOTP 코드 | 실시간 코드 표시 + 복사 |
| 배치 로그인 | 다중 계정 동시 로그인 |
| 내보내기 | N분할 엑셀 ZIP 다운로드 |

---

## CI/CD 배포

### 트리거

- `push` → `claude/gauth-frontend-backend-fixes-cg2icv` 브랜치
- 특정 파일 변경 시만
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
   ├─ [4] 코드 다운로드 (6개 파일)
   ├─ [5] npm install + 모듈 등록 + TOTP 패치
   └─ [6] 서비스 재시작 + 헬스체크

3. Cloudflare 보안 레벨 설정
4. Apache 프록시 + DNS 확인
```

---

## 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| express | 4.21 | HTTP 서버 |
| multer | 1.4 | 파일 업로드 |
| xlsx | 0.18 | 엑셀 파싱 |
| otplib | 12.x | TOTP 코드 생성 |
| rebrowser-puppeteer | 24.x | 브라우저 자동화 |
| puppeteer-extra-plugin-stealth | 2.11 | 봇 감지 회피 |
| archiver | 7.x | ZIP 생성 |

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

## 참조 공식 문서

| 문제 | 공식 문서 |
|------|-----------|
| crypto.timingSafeEqual RangeError (버퍼 길이 불일치) | https://github.com/nodejs/node/blob/main/doc/api/crypto.md#cryptotimingsafeequala-b |
| multer 파일 업로드 | https://github.com/expressjs/multer#readme |
| XLSX (SheetJS) 파싱 | https://github.com/SheetJS/sheetjs#readme |
| otplib TOTP 생성 | https://github.com/yeojz/otplib#readme |
| Express req/res timeout | https://github.com/expressjs/express/blob/master/lib/request.js |
| Node.js --max-old-space-size | https://github.com/nodejs/node/blob/main/doc/api/cli.md#--max-old-space-sizesize-in-mib |
| fs.writeFileSync 권한 | https://github.com/nodejs/node/blob/main/doc/api/fs.md#fswritefilesyncfile-data-options |

## 제약사항

- Google 보안 챌린지 (패스키/기기인증/전화인증) 자동화 불가
- CAPTCHA 발생 시 120초 수동 대기 필요
- headed 모드 전용 (headless 감지됨)
- Xvfb 가상 디스플레이 필수 (서버에 모니터 없음)
