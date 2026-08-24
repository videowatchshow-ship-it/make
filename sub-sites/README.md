# sub-sites — 하위 사이트 (14개)

서버의 `/var/www/sites/<site>/` 아래에 각 사이트가 개별 Express 서버로 실행.
현재 14개: `james, win, sunbi, soktv, simmani, bacad, aura, naman, second, camstouch, romi, misskim, woodong, gain`.

도메인: `https://<site>.cent-solution.online/`

## 리포 구조

| 경로 | 역할 |
|------|------|
| `second/` | 하위 사이트 **템플릿** — 원본 소스 (server.js, public/index.html, package.json) |
| `../.github/scripts/patch-subsite-login-issue.js` | 14개 사이트에 로그인 문제 UI/API를 **idempotent** 하게 주입하는 Node 패처 |

`second/`는 새 하위 사이트를 만들 때의 baseline. 이미 배포된 14개 사이트는 서버측 파일이 원본이고, 로그인 문제 기능은 patcher가 마커(`LOGIN_ISSUE_PATCH_Vn`, `LOGIN_ISSUE_UI_Vn`)로 삽입.

## 하위 사이트가 노출하는 API (patcher가 주입)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/<site>/accounts` | 원본 (템플릿에 있음) |
| `PATCH` | `/api/<site>/accounts/:email/login-issue` | 로그인 문제 등록/수정/해제 · 상태 변경. Body: `{type?, note?, status?, actor?}` |
| `GET` | `/api/<site>/login-issues` | 로그인 문제 있는 계정 목록 (`{site, count, issues}`) |

`login_issue` 필드 구조 (accounts.json):
```json
{
  "type": "phone|robot|password|other",
  "note": "기타 사유 (최대 200자)",
  "status": "pending|resolved|hold|unknown",
  "marked_at": "ISO 8601",
  "status_at": "ISO 8601",
  "history": [
    { "at": "ISO 8601", "event": "reported|status", "type?": "...", "status?": "...", "actor": "subsite|gauth" }
  ]
}
```

## 프론트엔드 (patcher 주입)

각 사이트 `public/index.html`에 주입되는 UI:

- **우상단 고정 배지**: `크레임 N건` (빨강=문제 있음, 초록=0건)
- **각 계정 카드 하단 패널**:
  - 라디오: 지정된 전화 입력 / 로봇 / 비밀번호 오류 / 기타 / 없음
  - 기타 선택 시 텍스트 입력 (placeholder: "로그인 불편 사항 수동으로 기입해 주세요.")
  - **저장 버튼** (수동 클릭)
  - 상태 pill (보류중/해결됨/보류/미확인)
  - 히스토리 로그 (최근 최대 20개)

CORS는 모든 origin 허용 (`Access-Control-Allow-Origin: *`) — gauth·jump·기타 사이트에서 집계 페치 가능.
HTML 응답에는 `Cache-Control: no-cache, no-store, must-revalidate` 설정.

## Patcher 마커 (버전 업 시 이전 블록 자동 제거)

| 종류 | 현재 | 이전 |
|------|------|------|
| server.js | `LOGIN_ISSUE_PATCH_V3` | V2, (원본 V1) |
| index.html | `LOGIN_ISSUE_UI_V7` | V6, V5, V4, V3, V2, (원본 V1) |

Patcher가 정규식으로 이전 마커 블록을 제거한 후 새 블록을 삽입.

## 배포 (`.github/workflows/deploy-subsite-login-issue.yml`)

1. `.github/scripts/patch-subsite-login-issue.js`를 서버 `/tmp/subsite-patcher/`로 SCP
2. `/var/www/sites/*`를 스캔하여 `server.js`+`public/index.html`가 있는 디렉터리 탐지
3. 각 사이트에 대해:
   - `.bak.<timestamp>` 백업
   - `SITE=<name> DIR=<path> node patch-subsite-login-issue.js`
   - `chown www-data:www-data`
   - systemd 서비스 재시작 (`<site>.service` / `site-<site>.service` / `<site>-site.service` 중 존재하는 것)
4. Cloudflare 존 캐시 전체 퍼지

## 원본 문서

- Express 5: <https://expressjs.com/en/api.html>
- Node.js `fs` (원자적 rename): <https://nodejs.org/api/fs.html#fsrenamesyncoldpath-newpath>
- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN HTTP CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS>
- MDN MutationObserver: <https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver>
- MDN CSS `::placeholder`: <https://developer.mozilla.org/en-US/docs/Web/CSS/::placeholder>
- Cloudflare Zone Purge: <https://developers.cloudflare.com/api/operations/zone-purge>
- appleboy/ssh-action: <https://github.com/appleboy/ssh-action>
- appleboy/scp-action: <https://github.com/appleboy/scp-action>
