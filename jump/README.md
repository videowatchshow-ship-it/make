# jump — 점프 사이트

배포 도메인: `https://jump.cent-solution.online/`

서버 경로: `/var/www/sites/jump/public/` (정적 파일 서빙)

## 파일

| 파일 | 역할 |
|------|------|
| `index.html` | 점프 사이트 진입 UI |
| `accounts.html` | 계정 조회 페이지 (gauth 계정 데이터 사용) |
| `login-issues.html` | 하위 사이트 로그인 문제 집계 (gauth의 login-issues.html과 동일 코드) |

## 데이터 소스

`login-issues.html`은 gauth와 동일하게 14개 하위 사이트의 `GET /api/<site>/login-issues`를 CORS로 병렬 페치 후 집계.
상태 변경도 하위 사이트에 직접 PATCH.

## 원본 문서

- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN HTTP CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS>
- MDN DOM: <https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model>
