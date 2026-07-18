# 문서 — `docs/`

센트빔 CENTBEAM의 설계·운영·기여 문서 모음. 목적별 진입점.

| 문서 | 무엇을 답하나 | 언제 읽나 |
|--|--|--|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 왜 이 구조인가 — WHIP→MediaMTX→fan-out 설계, 컴포넌트 경계, 버전 근거(2026-07 실측) | 전체 그림·기술 결정 이해 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 어떻게 배포하나 — `panda-avata.cc`(GoDaddy→Cloudflare) DNS·Apache vhost·certbot·systemd·방화벽 전체 절차 | 서버에 올릴 때 |
| [CLOUDFLARE_API.md](CLOUDFLARE_API.md) | DNS를 API로 어떻게 바꾸나 — zone/레코드 CRUD curl 레퍼런스(proxied off 필수) | DNS 조작·회색구름 설정 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 어떻게 기여하나 — 브랜치(`claude/*`)·커밋 접두어·헤드리스 검증·PR(draft) 규칙 | 코드 변경 전 |
| [GLOSSARY.md](GLOSSARY.md) | 용어 — WHIP·fan-out·아바타·릴레이 등 | 낯선 용어 만날 때 |
| [MOBILE_UX_PRISM.md](MOBILE_UX_PRISM.md) | 폰에서 PRISM처럼 쓸 만한가 — 아이폰 뷰포트 실측 30항목(✅29/⚠️1) | 모바일 UX 상품화 점검 |

---

## 문서 원칙 (대기업식)

- **공식 문서 근거**: 프로토콜/설정 주장은 1차 출처(MDN·W3C·RFC·FFmpeg·MediaMTX 릴리스)에 근거한다. 추정 금지.
- **검증 가능**: 배포·명령·API는 실행 가능한 형태로 적고, 완성도는 [400문항 체크리스트](../CENTBEAM_PARITY_CHECKLIST.md)(감사 351~400 포함)로 추적한다.
- **한계 정직 고지**: 브라우저 원천 한계(임의 웹페이지 캔버스 합성 등)는 숨기지 않고 대안과 함께 명시한다.
- **비밀 비커밋**: 토큰·시크릿·스트림키는 문서/저장소에 넣지 않는다. 시크릿 파일은 서버 0600·env 주입.

---

## 빠른 링크

- 루트 개요: [../README.md](../README.md)
- 클라이언트 내부: [../client/README.md](../client/README.md)
- 서버/릴레이 운영: [../server/README.md](../server/README.md)
- 완성도 감사: [../CENTBEAM_PARITY_CHECKLIST.md](../CENTBEAM_PARITY_CHECKLIST.md)
