# gauth — 계정 관리 Express 서버 소스

배포: `https://gauth.cent-solution.online/` (port 4000)
서버 경로: `/opt/gauth-full/rebrowser-login.js` (메인 서버), `/opt/gauth-full/` (전체)
systemd: `gauth.service`

## 파일

| 파일 | 역할 |
|------|------|
| `index.html` | gauth 프론트엔드 UI (계정 조회, 로그인 실행, backup_codes 표시) |
| `auto_deploy.js` | Express API 라우터 모듈 (accounts 조회/수정, 프로필 관리) |
| `upload_excels.js` | 엑셀 업로드·파싱 → `accounts_normalized.json` 갱신 |
| `youtube-oauth-auto.js` | YouTube OAuth 자동 연결 |
| `search-email.sh` | 이메일로 계정 검색 쉘 스크립트 |
| `diagnose.sh` | gauth 서비스 진단 스크립트 |
| `sw.js` | Service Worker (오프라인 캐시) |
| `manifest.json` | PWA 매니페스트 |
| `lib/` | 로그인 자동화 라이브러리 (login/, captcha/, providers/) |

## 데이터 파일 (서버측)

| 경로 | 설명 |
|------|------|
| `/opt/gauth-full/accounts_normalized.json` | 전체 계정 DB (email, password, totp_secret, backup_codes 등) |
| `/opt/gauth-full/failed_accounts.json` | 로그인 실패 계정 큐 (reason 포함) |
| `/opt/gauth-full/parse_fail.log` | 엑셀 파싱 실패 로그 |

## 주요 API (auto_deploy.js + rebrowser-login.js)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/lookup?email=` | 계정 단건 조회 |
| `GET` | `/api/accounts` | 전체 계정 목록 |
| `POST` | `/api/login` | 자동 로그인 실행 |
| `POST` | `/api/upload` | 엑셀 업로드 |

## 배포

`.github/workflows/deploy-index.yml` — SCP 후 서비스 재시작 + Cloudflare 캐시 퍼지

## 원본 문서

- Express: <https://expressjs.com/en/api.html>
- Node.js `fs`: <https://nodejs.org/api/fs.html>
- Node.js `child_process`: <https://nodejs.org/api/child_process.html>
- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- appleboy/ssh-action: <https://github.com/appleboy/ssh-action>
