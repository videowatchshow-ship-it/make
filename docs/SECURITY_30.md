# 센트빔(CENTBEAM) 보안 30 — 공식 출처 기반 하드닝 체크리스트

> 대상: **유료화 예정 · 브라우저 + WHIP 릴레이** 스트리밍 SaaS. (로그인/결제 게이트는 2026-07-18 원복, 재작업 예정 — 하단 "구현 현황" 참고)
> 파일: `client/studio.html`, `server/server.js`, `server/fanout.sh`, `server/mediamtx.yml`, `server/deploy.sh`(Apache vhost).
> 상태: ✅ 구현 · 🟡 부분 · ⬜ 예정. 각 항목은 **공식 문서(OWASP ASVS/API Top10/Cheat Sheets · MDN · RFC · Google Identity)** 근거.

## A. 인증 & 로그인 게이트
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|1|Google ID 토큰 서버 검증(iss/aud/exp/서명), 식별은 `sub`|⬜|[Google Verify ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) — `server.js`에 `POST /api/auth/google` 추가, `google-auth-library verifyIdToken({idToken,audience})` 검증 후 세션 발급|
|2|"로그인 없으면 앱 비활성"을 **서버**에서 강제(UI 숨김 아님)|⬜|[OWASP ASVS V2](https://github.com/OWASP/ASVS)·[API5:2023 BFLA](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — `/api/*` 전역 `requireAuth`, 미인증 401|
|3|모든 /api·WHIP에 사용자별 인가(BOLA 방지)|⬜|[API1:2023 BOLA](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — destinations를 `{sub:{avatar:[]}}`로, `req.user.sub` 스코프. WHIP은 사용자별 publish 토큰|
|4|OAuth Code + PKCE + **state** + redirect_uri 정확매칭|⬜|[RFC 9700 §2.1](https://www.rfc-editor.org/info/rfc9700/) — `oauthConnect`에 `state` 추가·대조, `exchange`에서 redirectUri 허용목록 대조|

## B. 세션
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|5|`HttpOnly`+`Secure`+`SameSite`(권장 `__Host-`) 세션 쿠키|⬜|[RFC 6265bis](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html)·[OWASP Session Mgmt](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — 로그인 후 `Set-Cookie: __Host-cb_sess=…; HttpOnly; Secure; SameSite=Lax; Path=/`|
|6|짧은 액세스 토큰 + 리프레시 로테이션|⬜|[RFC 9700 §4.14](https://www.rfc-editor.org/info/rfc9700/) — 세션 TTL 15~30분, 갱신 시 이전 토큰 폐기|
|7|서버측 로그아웃/폐기 + 유휴·절대 타임아웃|⬜|[OWASP Session Mgmt](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — `POST /api/logout` 서버 세션·토큰파일 삭제|
|8|CSRF 방어(SameSite + double-submit 토큰)|⬜|[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — 쿠키세션 도입 시 헤더 vs 쿠키 토큰 대조|

## C. 전송 & 헤더
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|9|HSTS `preload`|🟡|[MDN HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security) — vhost에 `; preload` 추가 + hstspreload.org 등록|
|10|CSP `connect-src *` 제거 → 실제 오리진만|⬜|[MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) — `connect-src 'self' https://panda-avata.cc https://accounts.google.com https://oauth2.googleapis.com`|
|11|`frame-ancestors 'self'`(응답헤더) + X-Frame-Options|🟡|[MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors) — X-Frame-Options는 있음, vhost에 CSP `frame-ancestors` 헤더 추가(meta로는 무효)|
|12|COOP + CORP(크로스오리진 격리)|⬜|[MDN COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)·[CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy) — vhost 헤더 추가(OAuth 팝업이면 COOP=`same-origin-allow-popups`)|
|13|Permissions-Policy 최소권한|🟡|[MDN Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy) — camera/mic/display-capture=self 양호, `geolocation=(),payment=()` 등 추가 차단|

## D. 인젝션 & 입력 검증
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|14|FFmpeg fan-out 셸 인젝션 제거(list-form 실행)|⬜|[OWASP OS Command Injection](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html) — `execFile('ffmpeg',[args])` 또는 전 인자 quoting + 옵션 화이트리스트|
|15|rtmpUrl SSRF 방지 — scheme/host 허용목록|⬜|[OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)·[API7:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — `rtmp(s)/srt`만, 내부 IP 차단|
|16|경로 탐색 방지 — avatar/MTX_PATH `^[a-z0-9_-]{1,40}$`|⬜|[OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) — server.js·fanout.sh 양쪽 검증|
|17|대상 필드 스키마 검증 + 출력 인코딩(innerHTML 금지)|⬜|[OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) — name/rtmpUrl/streamKey 검증, `L.name`은 `textContent` 렌더|

## E. 레이트리밋 · 쿼터 · DoS
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|18|사용자별(IP 전용 아님) 레이트리밋|⬜|[API4:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — 인증 후 `sub`(+IP)로 키|
|19|WHIP 세션 캡 + 본문 크기 제한|🟡|[RFC 9725](https://www.rfc-editor.org/info/rfc9725/) — `json 64kb` 양호, `sub`별 동시 publish 상한 추가|
|20|요청 타임아웃 / slowloris 방지|⬜|[RFC 9110](https://www.rfc-editor.org/info/rfc9110/) — `server.headersTimeout/requestTimeout`, Apache `mod_reqtimeout`|
|21|Express 하드닝(`x-powered-by` 제거·프록시 신뢰 최소)|🟡|[OWASP Node.js](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html) — `trust proxy loopback` 양호, `app.disable('x-powered-by')` 추가|

## F. 안티 크롤링 / 스크래핑
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|22|전 콘텐츠 인증 게이트 + 초기 HTML 민감정보 미포함|⬜|[OWASP OAT-011 Scraping](https://owasp.org/www-project-automated-threats-to-web-applications/) — 대상/스트림키/이메일은 인증 후 API로만|
|23|robots.txt(`Disallow: /`) + `X-Robots-Tag: noindex`|⬜|[RFC 9309](https://www.rfc-editor.org/info/rfc9309/) — client/robots.txt + vhost 헤더|
|24|봇/헤드리스 스로틀 + 허니팟|⬜|[OWASP Automated Threats](https://owasp.org/www-project-automated-threats-to-web-applications/) — `sub`별 급증 스로틀, 허니팟 라우트 접근 시 차단|

## G. 결제 무결성
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|25|클라이언트 "paid" 절대 불신 — 매 세션 서버 검증|⬜|[API1/5:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)·[ASVS V4](https://github.com/OWASP/ASVS) — WHIP·/api 앞단 `requireEntitlement(sub)`|
|26|결제/웹훅 서명 검증(HMAC/온체인 confirmations)|⬜|[API8:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — 원본 바디로 서명 검증 후에만 엔타이틀먼트 갱신|
|27|멱등성 + 리플레이 방지(txid 1회 크레딧)|⬜|[IETF Idempotency-Key](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — 결제/웹훅 중복 무시|

## H. 시크릿 · 로깅 · 운영
| # | 조치 | 상태 | 근거 · 적용 |
|--|--|--|--|
|28|시크릿 0600 파일/env, 코드 하드코딩 금지|🟡|[OWASP Secrets Mgmt](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) — OAuth/토큰 양호, MediaMTX `pass` 기본값은 반드시 env 오버라이드·파일 0600|
|29|로그에 시크릿 미기록|🟡|[ASVS V7](https://github.com/OWASP/ASVS) — fanout 로그 키 미기록 양호, oauth 예외 로그 토큰 마스킹|
|30|오리진 방화벽 허용목록 + fail2ban + 의존성 패치|⬜|[API8:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) — `:3000`은 loopback/Apache만, `:8889`만 공개, 401/429 반복 IP 차단|

---

### 즉시 최상위 위험 3 (선조치)
1. **BOLA** — `/api/destinations` 무인증·무소유검증 → #2·#3
2. **인젝션/SSRF** — `fanout.sh`가 검증 없는 rtmpUrl을 ffmpeg에 → #14·#15
3. **게이트 부재** — Google 로그인이 "연동"용일 뿐, 서버 로그인/결제 게이트 없음 → #1·#2·#25

### 이미 양호(유지)
`express.json 64kb`, 토큰파일 `0o600`, `trust proxy loopback`, fanout 로그 키 미기록, Permissions-Policy(camera/mic/display-capture=self), X-Frame-Options.

---

## 구현 현황 (2026-07)

> **A(로그인 게이트)·G(결제 무결성) 계열은 2026-07-18 요청으로 전면 롤백, 추후 재작업 예정.**
> 짧게 붙였다 뗀 이유: 로그인·결제 게이트가 테스트/개발 흐름을 막아서 우선 원복. 서버는 다시
> 무인증(로그인 이전) 상태로 돌아갔다 — **B(BOLA)는 로그인 전까지 다시 열려있음**을 인지할 것.
> 재도입 시 이 문서의 A/B/G 항목(1~8, 25~27)과 `git log` 상 `feat(auth+pay)` 계열 커밋을 참고.

**✅ 구현 완료 · 유지 중 (헤드리스/스모크 검증, 로그인과 무관하게 독립적으로 유효):**
- **16·17** — 아바타 이름 `^[a-z0-9_-]{1,40}$` 경로검증, 임포트 씬 XSS 수정(레이어명 textContent·썸네일 data:image만).
- **15** — rtmpUrl 스킴/내부IP allowlist(SSRF·파일덮어쓰기 차단), streamKey 슬래시/상위경로 금지.
- **9·11·12·13·23** — HSTS preload·CSP frame-ancestors·COOP/CORP·Permissions-Policy 확장·robots.txt/X-Robots-Tag.
- **10** — CSP `connect-src *` → `'self' https:` 축소, `img-src`도 캔버스-오염 방지용 원래 제한(`self data: blob:`)으로 유지.
- **20·21·30(부분)** — requestTimeout/headersTimeout(slowloris), `x-powered-by` 제거, `:3000` loopback 바인딩.
- **19(부분)** — 대상 20개 쿼터(계정 없이도 서버 전체에 적용되는 자원 상한).

**⬜ 롤백됨 — 재작업 예정 (나중에):**
- **1·2·25** — Google ID토큰 로그인 게이트 + `requireLogin`/`requirePaid`. (`server/auth.js` 삭제됨, 필요시 git history `feat(auth+pay)` 커밋에서 복구)
- **3** — `/api/destinations` 아바타 소유권(BOLA) — 로그인 없이는 "내 것만" 구분할 신원이 없어 현재 다시 전체 공개.
- **5·7** — 세션 쿠키·로그아웃 — 로그인 자체가 없으므로 해당 없음.
- **26·27** — NOWPayments IPN 서명검증·결제 멱등 — 결제 게이트 자체 보류.
- **2(MediaMTX)** — 외부 인증 롤백, `authMethod: internal`로 복귀 — **publish 도 read 처럼 완전 공개**(로그인 없어서 잠글 신원이 없음). 경로 이름을 아는 사람은 누구나 그 방송으로 송출 가능. 로그인 재도입 시 최우선으로 다시 잠글 것.
- **4·6·8·18·24·30** — 기존과 동일하게 후속 예정.
- **14** — fanout `execFile` list-form 전환 권장(현재도 안전하지만 심층방어용).

> 재도입 우선순위 제안: 먼저 로그인(1) → BOLA(3) → 세션(5·7) → 결제(25~27) 순. MediaMTX 외부인증(2)은
> 로그인이 돌아온 뒤 동일한 패턴(`server/mediamtx.yml` `authMethod: http`)으로 다시 켤 수 있다.
