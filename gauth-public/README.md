# gauth-public — gauth 메인 프론트엔드 + Express 파서

배포 도메인: `https://gauth.cent-solution.online/`

서버 경로: `/var/www/sites/gauth/public/` (정적 파일), `/opt/gauth-full/upload_excels.js` (Express)
systemd: `gauth.service` (port 4000)

## 파일

| 파일 | 역할 | 원본 문서 |
|------|------|-----------|
| `index.html` | 계정 조회 UI (로그인 팝업, backup_codes 표시) | MDN Web APIs |
| `accounts.html` | 계정 목록 페이지 | MDN Web APIs |
| `subsites.html` | 하위 사이트 계정 풀 | MDN Web APIs |
| `login-issues.html` | 하위 사이트별 로그인 문제 집계 + 상태 관리 (해결/보류/미확인) | MDN Fetch API, HTTP CORS |
| `upload_excels.js` | Express 서버 (엑셀 업로드/파싱, `/api/lookup`, `/api/subsites-pool` 등) | Express, Node.js `fs`, `xlsx` |
| `version.txt` | 프론트엔드 버전 문자열 |  |

## API 엔드포인트 (upload_excels.js)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/lookup?email=` | 계정 단건 조회 (backup_codes/totp_secret/password/recovery_email 반환) |
| `GET` | `/api/subsites-pool` | 하위 사이트 계정 풀 (`accounts_subsites.json`) |
| `POST` | `/api/upload-subsites` | 엑셀 업로드 → 파싱 |
| `POST` | `/api/split-to-subsites` | 계정을 하위 사이트별로 분배 |
| `POST` | `/api/rescan-uploads` | `uploads/archive/` 전체 재파싱 |

## 프론트엔드 특이사항

`login-issues.html`은 14개 하위 사이트의 `GET /api/<site>/login-issues`를 CORS로 병렬 페치 후 집계.
상태 변경(해결/보류/미확인/재개봉)은 해당 하위 사이트의 `PATCH /api/<site>/accounts/:email/login-issue`에 `{status, actor:'gauth'}`를 직접 전송.

## 배포

`.github/workflows/deploy-index.yml`:
1. SCP로 `gauth-public/*` → `/tmp/gauth-deploy` 업로드
2. `/var/www/sites/gauth/public` 및 `/var/www/sites/gauth01/public`에 복사
3. `/opt/gauth-full/upload_excels.js` 교체
4. `systemctl restart gauth`
5. `/opt/gauth-full/uploads_debug/` 전체 엑셀 재파싱 → `accounts_normalized.json` 갱신
6. Cloudflare 존 캐시 퍼지

## 원본 문서

- Express: <https://expressjs.com/en/api.html>
- Node.js `fs`: <https://nodejs.org/api/fs.html>
- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN HTTP CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS>
- SheetJS (xlsx): <https://docs.sheetjs.com/>
- Cloudflare Zone Purge: <https://developers.cloudflare.com/api/operations/zone-purge>
