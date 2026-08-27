# woodong — 우동 스트리밍

**URL**: https://woodong.cent-solution.online/  
**서버 경로**: `/var/www/sites/woodong/`  
**서비스**: `systemd woodong` (또는 `site-woodong`)  
**포트**: Express HTTP (Apache/Nginx 역방향 프록시)

## 기능

| 화면 | 설명 |
|------|------|
| `index.html` | Google OAuth 로그인 → YouTube 채널 연동 계정 목록 |
| 로그인 문제 패널 | 계정 카드 하단: 지정된전화/로봇/비밀번호오류/기타/없음 라디오 + 저장 |
| 크레임 배지 | 우상단 고정: 문제 계정 수 실시간 표시 |

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/woodong/accounts` | 계정 목록 (accounts.json) |
| PATCH | `/api/woodong/accounts/:email/login-issue` | 로그인 문제 등록·수정·해제 |
| GET | `/api/woodong/login-issues` | 문제 계정 목록 |

## 데이터

- `accounts.json` — Google OAuth로 로그인한 계정 (email, name, picture, channel_id, channel_title, subscriber_count, logged_in_at, login_issue)
- `accounts.json`은 dict 또는 list 양쪽 가능 → 서버가 양쪽 파싱

## 원본 문서

- Express: https://expressjs.com/en/api.html
- Node.js fs: https://nodejs.org/api/fs.html
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
