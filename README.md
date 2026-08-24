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

## 규칙

- 유료 라이브러리·서비스 금지
- 공식 문서만 참조 (MDN, GitHub 원본, W3C, RFC, 각 공식 API 문서)
- 추측 코딩 금지
- 서버 IP·토큰 등 시크릿은 README에 마스킹, secrets에만 저장
- `tak` 계정 테스트 시 다른 계정 건드리지 말 것
