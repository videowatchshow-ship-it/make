# 사이트 구분 (절대 혼동 금지)

## https://gauth.cent-solution.online/ — 계정 관리 서버 (쉼이)

설명: 마스터 계정 DB, 엑셀 업로드/파싱, 로그인/2FA/TOTP/YouTube 토큰 발급.

- 경로: `/var/www/sites/gauth/public/index.html`
- Express: `/opt/gauth-full/rebrowser-login.js` (port 4000)
- 데이터: `/opt/gauth-full/accounts_normalized.json` (마스터 4,875건)
- systemd: `gauth`
- 메인 페이지: 엑셀 업로드, 로그인 순회, TOTP, YouTube API 유틸리티만 표시.
  - 하위 사이트별 계정 목록은 메인 페이지에 없음 (이전에 삽입된 탭 UI는 제거됨).
- **서브 페이지**: `/subsites.html` — 하위 사이트별 계정 조회 전용. 메인 우상단 "📦 하위 계정 →" 버튼에서 이동.
- **구글 로그인 위젯**: 메인 페이지 우상단. Google Identity Services (공식 문서) 방식 id_token 플로우. 한번 로그인하면 10년 httpOnly 쿠키로 유지 — 로그아웃 없음.
- **API**
  - `POST /api/auth/google` — GIS 버튼 콜백이 credential(id_token) POST. 서버는 `oauth2.googleapis.com/tokeninfo` 공식 엔드포인트에서 aud/iss/exp 검증.
  - `GET  /api/auth/me` — 로그인된 사용자 정보 (쿠키 기반).
  - `GET  /api/auth/config` — client_id 반환 (서버 설정 여부 확인용).
  - `GET  /api/subsite-accounts`, `/api/subsite-counts` — 하위 사이트 계정 (jump와 서브 페이지에서 사용).
- **필수 secret (GitHub Secrets)**
  - `GAUTH_HOST` / `GAUTH_USER` / `GAUTH_SSH_KEY`
  - `CLOUDFLARE_TOKEN` / `CLOUDFLARE_ZONE_ID`
  - `GOOGLE_OAUTH_CLIENT_ID` — 구글 로그인 위젯이 렌더되려면 필요. 없으면 위젯이 "미설정" 메시지를 보임.

## https://jump.cent-solution.online/ — 보물섬 채널 현황 (오른쪽)

설명: PWA 설치 가능한 표시 전용 페이지. 로그인/2FA/토큰 발급 기능 없음.

- 경로: `/var/www/sites/jump/public/`
- 소스: `jump/index.html`, `jump/manifest.json`, `jump/sw.js`
- 데이터: gauth의 `/api/subsite-accounts` 프록시를 통해 읽기 전용 표시
- Apache vhost 설정: `no-store` · `Clear-Site-Data: cache, storage` 강제 → 브라우저/CDN 캐시 자동 폐기
- 기능
  - 헤더: 보물섬 채널 현황
  - 엑셀 단일 업로드 버튼 (gauth로 프록시)
  - 하위 사이트별 카드: 이모지 + 영문명 + 한글표기 + 계정수. 카드 클릭시 페이지네이션된 이메일 펌침 (10개/페이지).

## Do / Don't

- gauth 메인은 **마스터/업로드 전용** — 하위 사이트 이메일 목록을 다시 넣지 말 것.
- 하위 사이트 계정 UI는 gauth `/subsites.html` 또는 jump.cent-solution.online에만 존재.
- 구글 로그인은 gauth에만 구현 — jump에서는 구현 금지.
- Cloudflare 사용. 서버 IP 마스킹되어 문서에 노출 금지.
