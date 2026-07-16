# legacy/ — 피벗 이전 도구 (범위 밖)

이 폴더의 파일들은 센트빔(CENTBEAM 스트리밍 스튜디오) **이전**의 계정관리 도구다.
스트리밍 앱과 **무관**하며, 참고/보존 목적으로만 남겨둔다. 센트빔 개발 시 이 파일들에 의존하지 말 것.

| 파일 | 내용 |
|--|--|
| `credential_manager.html` | 엑셀 기반 계정 관리 UI (구버전) |
| `advanced-google-login-v2.js` | Puppeteer 자동 로그인 스크립트 (구버전) |
| `package.json` | 구버전 Electron/Puppeteer 의존성 |
| `README.legacy.md` | 구버전 "Cent Solution" README 원본 |

> 센트빔은 **공식 OAuth(사용자 동의 로그인)** 를 지향한다(로드맵). 대량 자동 로그인/자동화는 센트빔 범위에 포함하지 않는다.
