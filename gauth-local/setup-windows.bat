@echo off
echo === gauth 로컬 서버 설치 ===

:: .env 없으면 복사
if not exist .env (
  copy .env.example .env
  echo .env 파일 생성됨 — 메모장으로 열어서 GAUTH_API_TOKEN 설정하세요
  notepad .env
  pause
)

:: logs 폴더 생성
if not exist logs mkdir logs

:: npm install
echo npm install 중...
call npm install

:: PM2 전역 설치
echo PM2 설치 중...
call npm install -g pm2
call npm install -g pm2-windows-startup

:: PM2로 서버 시작
echo 서버 시작 중...
call pm2 start ecosystem.config.js

:: 윈도우 시작 시 자동 실행 등록
call pm2-startup install
call pm2 save

echo.
echo === 완료 ===
echo 브라우저: http://localhost:4000
echo 상태 확인: pm2 status
echo 로그 확인: pm2 logs gauth
echo 재시작:   pm2 restart gauth
pause
