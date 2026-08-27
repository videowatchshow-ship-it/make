# videowatchshow-ship-it/make

`cent-solution.online` 계정 관리 시스템 배포 레포.

각 서브 디렉터리마다 README가 있음 — 세부는 그쪽 참조.

| 서브 | README |
|------|--------|
| gauth 메인 프론트엔드 (`gauth.cent-solution.online`) | [`gauth-public/README.md`](./gauth-public/README.md) |
| 점프 사이트 (`jump.cent-solution.online`) | [`jump/README.md`](./jump/README.md) |
| 하위 사이트 (14개, `<site>.cent-solution.online`) | [`sub-sites/README.md`](./sub-sites/README.md) |

---

## 리포 구조

```
make/
├─ gauth-public/         # gauth 메인 프론트엔드 + Express 파서
├─ jump/                 # 점프 사이트 프론트엔드
├─ sub-sites/second/     # 하위 사이트 템플릿 (모든 하위 사이트에 동일 패치)
├─ .github/
│  ├─ workflows/         # GitHub Actions 배포 파이프라인
│  └─ scripts/           # 하위 사이트 idempotent 패처
└─ README.md             # 이 파일
```

## 접속 · 배포

| 항목 | 값 |
|------|-----|
| GitHub 레포 | `videowatchshow-ship-it/make` |
| 작업 브랜치 | `claude/gauth-frontend-backend-fixes-cg2icv` |
| 서버 IP | `***.***.***.***` (`GAUTH_HOST` secret) |
| SSH 유저 | `GAUTH_USER` secret |
| SSH 개인키 | `GAUTH_SSH_KEY` secret |
| Cloudflare 토큰 | `CLOUDFLARE_TOKEN` secret |
| Cloudflare Zone | `cent-solution.online` (Zone ID는 CF API로 자동 발견 또는 `CLOUDFLARE_ZONE_ID` secret) |

시크릿은 GitHub Actions Repository Secrets에서만 관리. 로컬/커밋에 절대 노출 금지.

## 운영 워크플로우 (`.github/workflows/`)

| 파일 | 트리거 | 용도 |
|------|--------|------|
| `deploy-index.yml` | `gauth-public/**` push | gauth 프론트+파서 배포, 엑셀 재파싱, CF 캐시 퍼지 |
| `deploy-subsite-login-issue.yml` | `sub-sites/**`, `.github/scripts/patch-subsite-login-issue.js` push | 14개 하위 사이트에 로그인 문제 UI/API idempotent 패치, CF 캐시 퍼지 |
| `deploy-subsites.yml` | `sub-sites/**` push | 서브사이트 정적 파일 배포 |
| `deploy-accounts-page.yml` | `gauth-public/accounts.html` push | accounts.html 단독 배포 |

## 공식 문서 참조 (모든 코드가 이 문서 기반)

- Node.js `fs` / `path`: <https://nodejs.org/api/fs.html>, <https://nodejs.org/api/path.html>
- Express 5: <https://expressjs.com/en/api.html>
- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN HTTP CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS>
- MDN DOM: <https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model>
- MDN MutationObserver: <https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver>
- Cloudflare Zone Purge API: <https://developers.cloudflare.com/api/operations/zone-purge>
- RFC 6238 (TOTP): <https://datatracker.ietf.org/doc/html/rfc6238>

---

## TOTP / 2FA 핵심 지식 (삽질 방지용)

### backup_codes → TOTP 시크릿 변환 로직

Google backup codes 형식: `mp4q sdm7 xmug p2jd ual4 osgo cbrp bvek` (8그룹 × 4자)

이 코드는 일회성 복구 코드가 아니라 **TOTP 시크릿으로도 사용 가능**. gauth가 이 방식으로 처리함.

```js
// gauth rebrowser-login.js line 71 — 모든 사이트에 동일 로직 적용해야 함
secret = String(secret).toUpperCase()
  .replace(/[\s\-_=]/g, "")   // 공백·하이픈 제거
  .replace(/[^A-Z2-7]/g, ""); // Base32 아닌 문자 제거 (숫자 3,4,8,9,0,1 등)
if (secret.length < 16) return null; // 너무 짧으면 무효
return authenticator.generate(secret); // otplib
```

**예시 변환**:
- 입력: `mp4q sdm7 xmug p2jd ual4 osgo cbrp bvek`
- uppercase + 공백제거: `MP4QSDM7XMUGP2JDUAL4OSGOCBRPBVEK`
- 비-Base32 제거(4 제거): `MPQSDM7XMUGP2JDUALOSGOCBRPBVEK` (31자 → 유효)

### 서버·파일 위치

| 사이트 | 서버 파일 위치 | 포트 | 서비스명 |
|--------|-------------|------|---------|
| gauth | `/opt/gauth-full/rebrowser-login.js` | 4000 | `gauth` |
| hae | `/var/www/sites/hae/server.js` | 3037 | `bacad` (복사본, 미수정) |
| misskim | `/var/www/sites/misskim/server.js` | - | - |

**hae accounts.json**: `/var/www/sites/hae/accounts.json`
- 필드: `email`, `password`, `totp_secret`(빈 경우 多), `backup_codes`(있는 경우), `status`, `allocated_date`
- `totp_secret`이 비어 있으면 `backup_codes`에서 위 로직으로 TOTP 추출

**gauth accounts_normalized.json**: `/opt/gauth-full/accounts_normalized.json`
- 형식: **배열** (객체가 아님). `norm.accounts` 접근하면 undefined → 0 accounts
- 올바른 접근: `const arr = Array.isArray(raw) ? raw : (raw.accounts || Object.values(raw))`

### hae index.html 패치 포인트 (3곳)

`/var/www/sites/hae/public/index.html` 에서 backup_codes → TOTP 처리가 필요한 위치:

1. **Promise.all map** (코드 fetch 루프): `secret`이 없을 때 backup_codes 변환 후 `/codes/:secret` 호출
2. **renderCards _ts** (UI 표시): 2FA 시크릿 셀에 표시할 값 결정
3. **refreshAllCodes** (30초 자동갱신): `if(!secret) continue` 전에 backup_codes 변환 삽입

### index.html 패치 시 주의사항

- **hae index.html은 CRLF (`\r\n`) 줄바꿈** — 멀티라인 문자열 매칭 시 반드시 `\r\n` 사용:
  ```js
  const CRLF = '\r\n';
  const old = "line1" + CRLF + "    line2";
  ```
- 파일 내 em-dash는 **리터럴 `—`** (6문자: `\`, `u`, `2`, `0`, `1`, `4`)로 저장됨
- node -e에서 `'\\u2014'`로 검색해야 매칭됨 (`'—'` = 실제 em-dash 문자로 변환되어 불일치)
- 문자열 매칭 실패 시 workflow 내 debug 출력으로 실제 바이트 확인:
  ```js
  const idx = html.indexOf("관련 키워드");
  console.log('TEXT:', JSON.stringify(html.substring(idx-80, idx+80)));
  ```

### 계정별 TOTP 유형

| 사이트 | totp_secret | backup_codes | TOTP 방식 |
|--------|------------|-------------|----------|
| misskim | `KNBEMS55LMXXY7AZ5Q2Y...` (실제 Base32) | 없음 | 직접 사용 |
| hae (wagwiresamuel 등) | 없음 | `mp4q sdm7...` 형식 | backup_codes 변환 |

---

## 규칙

- 유료 라이브러리·서비스 금지
- 공식 문서만 참조 (MDN, GitHub 원본, W3C, RFC, 각 공식 API 문서)
- 추측 코딩 금지
- 서버 IP·토큰 등 시크릿은 README에 마스킹, secrets에만 저장
- `tak` 계정 테스트 시 다른 계정 건드리지 말 것
