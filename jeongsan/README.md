# 참교육 정산표 시스템 (독립 사이트)

캄보디아 카지노 운영 정산 웹 시스템. 회원별 입금 정산 · 엑셀 정산표 · 일일정산 · 원장.
photo · photo2 · photo3 · gauth 폴더와 **완전히 독립**된 하위 사이트로 운영된다.
데이터는 서버 저장 (팀원 전원 동일 화면 공유) + 저장할 때마다 자동 백업.

---

## 1. 접속 주소

| 페이지 | 주소 |
|---|---|
| 회원별 정산 | https://참교육카지노.info/정산표/ |
| 엑셀 정산표 | https://참교육카지노.info/정산표/excel.html |
| 일일정산   | https://참교육카지노.info/정산표/udongka.html |
| 원장       | https://참교육카지노.info/정산표/원장.html |
| 로그인     | https://참교육카지노.info/정산표/login.php |
| 로그아웃   | https://참교육카지노.info/정산표/logout.php |

한글 도메인 안 되면 퓨니코드: `https://xn--9d0bw2fjtyymch7de9d.info/정산표/`

---

## 2. 로그인 (계정 5개 · rw 4개 + ro 1개)

로그인 안 하면 어느 페이지도 접근 불가.

| 아이디 | 비밀번호 | 권한 |
|---|---|---|
| cent    | 1147 | rw (읽기+저장) |
| ha      | 0830 | rw |
| tak     | 7272 | rw |
| jay     | 8282 | rw |
| 점프대표 | 1147 | **ro (읽기전용 · 저장 불가)** |

- `rw` 계정은 회원/엑셀/일일/원장 화면 자유롭게 편집·저장.
- `ro` 계정 (점프대표) 은 로그인 · 모든 페이지 열람 가능, **저장 버튼 누르면 서버가 403** (읽기전용).
- 계정 · 비번 · 권한 변경: 서버 `/var/www/sites/chamgyo/settlement-data/jeongsan_users.php` 만 수정 즉시 반영.
- 세션 1년 유지. 세션 쿠키 이름 `JSPSESSID` (photo 계열 `PHPSESSID` 와 격리).

---

## 3. 사이트 격리 (photo/photo2/photo3 와 완전 분리)

- 세션 쿠키: `JSPSESSID`, 쿠키 경로 `/정산표/`  → 다른 폴더로 새어나가지 않음.
- 세션 파일: `/var/www/sites/chamgyo/public/정산표/data/sessions/` (700, www-data)  → 타 사이트 GC 로 삭제되지 않음.
- 사용자 목록: `/var/www/sites/chamgyo/settlement-data/jeongsan_users.php` (웹루트 밖).
- 웹루트에서 `/data/*` 접근은 `.htaccess` 정규식 `RewriteRule "^data(/|$)" - [F,L]` 로 403 차단.

---

## 4. 파일 구조 (서버)

```
public/정산표/
├── index.html          # 회원별 정산 + 회사 자금 장부
├── excel.html          # 엑셀 정산표 (SheetJS)
├── udongka.html        # 일일정산
├── 원장.html           # 원장
├── data.php            # index 저장/불러오기 (data.json)
├── excel-data.php      # excel 저장/불러오기 (excel.json)
├── udongka-data.php    # udongka 저장/불러오기 (udongka.json)
├── login.php           # 로그인 폼
├── login_check.php     # 로그인 검증 → 세션 세팅
├── logout.php          # 세션 파기
├── session_conf.php    # 세션 격리 설정 (include 전용)
├── auth_check.php      # 세션 확인 (auto_prepend_file 로 자동 적용)
├── .htaccess           # 정규식 FilesMatch 로 auth 게이트
└── data/sessions/      # 세션 파일 (403 차단)

settlement-data/                          # 웹루트 밖 (외부 접근 불가)
├── data.json           # 회원별 + 자금장부
├── excel.json          # 엑셀표 (aoa)
├── udongka.json        # 일일정산 (rows + fx)
├── jeongsan_users.php  # 로그인 계정 (600 · www-data)
└── backups/            # 저장 때마다 타임스탬프 자동 백업
```

---

## 5. auth 게이트 (정규식 · PHP-FPM 호환)

서버는 PHP-FPM 이라 `.htaccess` 의 `php_value` 가 안 먹는다.
대신 `mod_rewrite` 정규식으로 HTML 요청을 PHP 래퍼로 돌린다:

```apache
DirectoryIndex index.php index.html
RewriteEngine On
# HTML 4종 → 동명 PHP 래퍼 (auth_check 후 readfile)
RewriteRule "^(index|excel|udongka|원장)\.html$" "$1.php" [L]
# 세션 폴더 차단
RewriteRule "^data(/|$)" - [F,L]
```

- `index.php` / `excel.php` / `udongka.php` / `원장.php` = `require auth_check.php` 후 원본 HTML `readfile()`.
- 데이터 API (`data.php` 등) 는 파일 첫 줄에서 직접 `require auth_check.php`.

- `login.php` · `login_check.php` · `logout.php` 는 정규식에 포함 안 됨 → 인증 없이 접근 가능.
- 미인증 페이지 요청 → `302 Location: login.php`.
- 미인증 API (POST 또는 `*-data.php`) → `401 {"ok":false,"err":"auth_required","login":"login.php"}`.

---

## 6. 데이터 스키마

### data.json (회원별 정산 + 자금장부)
```jsonc
{
  "members": [
    { "date":"2026-07-04", "start":"08:30", "end":"", "nick":"쁘롱", "name":"채창호",
      "phone":"01024488553", "account":"케이뱅크 100127355415",
      "type":"테더|캐쉬|환전", "deposit":"500",
      "result":"Lose|Win|", "rolling":"", "note":"메모" }
  ],
  "ledger": [ {"date":"","item":"차입금","sign":"+|-","amount":"700","note":""} ],
  "saved_at":"2026-07-07 21:00:00"
}
```
- 수익: `Lose` → `(deposit − rolling) × 30%` / `Win` → `−deposit × 30%` (손님 승 = 손실).
- 환전(`type=환전`) 은 역송(출금) → 역송액 칸에 표시, 입금 소계 제외.
- 입금액·역송액 칸: 위 = 해당 건 금액, 아래 = **그 달 첫 행부터의 전체 누적 합계** (마지막 행 누적 = 월 소계).
- 월별(6월/7월…) 구분 · 월 상단 컬럼 헤더 반복 · 소계 자동 표시.
- **최종수익(실제)** = (루징머니[그 달 입금−역송] − 롤링커미션) × 30%.
  월 소계 줄의 롤링커미션 칸에 금액 입력 전까지는 **"최종 미확정"** 으로 표시 (매달 1~3일 입력).
- **6월 데이터는 확정본** — 정리 스크립트가 절대 건드리지 않음.

### excel.json
```jsonc
{ "aoa": [ ["r1c1","r1c2"], ["r2c1","r2c2"] ], "saved_at":"..." }
```
SheetJS `sheet_to_json({header:1})` / `aoa_to_sheet` 그대로.

### udongka.json (일일정산)
```jsonc
{ "rows": [ {"date":"","sales":"","send":"","keep":"","tip":"","opex":"","fee":"","note":""} ],
  "fx": 4000, "saved_at":"..." }
```
- 순익: `매출 − 역송 − 킵 − 팁 − 운영지출 − 수수료`.

---

## 7. 저장 / 불러오기

- 페이지 열면 `boot()` 가 서버 GET 을 먼저 읽고 화면에 표시 → 로컬 캐시가 서버 덮어쓰지 않음.
- 편집 후 **💾 저장** 버튼 (오른쪽 아래 고정) 눌러야 서버 반영.
- 저장할 때마다 `settlement-data/backups/{data,excel,udongka}-YYYYMMDD-HHMMSS.json` 자동 백업.
- 원자적 쓰기: 임시파일 기록 → `rename()` 교체 (읽기 도중 깨진 JSON 없음).
- 세션 만료 후 저장 시 fetch 응답 401 반환 → 페이지 새로고침 → 로그인 페이지로 이동.
- **낙관적 잠금**: 저장 요청에 `base_saved_at` (마지막으로 불러온 시각) 포함.
  서버의 `saved_at` 과 다르면 **409 거부** → 화면이 자동으로 최신 데이터를 다시 불러옴.
  오래된 탭이 최신 데이터를 통째로 덮어쓰는 사고(삭제 행 부활·중복 증식) 원천 차단.

---

## 8. 시간대

전 서버·PHP `Asia/Phnom_Penh` (UTC+7) 고정.
`date_default_timezone_set('Asia/Phnom_Penh')`. `saved_at` 도 캄보디아 시각.

---

## 9. 공식 문서 기준 (추측 코딩 아님)

| 기능 | API | 공식 문서 |
|---|---|---|
| 세션 격리 | `session_name` · `session_set_cookie_params` · `session.save_path` | https://www.php.net/manual/en/book.session.php |
| 세션 픽세이션 방지 | `session_regenerate_id(true)` · `session.use_strict_mode` | https://www.php.net/manual/en/function.session-regenerate-id.php |
| 타이밍 안전 비교 | `hash_equals` | https://www.php.net/manual/en/function.hash-equals.php |
| 원자적 저장 | `file_put_contents` + `rename` | https://www.php.net/manual/en/function.rename.php |
| 정규식 파일 매칭 | Apache `FilesMatch` | https://httpd.apache.org/docs/current/mod/core.html#filesmatch |
| 자동 include | Apache `php_value auto_prepend_file` | https://www.php.net/manual/en/ini.core.php#ini.auto-prepend-file |
| 엑셀 입출력 | SheetJS `XLSX.read` · `sheet_to_json` · `aoa_to_sheet` · `writeFile` | https://docs.sheetjs.com |
| 시간대 | PHP `date_default_timezone_set` | https://www.php.net/manual/en/function.date-default-timezone-set.php |

SheetJS CDN: `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`.

---

## 10. 백업 / 복구

- 자동: 저장 때마다 `settlement-data/backups/` 에 타임스탬프 백업.
- 인증 파일 배포 직전: `settlement-data/backups/{file}.pre-auth-{unix}.bak` 로 원본 백업 (배포 워크플로 자동).
- 복구: 원하는 백업을 해당 위치로 `cp` 만 하면 끝.
