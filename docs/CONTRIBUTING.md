# 기여 가이드

> 어떤 개발자/AI가 와도 동일한 방식으로 작업하도록 규칙을 고정한다.

## 브랜치 / PR
- 피처 브랜치에서 작업(현재 활성: `claude/sleepy-goodall-per69w`).
- 완료 시 **draft PR**. 리뷰 통과 후 머지.
- 머지된 PR은 재사용 금지 — 후속 작업은 기본 브랜치에서 새로 분기.

## 커밋 메시지
- 형식: `<part>: <무엇을> (<왜>)`
- part 접두어: `client:` `server:` `docs:` `checklist:` `chore:`
- 예: `client: add mobile bottom action bar (thumb-zone reachability, C35)`

## 코드 스타일
- **클라이언트**: 의존성 0 유지. 단일 `studio.html`. 논리 블록은 `/* ── 배너 ── */` 주석으로 구분.
- **서버**: Node/Express 최소주의. 미디어 로직은 `fanout.sh`/MediaMTX, API는 `server.js`만.
- 주석은 "왜"를 남긴다(무엇은 코드가 말한다).

## 검증(필수)
런타임 있는 변경은 **헤드리스로 실제 구동 검증** 후 커밋:
- 클라이언트: Playwright(크로미움 가짜 장치) — 소스 추가/방향 토글/복원/콘솔에러 0.
- 서버: `node server.js` + `curl /api/health`, fan-out 로그 확인.
- 문서/체크리스트만 바꾼 변경은 예외.

## 체크리스트 규율
- 기능을 구현하면 `CENTBEAM_PARITY_CHECKLIST.md`의 해당 항목 상태를 **같은 커밋에서** 갱신.
- 상태 이모지 규칙: ✅ 통과 / ⚠️ 부분 / ❌ 미구현 / ➖ 해당없음.
- 집계는 스크립트로 재계산(임의 수정 금지).

## 비밀정보
- 스트림키·토큰·`.env`·실 `destinations.json`은 **커밋 금지**(.gitignore).
- 예시 파일(`*.example.json`)만 커밋.
