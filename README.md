# videowatchshow-ship-it/make

gauth.cent-solution.online 배포 레포

---

## 접속 정보

| 항목 | 값 |
|------|-----|
| GitHub 계정 | `videowatchshow-ship-it` |
| 레포 | `videowatchshow-ship-it/make` |
| 로컬 경로 | `E:\projects\GAuth\make-repo` |
| 작업 브랜치 | `claude/gauth-frontend-backend-fixes-cg2icv` |
| 서버 도메인 | `gauth.cent-solution.online` |
| 서버 배포 경로 | `/var/www/sites/gauth/public` 또는 `/var/www/sites/gauth01/public` |
| Cloudflare Zone ID | `2601d4f4ab75c910f8d858ca036ff344` (cent-solution.online) |

## GitHub Secrets (Actions)

| Secret 이름 | 설명 |
|-------------|------|
| `GAUTH_HOST` | 서버 IP |
| `GAUTH_USER` | SSH 유저명 |
| `GAUTH_SSH_KEY` | SSH 개인키 |
| `CLOUDFLARE_TOKEN` | CF API 토큰 (설정됨) |
| `CLOUDFLARE_ZONE_ID` | CF Zone ID (미설정 → 자동 발견으로 대체) |

## 로컬 git 인증

```
# .git-credentials 위치: C:\Users\ADMIN\.git-credentials
# 토큰: C:\Users\ADMIN\.git-credentials 파일에서 확인 (gho_... 형식)
```

## 주요 파일 경로

| 파일 | 설명 |
|------|------|
| `gauth-public/index.html` | 메인 프론트엔드 (계정 관리 UI) |
| `gauth-public/accounts.html` | 계정 목록 페이지 |
| `.github/workflows/deploy-index.yml` | index.html 배포 워크플로우 |
| `.github/workflows/deploy-gauth.yml` | gauth 전체 배포 워크플로우 |

## 워크플로우 (운영용만 정리)

| 파일 | 용도 |
|------|------|
| `deploy-index.yml` | gauth-public/ → 서버 배포 + CF 캐시 퍼지 |
| `deploy-gauth.yml` | gauth 전체 배포 |
| `deploy-accounts-page.yml` | accounts.html 배포 |
| `deploy-second.yml` | 세컨드 사이트 배포 |
| `deploy-subsites.yml` | 서브사이트 배포 |
| `query-accounts.yml` | 계정 조회 |
| `search-account.yml` | 계정 검색 |
| `register-accounts.yml` | 계정 등록 |
| `add-account-all-sites.yml` | 전체 사이트 계정 추가 |
| `login-check.yml` | 로그인 상태 확인 |
| `recover-missing-totp.yml` | TOTP 복구 |
| `cloudflare-dns-check.yml` | CF DNS 확인 |
| `sync-index-to-repo.yml` | 서버 → 레포 동기화 |

## 수동 배포 명령

```powershell
# 환경 변수 설정
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
$env:GH_TOKEN = "<C:\Users\ADMIN\.git-credentials 파일의 gho_... 토큰>"

# deploy-index 수동 트리거
gh workflow run deploy-index.yml --repo videowatchshow-ship-it/make --ref claude/gauth-frontend-backend-fixes-cg2icv

# 실행 상태 확인
gh run list --repo videowatchshow-ship-it/make --workflow="deploy-index.yml" --limit 3
```

## 주요 이슈 히스토리

- **Cloudflare 캐시 퍼지 실패** → `CLOUDFLARE_ZONE_ID` secret 미설정. CF API로 Zone ID 자동 발견으로 해결.
- **폴더 스캔 배포 안됨** → `deploy-index.yml`에서 `cp` → `cp -r` 수정 (gauth-public/, jump/ 디렉토리 복사 실패)
- **레포 로컬 경로** → `C:\Users\ADMIN\make-repo` 삭제, `E:\projects\GAuth\make-repo` 사용
