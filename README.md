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

## 데이터 3계층 구조

이 시스템은 **세 종류의 데이터 저장소**를 완전 분리한다.

| | 보관용 엑셀 (마스터 DB) | 하위사이트용 엑셀 (배분 풀) | 실 로그인 결과 |
|---|---|---|---|
| **용도** | 원본 데이터 영구 보관 | 15개 하위사이트에 배분할 계정 | 실제 로그인 성공/실패 기록 |
| **서버 저장소** | `accounts_normalized.json` | `accounts_subsites.json` | `login_results.json` |
| **업로드 API** | `POST /api/upload-excels` | `POST /api/upload-subsites` | 자동 (login-one 결과) |
| **읽기 API** | `GET /api/subsite-accounts` | `GET /api/subsites-pool` | `GET /api/login-results` |
| **다운로드** | 원본 엑셀 그대로 | `GET /api/subsites-pool` | `GET /api/export/login-results` |
| **프론트 탭** | 📦 보관용 엑셀 | 🔀 하위사이트용 엑셀 | accounts.html 로그인 상태 |
| **나누기 기능** | 없음 | `POST /api/split-to-subsites` (15사이트 균등 배분) | 없음 |

### 15개 하위사이트

gain · woodong · sunbi · simmani · win · aura · bacad · camstouch · james · misskim · naman · romi · second · soktv · cham

### 아키텍처 다이어그램

```
   ┌─────────────────────────────────────────────────────────┐
   │  index.html 업로드 UI (탭 2분할)                         │
   │                                                         │
   │  📦 보관용 탭              🔀 하위사이트용 탭              │
   │  ┌──────────────┐         ┌──────────────────┐          │
   │  │ 엑셀 읽기    │         │ 엑셀 읽기        │          │
   │  │ 폴더 읽기    │         │ 폴더 읽기        │          │
   │  │ ▶ 업로드     │         │ ▶ 업로드         │          │
   │  └──────┬───────┘         │ 🔀 엑셀 나누기   │          │
   │         │                 └──────┬───────────┘          │
   └─────────┼────────────────────────┼──────────────────────┘
             │                        │
             ▼                        ▼
   POST /api/upload-excels    POST /api/upload-subsites
             │                        │
             ▼                        ▼
   accounts_normalized.json   accounts_subsites.json
   (보관용 마스터 DB)          (하위사이트 배분 풀)
                                      │
                            POST /api/split-to-subsites
                                      │
                                      ▼
                              15사이트 균등 배분
                              (site 필드 자동 할당)

   accounts.html ──► POST /api/login-one ──► login_results.json
                                              (실 로그인 결과, 별도 파일)
```

### 프론트엔드 구분 표시 (accounts.html)
- **리스트 행**: 번호 · 로그인상태점(●) · 이메일 · 사이트이모지 · 배지
  - `●` 회색 = 미시도 (엑셀만 있음)
  - `●` 초록 = 실 로그인 성공
  - `●` 빨강 = 로그인 실패
- **상단 요약바**: `성공 N · 실패 N · 미시도 N · 전체 N`
- **필터**: "로그인 성공" / "로그인 실패" 필터 선택 가능
- **상세 패널**: 클릭 시 오른쪽 슬라이드로 계정 정보 + 로그인 버튼 + 채널 정보

---

## 계정 정보

### GCP 프로젝트
- **프로젝트 ID**: `quantum-bonus-455522-b4`
- **프로젝트 번호**: GitHub Secrets 및 서버 `.env` 참조 (client_id 접두사와 동일)
- **서비스 계정**: `{프로젝트번호}-compute@developer.gserviceaccount.com`

### OAuth 클라이언트 (현재 사용 중)
- **이름**: `구찌야놀자-스트리밍-웹클라이언트`
- **Client ID**: `.github/oauth-client-id.txt` 참조 (GitHub Secrets: `GOOGLE_OAUTH_CLIENT_ID`)
- **식별자**: `...do3ebgq60...` (OLD 클라이언트)
- **승인된 JavaScript 원본**: `https://gauth.cent-solution.online` (URI 11), 기타 .info 도메인 다수
- **용도**: gauth 우상단 Google Identity Services 로그인 버튼
- **저장 위치**: 서버 `.env` (`GOOGLE_OAUTH_CLIENT_ID`), systemd drop-in, GitHub Secrets

### OAuth 클라이언트 (이전 생성, 미사용)
- **식별자**: `...30t6q00h...` (NEW 클라이언트)
- **Client Secret**: 서버 `.env` 파일에 `GOCSPX` 키로 저장됨
- **비고**: gauth origin 미등록 → `401 invalid_client / no registered origin` 오류 → OLD 클라이언트로 전환

### YouTube Data API 키
- **저장 위치**: 서버 `/opt/gauth-full/.env` (`YT_API_KEY`)
- **용도**: 채널 상태 조회 (구독·영상·조회·생방송)
- **할당량**: 기본 10,000 units/day

### 필수 GitHub Secrets
| Secret 이름 | 용도 |
|---|---|
| `GAUTH_HOST` | gauth 서버 호스트 (SSH 배포) |
| `GAUTH_USER` | SSH 사용자 |
| `GAUTH_SSH_KEY` | SSH 개인키 |
| `CLOUDFLARE_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Zone ID |
| `GOOGLE_OAUTH_CLIENT_ID` | 구글 로그인 위젯용 (없으면 "미설정" 표시) |

---

## https://gauth.cent-solution.online/ (쉴이)

### 서버 경로
| 경로 | 설명 |
|---|---|
| `/var/www/sites/gauth/public/index.html` | 메인 프론트엔드 |
| `/var/www/sites/gauth/public/subsites.html` | 하위 계정 조회 페이지 |
| `/var/www/sites/gauth/public/accounts.html` | 전체 계정 리스트 + 개별 로그인 |
| `/opt/gauth-full/login_results.json` | 실 로그인 결과 영구 저장 (엑셀 DB와 별도) |
| `/opt/gauth-full/rebrowser-login.js` | Express 서버 (port 4000) |
| `/opt/gauth-full/upload_excels.js` | 엑셀 파서 (latin1→UTF-8 보정 포함) |
| `/opt/gauth-full/accounts_normalized.json` | 보관용 마스터 데이터 |
| `/opt/gauth-full/accounts_subsites.json` | 하위사이트 배분용 (보관용과 별도) |
| `/opt/gauth-full/google_users.json` | GIS 로그인 사용자 저장소 |
| `/opt/gauth-full/.env` | 환경변수 (GOOGLE_OAUTH_CLIENT_ID, YT_API_KEY, GOCSPX) |
| systemd: `gauth` | 서비스 단위 |
| 서버 | 싱가포르 (gucci-yanolza), IP 마스킹 |

### 프론트엔드 3페이지 (공통 네비게이션: 🏠 메인 · 📦 사이트별 · 📋 계정 상세)

#### 1. `/` — 메인 (index.html)

| 영역 | 기능 |
|---|---|
| **히어로 배너** | 참교육 스트리밍 타이틀 + 파티클 애니메이션 |
| **스트리밍 정보** | 제목 6종 순환 + 설명 복사 버튼 |
| **통계 바** | 엑셀 파일 수 · 원본 개수 · 로그인 가능 · 제외 · 2FA · 월별 날짜 그룹 |
| **엑셀 업로드 (탭 2분할)** | 📦 보관용 탭: 엑셀 읽기/폴더 읽기 → `POST /api/upload-excels` → `accounts_normalized.json` |
| | 🔀 하위사이트용 탭: 엑셀 읽기/폴더 읽기 → `POST /api/upload-subsites` → `accounts_subsites.json` |
| | 🔀 엑셀 나누기 버튼 → `POST /api/split-to-subsites` (15사이트 균등 배분) |
| **하위사이트 계정 요약** | 사이트별 개수 카드 + 이메일 필터 검색 |
| **계정 조회** | 이메일 입력 → `GET /api/lookup` → 비밀번호·TOTP·복구메일·출처 표시 |
| **계정 리스트** | 50개/페이지 가상 스크롤 · 필터 검색 · 각 행에 🔑 개별 로그인 버튼 (`POST /api/login-one`) |
| **상세 카드** | 클릭 시 펼침: 이메일·비번·TOTP 코드(실시간)·복구메일·출처·수정 버튼 |
| **YouTube 도구** | OAuth2 토큰 → 채팅 메시지 전송 · 모데레이터 추가 · 스패너(최근 채팅 10명) |
| **일괄 작업** | 전체 순회 시작/정지 · 내보내기 분할 |
| **구글 로그인** | 우상단 GIS 버튼 → 로그인 후 아바타+이름 표시 |

#### 2. `/subsites.html` — 사이트별 계정

| 영역 | 기능 |
|---|---|
| **사이트별 접이식 카드** | 15개 사이트 × 계정 수 표시 · 클릭 → 이메일 10개/페이지 페이지네이션 |
| **채널 상태 버튼** | 각 계정에 📊 버튼 → `GET /api/youtube/channel-status` 실시간 조회 |
| **채널 정보** | 구독자 · 영상수 · 조회수 · 공개상태 · 생방송횟수 · 마지막 방송일 · 진행시간 |

#### 3. `/accounts.html` — 계정 상세

| 영역 | 기능 |
|---|---|
| **상단 요약바** | 성공 N · 실패 N · 미시도 N · 전체 N |
| **필터** | 사이트 드롭다운 · 로그인 상태 필터 (성공/실패/미시도) · 텍스트 검색 |
| **컴팩트 리스트** | 1만개 대응 · 번호 · 로그인상태점(●) · 이메일 · 사이트 배지 |
| **구글 로그인** | 상단 GIS 버튼 → 로그인 후 `gauth_uid` 쿠키 → `POST /api/login-one` 인증 자동 통과 |
| **개별 로그인** | 각 행에 🔑 버튼 → `POST /api/login-one` (쿠키 인증) → 결과를 localStorage + 서버 병합 |
| **서버 병합** | `GET /api/login-results` → localStorage와 timestamp 비교 병합 |
| **다운로드** | ⬇ CSV · ⬇ JSON (`GET /api/export/login-results?format=csv\|json`) |

### API 엔드포인트 (Express, port 4000)

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| `POST` | `/api/auth/google` | GIS credential(id_token) 검증 → 10년 httpOnly 쿠키 설정 | - |
| `GET` | `/api/auth/me` | 로그인된 사용자 정보 (쿠키 `gauth_uid` 확인) | 쿠키 |
| `GET` | `/api/auth/config` | client_id 반환 (프론트 GIS 위젯이 사용) | - |
| `GET` | `/api/subsite-accounts` | 하위 사이트별 계정 상세 (sites 배열) | - |
| `GET` | `/api/subsite-counts` | 사이트별 개수만 | - |
| `GET` | `/api/account-status` | 실시간 상태 (server_time, 로그인 현황) | - |
| `GET` | `/api/youtube/channel-status?url=` | 유튜브 채널 통계 (구독·영상·조회·생방송) | - |
| `GET` | `/api/accounts` | 전체 계정 목록 | - |
| `POST` | `/api/login-one` | 단일 계정 Puppeteer 로그인 시도 | Bearer 토큰 또는 `gauth_uid` 쿠키 |
| `GET` | `/api/lookup` | 이메일 조회 | - |
| `GET` | `/api/search-account?q=` | 계정 검색 | - |
| `GET` | `/api/login-results` | 실 로그인 결과 전체 조회 (login_results.json) | - |
| `GET` | `/api/export/login-results?format=xlsx` | 로그인 성공 계정 엑셀/JSON 다운로드 | - |
| `POST` | `/api/upload-subsites` | 하위사이트용 엑셀 업로드 → `accounts_subsites.json` | - |
| `GET` | `/api/subsites-pool` | 하위사이트 배분 풀 조회 | - |
| `POST` | `/api/split-to-subsites` | 15사이트 균등 배분 (site 필드 자동 할당) | - |
| `GET` | `/codes/:secret` | TOTP 6자리 코드 생성 | - |

### 구글 로그인 동작 흐름 (GIS raw id_token)

```
[브라우저]                        [gauth 서버]                     [Google]
    │                                 │                              │
    ├─ GET /api/auth/me ──────────────►│                              │
    │◄─ {user:null} ────────────────│                              │
    │                                 │                              │
    ├─ GET /api/auth/config ──────────►│                              │
    │◄─ {client_id:"<see .env>"}      │                              │
    │                                 │                              │
    ├─ google.accounts.id.initialize  ─┼──────────────────────────────►│
    │  (client_id, callback)          │                              │
    │                                 │                              │
    │◄─ credential(JWT id_token) ─────┼──────────────────────────────│
    │                                 │                              │
    ├─ POST /api/auth/google ─────────►│                              │
    │   {credential: "eyJ..."}        │                              │
    │                                 ├─ GET tokeninfo?id_token= ────►│
    │                                 │◄─ {sub,email,aud,iss,exp} ───│
    │                                 │                              │
    │                                 │  검증: aud===CID, iss===accounts.google.com, exp>now
    │                                 │  저장: google_users.json
    │                                 │  Set-Cookie: gauth_uid=sub; Max-Age=315360000; HttpOnly; Secure; SameSite=Lax
    │                                 │                              │
    │◄─ {ok:true, user:{sub,email,name,picture}} ──│                 │
    │                                 │                              │
    │  show(avatar+name), hide(button)│                              │
```

### id_token 검증 로직 (서버측)

```javascript
// /api/auth/google 핵심 로직 (rebrowser-login.js 내)
// 공식 문서: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential);
// tokeninfo 응답: { sub, email, name, picture, aud, iss, exp, email_verified, ... }
// 검증 4단계:
// 1. info.error 없음
// 2. info.aud === process.env.GOOGLE_OAUTH_CLIENT_ID
// 3. info.iss === 'https://accounts.google.com' 또는 'accounts.google.com'
// 4. parseInt(info.exp,10)*1000 >= Date.now()
```

---

## https://jump.cent-solution.online/ (보물섬 채널 현황)

### 경로
- 소스: `jump/` 저장소 디렉토리 (`index.html`, `accounts.html`, `manifest.json`, `sw.js`)
- 서버: `/var/www/sites/jump/public/`

### 프론트엔드 2페이지 (공통 네비게이션: 🏠 보물섬 · 📋 계정 상세)

#### 1. `/` — 보물섬 메인 (index.html)
| 영역 | 기능 |
|---|---|
| **헤더** | 보물섬 채널 현황 타이틀 + PWA 설치 버튼 |
| **엑셀 업로드** | 단일 파일 업로드 (gauth `/api/upload-excels` 프록시) |
| **사이트별 카드** | 15개 사이트 × 이모지+영문+한글+계정수 · 클릭 → 이메일 10개/페이지 |

#### 2. `/accounts.html` — 계정 상세 (gauth와 동일)
| 영역 | 기능 |
|---|---|
| **상단 요약바** | 성공 N · 실패 N · 미시도 N · 전체 N |
| **필터** | 사이트 드롭다운 · 로그인 상태 필터 · 텍스트 검색 |
| **컴팩트 리스트** | 1만개 대응 · 번호 · 로그인상태점(●) · 이메일 · 사이트 배지 |
| **구글 로그인** | GIS 버튼 (jump 도메인이 OAuth JS origin에 등록되어야 작동) |
| **개별 로그인** | 🔑 버튼 → `POST /api/login-one` (쿠키 인증) |
| **채널 상태** | 📊 버튼 → `GET /api/youtube/channel-status` |
| **다운로드** | ⬇ CSV · ⬇ JSON |

> gauth `accounts.html`과 동일 소스. API는 Apache vhost에서 gauth(port 4000)로 프록시.

### 프록시 API (Apache vhost → gauth port 4000)
| 프록시 경로 | 용도 |
|---|---|
| `/api/subsite-counts` | 사이트별 개수 |
| `/api/subsite-accounts` | 사이트별 계정 상세 |
| `/api/login-results` | 로그인 결과 조회 |
| `/api/export/login-results` | 로그인 결과 CSV/JSON 다운로드 |
| `/api/login-one` | 개별 로그인 실행 |
| `/api/youtube/channel-status` | 채널 상태 조회 |
| `/api/auth/*` | 구글 로그인 (me, config, google) |
| `/api/lookup` | 이메일 조회 |
| `/api/search-account` | 계정 검색 |
| `/api/normalized-accounts` | 전체 계정 목록 |

### 캐시 정책
- Apache vhost에서 `.html/.json/.js`에 `no-store` + `Clear-Site-Data: "cache", "storage"` 강제
- 브라우저의 이전 서비스 워커와 캐시 자동 폐기
- jump 프론트 자체에서 `navigator.serviceWorker.getRegistrations()` → 전부 unregister + `caches.keys()` → 전부 delete

### 한글 라벨 매핑 (15 사이트)
| 영문 | 이모지 | 한글 |
|---|---|---|
| gain | 🟣 | 게인 |
| woodong | 🚕 | 우동 |
| sunbi | 📘 | 선비 |
| simmani | 🎬 | 심마니 |
| win | 🏆 | 윈 |
| aura | ✨ | 아우라 |
| bacad | 🎓 | 바캇 |
| camstouch | 📷 | 캠스터치 |
| james | 👤 | 제임스 |
| misskim | 👩 | 미스김 |
| naman | 🧑 | 나만 |
| romi | 🐾 | 로미 |
| second | 2️⃣ | 세컨드 |
| soktv | 📺 | 속TV |
| cham | 🐘 | 참 |

---

## 데이터 무결성 현황 (2026-08-20 기준, 총 4,875건)

| 버킷 | 건수 |
|---|---|
| 이메일 무효 | 4 |
| 비밀번호 누락 | 44 |
| **비밀번호에 한글 별명** — 스왈 필요 | **1,941** |
| 비밀번호 형식 = URL | 0 |
| 비밀번호 형식 = 앱 패스워드 (정상) | 400 |
| YouTube URL 누락 | 383 |
| YouTube URL 자리에 앱 패스워드 (미스왈) | 0 (완료) |
| YouTube URL이 유튜브가 아님 | 383 |
| 2FA 누락 | 460 |
| 2FA 형식 무효 | 0 |
| 파일명 mojibake 잔존 | 0 (4,026건 복구 완료) |
| 이메일 중복 | 0 |

### 수정 이력
- 파일명 UTF-8/latin1 mojibake 복구: **4,026건** — `s.encode('latin1').decode('utf-8')` 적용
- 앱 패스워드가 youtube_url 자리에 있던 경우 스왈: **268건** — 정규식 `([a-z0-9]{4}\s+){3,}[a-z0-9]{4}`
- 대체 후보(`extra`/`password_alts`)에서 앱 패스워드 추출 → password: **75건**

---

## 계정 상태·인증 기능 계획표

### 기능 계획표 (단계 · 엔드포인트 · 프론트 · 상태)
| 단계 | 기능 | 데이터 소스 | 엔드포인트 (gauth Node) | 프론트 | 상태 |
|---|---|---|---|---|---|
| 1 | 채널 현황 (구독·영상·조회·생방송횟수·날짜·진행시간·공개상태) | YouTube Data API v3 (API 키) | `GET /api/youtube/channel-status?url=` | `/subsites.html` 계정별 `📊 채널상태` 버튼 | ✅ 완료 |
| 2 | 보안 점검 (2단계인증 유무·전화번호·복구정보·로그인성공) | Puppeteer(accounts.google.com) | `GET /api/account/security?email=` | `🔐 보안` 버튼 + 배지 | ⛔ API 없음 |
| 3 | 전화 2SV 강제 온보딩 (최초 로그인 자동 이동·SMS 발송·코드 입력) | Puppeteer | `POST /api/account/enforce-2sv` | `/onboarding.html` 자동 이동 | ⛔ API 없음 |
| 4 | 커뮤니티/저작권 양호여부 (불리언) | OAuth `channels.list part=auditDetails` | `GET /api/account/standing?email=` | 배지 🟢/🔴 | ⏳ 대기 (OAuth 필요) |

---

## 공식 문서 원본 주소 (모든 백엔드 코드의 출처 · 추측 코딩 금지)

백엔드 API 호출은 전부 아래 공식 레퍼런스의 엔드포인트·필드를 그대로 사용한다. 추측·비공식 엔드포인트 사용 금지.

### YouTube Data API v3
| 코드/기능 | 실제 호출 | 공식 문서 |
|---|---|---|
| 채널 통계 (구독·영상·조회·공개상태) | `GET googleapis.com/youtube/v3/channels?part=statistics,status,snippet&id={channelId}&key={KEY}` | https://developers.google.com/youtube/v3/docs/channels/list |
| 핸들→채널ID 변환 | `GET youtube/v3/channels?part=id&forHandle=@handle` | https://developers.google.com/youtube/v3/docs/channels/list |
| 사용자명→채널ID 변환 | `GET youtube/v3/channels?part=id&forUsername=name` | https://developers.google.com/youtube/v3/docs/channels/list |
| 생방송 목록·횟수·날짜 | `GET youtube/v3/search?channelId={id}&eventType=completed&type=video&order=date&maxResults=5&key={KEY}` | https://developers.google.com/youtube/v3/docs/search/list |
| 영상 진행시간(ISO 8601 duration) | `GET youtube/v3/videos?part=contentDetails,liveStreamingDetails&id={videoIds}&key={KEY}` | https://developers.google.com/youtube/v3/docs/videos/list |
| liveStreamingDetails (동시시청자·시작/종료) | `videos.list part=liveStreamingDetails` → `actualStartTime`, `actualEndTime`, `concurrentViewers` | https://developers.google.com/youtube/v3/docs/videos#liveStreamingDetails |
| 커뮤니티/저작권 양호여부 | `channels.list part=auditDetails` (OAuth 필수) → `communityGuidelinesGoodStanding`, `copyrightStrikesGoodStanding`, `contentIdClaimsGoodStanding` | https://developers.google.com/youtube/v3/docs/channels#auditDetails |

### Google Identity Services (로그인)
| 코드/기능 | 실제 호출 | 공식 문서 |
|---|---|---|
| GIS 라이브러리 로드 | `<script src="https://accounts.google.com/gsi/client" async defer></script>` | https://developers.google.com/identity/gsi/web/guides/display-button |
| 버튼 초기화 | `google.accounts.id.initialize({client_id, callback, auto_select, itp_support, use_fedcm_for_prompt})` | https://developers.google.com/identity/gsi/web/reference/js-reference#google.accounts.id.initialize |
| 버튼 렌더 | `google.accounts.id.renderButton(el, {theme, size, shape, text, locale})` | https://developers.google.com/identity/gsi/web/reference/js-reference#google.accounts.id.renderButton |
| id_token 서버측 검증 | `GET oauth2.googleapis.com/tokeninfo?id_token={JWT}` → `{sub, email, name, picture, aud, iss, exp}` | https://developers.google.com/identity/gsi/web/guides/verify-google-id-token |
| FedCM 지원 | `use_fedcm_for_prompt: true` (Chrome 117+) | https://developers.google.com/identity/gsi/web/guides/fedcm-migration |

### Google Cloud Identity Platform
| 코드/기능 | 실제 호출 | 공식 문서 |
|---|---|---|
| API 활성화 | `gcloud services enable identitytoolkit.googleapis.com` | https://cloud.google.com/identity-platform/docs/install |
| 인증 초기화 | `POST identitytoolkit.googleapis.com/v2/projects/{p}/identityPlatform:initializeAuth` | https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/initializeAuth |
| authorizedDomains 추가 | `PATCH identitytoolkit.googleapis.com/admin/v2/projects/{p}/config?updateMask=authorizedDomains` | https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig |
| Google IdP 설정 | `defaultSupportedIdpConfigs (google.com)` | https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs |

### 기타 라이브러리
| 코드/기능 | 버전 | 공식 문서 |
|---|---|---|
| TOTP 생성 | `otplib@12.0.1` `authenticator.generate(secret)` | https://github.com/yeojz/otplib |
| Puppeteer (자동화 엔진) | `rebrowser-puppeteer@24.8.1` / `puppeteer@25.0.0` | https://pptr.dev/api/puppeteer.launchoptions |
| Express | `express@4.21.2` | https://expressjs.com/en/4x/api.html |
| 엑셀 파서 | `xlsx@0.18.5` | https://docs.sheetjs.com/ |

### 정규식·검증 로직 (upload_excels.js / index.html)
| 검증 대상 | 근거 스펙 | 공식 문서 |
|---|---|---|
| 이메일 (`isEmail`) | RFC 5322 §3.4.1 + WHATWG HTML5 email | https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1 / https://html.spec.whatwg.org/#valid-e-mail-address |
| Gmail 정규화 (점·플러스·googlemail) | Google 지원 문서 | https://support.google.com/mail/answer/7436150 / https://support.google.com/mail/answer/22370 / https://support.google.com/mail/answer/10313 |
| 전화번호 (`isPhoneNumber`) | ITU-T E.164 (7-15자리) | https://www.itu.int/rec/T-REC-E.164-201011-I/en |
| Base32 TOTP (`normalizeTotp`, `isTotpLike`) | RFC 4648 §6 (A-Z, 2-7) | https://datatracker.ietf.org/doc/html/rfc4648#section-6 |
| TOTP 최소 길이 | RFC 4226 §4 (128-bit = 20 Base32 char, Google은 80-bit/16 char 허용) | https://datatracker.ietf.org/doc/html/rfc4226#section-4 |
| 6-8자리 코드 (`isSixDigitCode`) | RFC 6238 §4 (TOTP 6자리) + Google 백업코드 8자리 | https://datatracker.ietf.org/doc/html/rfc6238#section-4 / https://support.google.com/accounts/answer/1187538 |
| otpauth URI 파싱 | Google Authenticator Key URI Format | https://github.com/google/google-authenticator/wiki/Key-Uri-Format |
| URL 판별 (`isUrlLike`) | WHATWG URL Standard + `new URL()` | https://url.spec.whatwg.org/#urls |
| mailto: 링크 | RFC 6068 | https://datatracker.ietf.org/doc/html/rfc6068 |
| HTML 이스케이프 (`_esc`) | MDN innerHTML XSS 방지 | https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML#security_considerations |
| HTML→텍스트 변환 | MDN DOMParser | https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString |
| 한글 유니코드 범위 (U+AC00-U+D7A3) | Unicode Standard Ch.3 Hangul Syllables | https://www.unicode.org/versions/Unicode15.0.0/ch03.pdf |
| Excel 날짜 시리얼 (25569 오프셋) | Microsoft Excel 날짜 시스템 | https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487 |
| ISO 8601 날짜 형식 | ISO 8601 | https://www.iso.org/iso-8601-date-and-time-format.html |
| Excel 임시파일 `~$` 접두사 | Microsoft 지원 | https://support.microsoft.com/en-us/topic/description-of-the-tilde-file-43b45e3b-1c35-4460-a04e-8c02a999d3c1 |
| 클립보드 API | MDN Clipboard API | https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText |
| 파일 API (`webkitdirectory`) | MDN webkitRelativePath (비표준, Chrome/Edge/Firefox 지원) | https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath |
| sessionStorage (API 토큰 저장) | MDN Web Storage API | https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage |
| Fetch API + Authorization Bearer 헤더 | MDN Fetch API / HTTP Authorization | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch / https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization |
| Express `res.json()` 인터셉트 (login-one 결과 저장) | Express 4.x API `res.json()` | https://expressjs.com/en/4x/api.html#res.json |

> **heuristic (표준 없음)**: 헤더 패턴 매칭(`HEADER_PATTERNS`), 파일명 날짜 추출(`parseDateFromFilename`), 반복숫자 전화번호 제외 — Excel 파일에 공식 포맷이 없으므로 코드 주석에 heuristic 명시

### API로 불가능 (공식 확인) — 자동화로만 또는 불가
| 항목 | 사유 |
|---|---|
| 스트라이크 상세 (횟수·시기·사유·교육 이수) | YouTube 스튜디오 전용, 공개 API 없음. `auditDetails` 불리언이 최대치 |
| 종료 방송 피크/최저 시청자 | Data API 미제공 (생방송 중 `concurrentViewers`만) |
| Google 2SV 유무·전화번호 | 계정 보안설정 API 없음 → Puppeteer 자동화로만 |
| OAuth 클라이언트 JS 원본 추가 | 콘솔 전용 (clientauthconfig API 404, IAP admin은 org 필요) |

---

## 버전 정합 (공식 문서에 맞춤)
| 구성 | 버전/엔드포인트 | 공식 문서 |
|---|---|---|
| YouTube Data API | **v3** (`googleapis.com/youtube/v3`) | https://developers.google.com/youtube/v3/docs |
| Google Identity Services | `accounts.google.com/gsi/client` (버전리스, 항상 최신) | https://developers.google.com/identity/gsi/web |
| Identity Platform Admin | `identitytoolkit.googleapis.com/admin/v2` + `/v2` | https://cloud.google.com/identity-platform/docs/reference/rest |
| Node 런타임 | gauth 서버 설치본 (`node -c` 문법검사로 정합 확인) | https://nodejs.org |
| GitHub Actions | `actions/checkout@v4`, `appleboy/ssh-action@v1.0.3`, `appleboy/scp-action@v0.1.7` | https://github.com/appleboy/ssh-action |

---

## GitHub Actions 워크플로우 (48개)

### 배포·운영 (핵심)
| 파일 | 이름 | 트리거 | 동작 |
|---|---|---|---|
| `deploy-accounts-page.yml` | accounts.html 배포 | `gauth-public/accounts.html` 변경 | SCP → 서버 설치 + 3페이지 nav 메뉴 주입 |
| `diag-gauth-excel.yml` | jump 배포 | `trigger-deploy-jump.txt` 변경 | jump/ → 서버 SCP + Apache vhost + no-store + Clear-Site-Data + Let's Encrypt |
| `deploy-subsites.yml` | subsites 배포 | `trigger-deploy-subsites.txt` | `gauth-public/subsites.html` → 서버 SCP |
| `deploy-gauth.yml` | gauth 배포 | workflow_dispatch | 메인 프론트 배포 |
| `gauth-google-signup.yml` | GIS 위젯 배포 | `trigger-gsi-topright.txt` | index.html에 GIS 우상단 위젯 주입 + Express auth 라우트 + systemd env + 재시작 |
| `gauth-switch-old-cid.yml` | OLD client_id 전환 | `trigger-switch-old-cid.txt` | `.env` + systemd + index.html의 client_id를 OLD로 전환 + 재시작 |
| `gauth-set-new-cid.yml` | 새 client_id 설정 | `trigger-new-cid.txt` | 새 client_id 적용 |
| `gauth-yt-status.yml` | YouTube 채널상태 API | workflow_dispatch | `/api/youtube/channel-status` 라우트 배포 |
| `gauth-gsi-realtime.yml` | GIS 실시간 상태 | workflow_dispatch | 실시간 상태 패널 배포 |

### 메인 복원·정리
| 파일 | 동작 |
|---|---|
| `gauth-restore-main.yml` | gauth 메인 index.html 복원 + 하위 탭 제거 |
| `gauth-strip-subsite-from-main.yml` | 메인에서 하위 사이트 카드 삭제 (재발 방지) |
| `gauth-hide-subsite.yml` | 메인에서 하위 사이트 부분 숨김 (CSS+JS) |
| `gauth-fix-authquery.yml` | `authQuery`/`noCacheQuery` pass-through shim 주입 |

### 데이터 정비
| 파일 | 동작 |
|---|---|
| `gauth-excel-fix.yml` | mojibake 복구 + password↔youtube_url 스왈 |
| `gauth-excel-diag.yml` | 엑셀 파서 컨럼 매핑 진단 |
| `gauth-audit.yml` | 4,875건 무결성 버킷 집계 |

### 테스트·진단
| 파일 | 동작 |
|---|---|
| `integration-test.yml` | 통합 테스트 (API 200, DB 무결성, 채널상태 샘플) |
| `test-400.yml` | 400항목 체크리스트 실행 |
| `login-check.yml` | 로그인 상태 점검 |
| `verify-cid.yml` | client_id 검증 (서버 vs API 응답) |
| `gauth-diag-fetch-html.yml` | fetch가 HTML 돌려주는 URL 진단 |
| `gauth-dump-structure.yml` | 하위 사이트 카드 구조 덤프 |

### Google 인증 관련
| 파일 | 동작 |
|---|---|
| `gcip-enable.yml` | GCIP 활성화 + authorizedDomains 추가 |
| `gcip-google-idp.yml` | GCIP Google IdP 설정 |
| `gcip-probe.yml` | GCIP getConfig 조회 |
| `add-oauth-origin.yml` | OAuth JS origin 추가 시도 (API 없어 실패) |
| `find-client-secret.yml` | 클라이언트 시크릿 탐색 |
| `find-gcp-creds.yml` | GCP 자격증명 탐색 |
| `gauth-firebase-login.yml` | Firebase Auth 로그인 대안 |
| `fb-provision-webapp.yml` | Firebase 웹앱 프로비저닝 |
| `gauth-glogin-replicate.yml` | .info 사이트 로그인 복제 |
| `extract-glogin.yml` | .info 사이트 Google 로그인 추출 |

### 기타
| 파일 | 동작 |
|---|---|
| `create-cham-site.yml` | cham.cent-solution.online 사이트 생성 |
| `cham-ssl-retry.yml` | cham SSL 재시도 |
| `list-smm-gmails.yml` | SMM 주문 URL ↔ gauth DB gmail 매칭 |
| `distribute-matched-gmails.yml` | 매칭된 gmail 1개/사이트 배포 |
| `add-account-all-sites.yml` | 전 사이트 계정 추가 |
| `sunbi-add-account.yml` | sunbi 계정 추가 |
| `deploy-second.yml` | second 서브사이트 배포 |
| `query-accounts.yml` | 계정 조회 |
| `inspect-login-engine.yml` | 로그인 엔진 구조 검사 |
| `cloudflare-dns-check.yml` | Cloudflare DNS 조회 |
| `cf-token-create.yml` | CF DNS 토큰 생성 |
| `find-cf-creds.yml` | CF 자격증명 조회 |
| `read-gucci-cf.yml` | gucci CF 설정 읽기 |
| `reach-info.yml` | .info 서버 접근 |
| `search-info-folders.yml` | .info 서버 폴더 탐색 |
| `restore-cham-and-diag-api.yml` | cham 복원 + API 진단 |

모든 워크플로우는 `workflow_dispatch` 또는 `.github/trigger-*.txt` 파일 변경으로 발동.

---

## 로직 연결 (코드 간 의존)

```
accounts_normalized.json (email · password · totp_secret · youtube_url · site)
    │
    ├──[youtube_url]──► /api/youtube/channel-status ──► YouTube Data API v3
    │                     channels.list + search.list + videos.list
    │
    ├──[email+password+totp_secret]──► /api/login-one ──► Puppeteer 로그인
    │                                    /codes/:secret ──► otplib TOTP
    │
    ├──[site 기준 분류]──► /api/subsite-accounts ──► subsites.html / jump
    │
    └──[전체]──► /api/accounts ──► gauth 메인 (마스터 전용)

google_users.json (sub · email · name · picture · last_login)
    │
    └──[gauth_uid 쿠키]──► /api/auth/me ──► 프론트 아바타 표시
```

---

## 저장소 파일 구조

```
make/
├── README.md                     ← 이 파일 (단일)
├── TEST-PLAN.md                  ← 200항목 테스트 체크리스트
├── CLAUDE.md                     ← AI 지시사항
├── package.json                  ← 의존성 정의
├── advanced-google-login-v2.js   ← 고급 로그인 엔진
├── gauth-public/
│   ├── subsites.html             ← 하위 사이트 계정 조회 페이지
│   └── accounts.html             ← 전체 계정 리스트 + 개별 로그인 + 상태 표시
├── gauth-signup/
│   └── signup.html               ← 가입 페이지
├── jump/
│   ├── index.html                ← 보물섬 채널 현황 메인
│   ├── manifest.json             ← PWA 매니페스트
│   └── sw.js                     ← 서비스 워커
└── .github/
    ├── oauth-client-id.txt       ← 현재 사용 중인 OAuth client_id
    ├── trigger-*.txt             ← 워크플로우 트리거 파일들
    └── workflows/                ← GitHub Actions (48개)
```

---

## 치명적 버그 수정 이력

### ASI(Automatic Semicolon Insertion) 버그 — 계정 리스트 안 보임 (2026-08-22)
- **증상**: 메인 페이지에서 4,875개 계정 리스트가 완전히 안 보임 (통계도 `–` 표시)
- **원인**: `index.html` 두 번째 `<script>` 블록에서 변수 선언 뒤에 세미콜론 없이 IIFE가 이어짐
  ```javascript
  // 버그 코드 (세미콜론 누락)
  const vp = document.getElementById('viewport'), sp = document.getElementById('spacer')
  (function(){...})()
  // → JS 엔진이 getElementById('spacer')(function(){...})() 로 파싱
  // → TypeError: document.getElementById(...) is not a function
  ```
- **결과**: 스크립트 블록 전체 사망 → `load()`, `render()`, `applyFilter()` 모두 미실행
- **수정**: 변수 선언 끝에 세미콜론 추가 + IIFE 앞에 방어 세미콜론 추가
  ```javascript
  const vp = document.getElementById('viewport'), sp = document.getElementById('spacer');
  ;(function(){...})()
  ```
- **교훈**: IIFE 앞에는 항상 `;` 방어 세미콜론 사용. `let`/`const`/`var` 선언 뒤에 `(`로 시작하는 코드가 오면 ASI가 세미콜론을 삽입하지 않음

---

## 준수 규칙 (절대)

- 사용자에게 터미널 명령 지시 금지 — 모든 배포는 GitHub Actions/SSH 자동화
- 유료 라이브러리/서비스 금지
- 공식 문서만 참조 (MDN, GitHub 원본, W3C, Google 공식)
- 서버 IP 마스킹 — 문서에 노출 금지
- gauth 메인은 마스터 전용, 하위 계정 UI 재삽입 금지
- 백엔드는 gauth 자체 서버에만 (다른 사이트에 두지 않음)
- 추측 코딩 금지 — 공식 문서 URL 없는 API 호출 사용 불가
- tak 계정 테스트 시 다른 계정 건드리지 말 것
- 삭제된 서버 언급 금지 (우동카1~4, 우주1, 망치1, 의리1)
