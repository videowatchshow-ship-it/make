# 절대 규칙

## 터미널 명령어 금지
**절대로 사용자에게 터미널 명령어를 실행하라고 요청하지 않는다.**
- 서버 배포, 파일 복사, 서비스 재시작 등 모든 작업은 자동화해서 처리한다
- "이 명령어를 실행하세요", "서버에서 이걸 치세요" 같은 말 금지
- 배포가 필요하면 GitHub Actions, 웹훅, 또는 자동 배포 파이프라인을 구축해서 해결한다
- 어떤 상황에서도 사용자에게 터미널 오더를 하지 않는다
- "sandbox라서 못 함" 변명 금지 — 방법을 찾아서 해결한다
- "확인 부탁드립니다" 금지
- 진행 계획 나열 금지 — 결과만 보고

## 캡처 규칙
**화면 캡처(스크린샷) 전에는 반드시 6초 대기한다.**
- Playwright/Puppeteer: 스크린샷 직전 `waitForTimeout(6000)`
- 예외 없음. 새 워크플로를 만들 때도 무조건 6초
- 보드는 로드 직후 캔버스가 비어 있고 bgl.js가 1.2초 폴링으로 그리기 때문에, 덜 기다리고 찍으면 빈 판을 찍어 놓고 오판하게 된다

## gauth 서버 정보 (gucci-yanolza)
- URL: https://gauth.cent-solution.online/
- 프론트엔드: `/var/www/sites/gauth/public/index.html`
- Express 서버: `/opt/gauth-full/rebrowser-login.js` (port 4000)
- 엑셀 파서: `/opt/gauth-full/upload_excels.js`
- 데이터: `/opt/gauth-full/accounts_normalized.json`
- 실패 큐: `/opt/gauth-full/parse_fail.log`
- 서비스: systemd `gauth`

## Cloudflare
- API Token: (GitHub Secrets에 CLOUDFLARE_TOKEN으로 저장)
- 참교육카지노 Zone ID: (GitHub Secrets에 CLOUDFLARE_ZONE_ID로 저장)

## 참교육카지노 · 3개 폴더 구조 (my-site-1)
- photo: otuki/cent/jay/tak 만 (미니뷰 숨김 + 가운데정렬)
- photo2: 원본 (모든 채널)
- photo3: tak 전용
- 데이터 심볼릭: photo3/data → photo2/data → photo/data (실체)
- hot-patch: /var/www/sites/chamgyo/public/photo2/hot_patches.json (2초 폴링)
- Apache 로그: /chamgyo_access.log
- 크롤러: /etc/cron.d/chamgyo-photo3-collector (매분)

## GitHub
- 저장소: videowatchshow-ship-it/make
- gauth 패치 참조: gauth-patches/ 폴더 (PR #5)

## 사용자 규칙 (절대 준수)
- 유료 라이브러리·서비스 금지
- 공식 문서만 참조 (MDN, GitHub 원본, W3C)
- README 하나만
- 사용자에게 로컬 조치 지시 금지
- 새 도메인 취득 제안 금지
- 권한 부족 시 "브라우저 클릭" 금지 (API로 완료)
- 도박 단어 사용 금지
- 삭제된 서버 언급 금지: 우동카1~4, 우주1, 망치1, 의리1
- 서버 IP는 README에 마스킹
- tak 계정 테스트 시 다른 계정 건드리지 말 것

## 자율 진행 규칙
- 사용자에게 "확인 부탁드립니다" 금지
- 진행 계획 나열 금지
- 정보 부족 시 웹 검색으로 자율 해결
- 결과만 최종 리포트 (경로 · PR URL · curl 검증 결과)
