# Cent Solution

계정 관리 + 자동 로그인 플랫폼

## 구성

| 경로 | 용도 |
|------|------|
| `gauth/` | gauth 서버 배포 스크립트 |
| `gauth-patches/` | gauth 패치 파일 |
| `.github/workflows/` | CI/CD 워크플로우 |

## 서버

| 서버 | 용도 | 도메인 |
|------|------|--------|
| gauth (gucci-yanolza) | 계정 관리 | gauth.cent-solution.online |
| my-site-1 (GCE) | 참교육 사이트 | xn--9d0bw2fjtyymch7de9d.info |

### 참교육 폴더 구조

| 폴더 | 용도 | 채널 |
|------|------|------|
| `/photo/` | 메인 (미니뷰 숨김 + 가운데정렬) | otuki, cent, jay, tak |
| `/photo2/` | 원본 (모든 채널) | 전체 |
| `/photo3/` | 가로 전용 | tak |

- 심볼릭: `photo3/data` → `photo2/data` → `photo/data` (실체)
- 배포: GitHub Actions → gauth SSH → gcloud SSH → my-site-1

## 워크플로우

| 파일 | 용도 |
|------|------|
| `deploy-gauth.yml` | gauth 서버 배포 |
| `deploy-gauth-pages.yml` | gauth 페이지 배포 |
| `gauth-server-diagnose.yml` | gauth 서버 진단 |
| `fix-photo3-final.yml` | photo3 복원/수정 |
| `test-photo3-verify.yml` | photo3 20항목 검증 |
| `yt-portrait-test-push.yml` | 세로 테스트 push |

## 기술 스택

- Node.js + Puppeteer (자동 로그인)
- Apache + PHP-FPM (참교육)
- Cloudflare CDN
- GitHub Actions (CI/CD)
