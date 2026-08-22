# 절대 규칙

## 이미지·파일 배포 규칙 (재발 방지)
사용자가 "업로드했다 / 넣었다 / 올렸다" 라고 말하면 = 반드시 서버에 원본 파일이 있다는 뜻.
1. 배포 전 반드시 서버에서 원본 검색: `sudo find /tmp /var/www -name "<파일명 패턴>*" -mmin -120`
2. 원본 발견 → 그 파일 그대로 `sudo cp` 로 배포 (재현·재생성 금지)
3. 원본 없음 → "원본 파일 없어서 HTML/CSS로 재현합니다" 사전 고지 후 진행
4. 배포 후 3종 세트 실측 로그 필수: SHA256 대조 + CF `cf-cache-status` + 응답 `size`
5. Cloudflare purge 는 GitHub Actions runner 에서 `secrets.CLOUDFLARE_TOKEN` 로 직접 실행
   (SSH remote 안에서 `${VAR}` escape 문제로 토큰 안 넘어가는 사고 재발 금지)

## 터미널 명령어 금지
**절대로 사용자에게 터미널 명령어를 실행하라고 요청하지 않는다.**
- 서버 배포, 파일 복사, 서비스 재시작 등 모든 작업은 자동화해서 처리한다
- "이 명령어를 실행하세요", "서버에서 이걸 치세요" 같은 말 금지
- 배포가 필요하면 GitHub Actions, 웹훅, 또는 자동 배포 파이프라인을 구축해서 해결한다
- 어떤 상황에서도 사용자에게 터미널 오더를 하지 않는다
- "sandbox라서 못 함" 변명 금지 — 방법을 찾아서 해결한다
- "확인 부탁드립니다" 금지
- 진행 계획 나열 금지 — 결과만 보고

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

## accounts.html 규칙
- accounts.html은 검색/조회 + 로그인 전용 페이지 (계정 리스트 표시 금지)
- 계정 전체 리스트는 gauth.cent-solution.online 메인(index.html)에만 존재
- accounts.html에서는 이메일 검색 → 조회 결과 + 🔑 로그인 + 다음 순번만 표시

## gauth 계정 조회 "다음 순번" 규칙 (재발 방지)
- 조회 시 "다음 순번"은 반드시 서버 원본 순서(`accounts_normalized.json` 그대로)를 따른다
- 프론트엔드에서 정렬(`_sortByExcelDate` 등)한 배열을 다음 순번에 사용 금지
- 원본 순서 배열(`ALL_ORIGINAL`)을 별도 보관하고, 다음 순번 표시에는 반드시 `ALL_ORIGINAL` 사용
- 프론트엔드 정렬은 목록 표시용(`ALL`)에만 적용, 조회 결과의 다음 순번과 혼용 금지

## 자율 진행 규칙
- 사용자에게 "확인 부탁드립니다" 금지
- 진행 계획 나열 금지
- 정보 부족 시 웹 검색으로 자율 해결
- 결과만 최종 리포트 (경로 · PR URL · curl 검증 결과)
