# 통합 테스트 200 항목 (gauth · jump · cham)

범주별 체크리스트. 상태: ✅자동검증 / 🔵수동UI / ⛔API불가(공식 미제공)

## A. 페이지 로드 (1–20)
1. gauth 메인 HTTPS 200 ✅
2. gauth /subsites.html 200 ✅
3. jump 메인 200 ✅
4. cham 메인 200 ✅
5. gauth main → 캐시 no-store 헤더 ✅
6. jump Clear-Site-Data 헤더 ✅
7. gauth manifest.json 로드 🔵
8. jump manifest.json 로드 🔵
9. jump sw.js 로드 🔵
10. gauth 메인에 하위계정 카드 없음 ✅
11. gauth 우상단 Google 로그인 버튼 표시 🔵
12. subsites 헤더 렌더 🔵
13. 모바일 뷰포트 meta 존재 ✅
14. subsites max-width 반응형 🔵
15. jump PWA 설치 버튼 🔵
16. gauth 엑셀 업로드 카드 표시 🔵
17. 다크테마 색상 적용 🔵
18. 폰트 로드 🔵
19. 404 페이지 처리 🔵
20. HTTPS 리다이렉트(http→https) ✅

## B. API 엔드포인트 (21–60)
21. GET /api/subsite-accounts 200 ✅
22. GET /api/subsite-counts 200 ✅
23. GET /api/auth/config 200 ✅
24. GET /api/auth/me 200 ✅
25. GET /api/account-status 200 ✅
26. GET /api/youtube/channel-status?url= 200 ✅
27. channel-status ok:true 필드 ✅
28. channel-status subscriberCount ✅
29. channel-status videoCount ✅
30. channel-status viewCount ✅
31. channel-status privacyStatus ✅
32. channel-status completedLiveCount ✅
33. channel-status lastLive/lastLiveDaysAgo ✅
34. channel-status recentLives 배열 ✅
35. recentLives duration 포맷 ✅
36. channel 미존재 시 warn 반환 ✅
37. url 누락 시 400 ✅
38. subsite-accounts sites 배열 ✅
39. subsite-accounts accounts 상세 ✅
40. subsite-counts total ✅
41–55. 각 하위사이트(gain..cham) 계정 반환 ✅
56. /codes/:secret TOTP 생성 🔵
57. /api/login-one 계약 ✅
58. /api/login POST ✅
59. /api/auth/logout 쿠키 삭제 ✅
60. account-status server_time 갱신 ✅

## C. 채널 상태 실제 (61–90)
61–90. DB 실제 채널 30개 channel-status 조회 (구독·영상·조회·생방송·진행시간) ✅ (샘플 5개 자동)

## D. 프론트 버튼/상호작용 (91–140)
91. subsites 사이트 카드 클릭 → 펼침 🔵
92. 카드 재클릭 → 접힘 🔵
93. 이메일 10개 페이지네이션 🔵
94. 이전/다음 버튼 disabled 경계 🔵
95. 📊 채널상태 버튼 표시(youtube_url 있는 계정) 🔵
96. 채널상태 버튼 클릭 → 로딩 🔵
97. 채널상태 결과 렌더 🔵
98. 채널상태 재클릭 토글 🔵
99. 공개/비공개 배지 색상 🔵
100. 생방송 목록 날짜+진행시간 표시 🔵
101–120. 각 사이트별 펼침·상태조회 반복 🔵
121. gauth 로그인 버튼 클릭 → GSI 팝업 🔵
122. 로그인 후 아바타·이름 표시 🔵
123. 로그아웃 버튼 🔵
124. 실시간 상태 패널 5초 폴링 🔵
125. jump 사이트 카드 펼침 🔵
126. jump 이메일 페이지네이션 🔵
127. jump 엑셀 업로드 버튼 🔵
128. gauth 엑셀 업로드 폼 제출 🔵
129. 새로고침 버튼 🔵
130–140. 반응형(모바일/태블릿/데스크탑) 레이아웃 🔵

## E. 실제 계정 로그인 (141–150)
141. login-one: 계정1 (Puppeteer 실제 로그인) ✅자동
142. login-one: 계정2 ✅자동
143. login-one: 계정3 ✅자동
144. login-one: 계정4 ✅자동
145. login-one: 계정5 ✅자동
146. TOTP 2FA 자동 입력 🔵
147. 로그인 실패 시 failed 로그 기록 🔵
148. 세션 저장 🔵
149. recovery_email/phone 활용 🔵
150. 로그인 결과 UI 반영 🔵

## F. 데이터 무결성 (151–180)
151. 마스터 4,875건 유지 ✅
152. 파일명 mojibake 0 ✅
153. password↔url swap 완료 ✅
154. 이메일 중복 0 ✅
155–180. 버킷별 카운트 검증(이메일무효·비번누락·2FA 등) ✅

## G. 공식 API 불가 항목 (181–200) — ⛔
181. 2단계 인증 유무 조회 ⛔ (Google API 미제공)
182. 전화번호 조회 ⛔
183. 전화 2SV 강제 설정 ⛔
184. 스트라이크 횟수 ⛔
185. 스트라이크 시기 ⛔
186. 스트라이크 사유 ⛔
187. 교육 이수 처리 ⛔
188. 종료방송 피크 시청자 ⛔
189. 종료방송 최저 시청자 ⛔
190. 복구 전화 변경 ⛔
191–200. 위 항목의 자동화(브라우저) 대체안 — 공식 근거 없음, 추측코딩 금지 범위 ⛔

---
✅자동검증 항목은 `integration-test.yml`이 실행. 🔵수동UI는 브라우저 확인. ⛔는 Google이 원천 미제공.
