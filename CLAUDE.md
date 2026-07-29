# 절대 규칙

## 터미널 명령어 금지
**절대로 사용자에게 터미널 명령어를 실행하라고 요청하지 않는다.**
- 서버 배포, 파일 복사, 서비스 재시작 등 모든 작업은 자동화해서 처리한다
- "이 명령어를 실행하세요", "서버에서 이걸 치세요" 같은 말 금지
- 배포가 필요하면 GitHub Actions, 웹훅, 또는 자동 배포 파이프라인을 구축해서 해결한다
- 어떤 상황에서도 사용자에게 터미널 오더를 하지 않는다

## gauth 서버 정보
- 서버: GCP gucci-yanolza
- 서비스: systemd `gauth`
- Express 서버: `/opt/gauth-full/rebrowser-login.js` (port 4000)
- 엑셀 파서: `/opt/gauth-full/upload_excels.js`
- 프론트엔드: `/var/www/sites/gauth/public/index.html`
- 데이터: `/opt/gauth-full/accounts_normalized.json`
