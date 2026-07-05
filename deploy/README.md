# deploy/ — makeid01 ~ makeid09 서브도메인 어드민

**목적**: 참교육카지노.info 아래 서브도메인 9개를 만들고, 각각 담당자 1명이 로그인해서 자기 계정 리스트만 열람/업로드/삭제하는 사내 어드민을 배포합니다.

**DB 방식**: MySQL 8, DB 9개 완전 분리 (`makeid01_db` … `makeid09_db`).

**공식 문서 참조**:
- MySQL Reference Manual §13.1.20 CREATE TABLE — https://dev.mysql.com/doc/refman/8.0/en/create-table.html
- MySQL Reference Manual §13.7.1.4 GRANT — https://dev.mysql.com/doc/refman/8.0/en/grant.html
- PHP Manual: `password_hash` (Argon2id) — https://www.php.net/manual/en/function.password-hash.php
- PHP Manual: `sodium_crypto_secretbox` — https://www.php.net/manual/en/function.sodium-crypto-secretbox.php

## 파일 목록

| 파일 | 용도 |
| --- | --- |
| `schema.sql` | 한 DB의 테이블 스키마 (모든 서브도메인 공통) |
| `setup-databases.sh` | 9개 DB + 9명 SQL 유저 생성 (cPanel SSH 에서 실행) |
| `admin.php` | 단일 파일 어드민 (로그인/목록/업로드/삭제/로그아웃 라우팅) |
| `config.example.php` | 서브도메인마다 복사해서 `config.php` 로 개칭 후 값 채움 |
| `create-manager.php` | 최초 담당자 1명 등록용. **실행 후 반드시 삭제.** |
| `.htaccess` | HTTPS 강제 + 디렉토리 목록 차단 + 보안 헤더 |

## 배포 순서

### 0. 사전 준비
- cPanel 접속 권한 (또는 도메인 등록기관 콘솔)
- SSH 접속 권한
- `xlsx.min.js` — SheetJS v0.20 이상. 각 서브도메인 웹루트에 함께 업로드해야 브라우저-측 xlsx 파싱이 됩니다. (https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.min.js — 오프라인이면 offline 판 `credential_manager.html` 에서 추출)

### 1. 서브도메인 9개 생성 (cPanel)
```
cPanel → Subdomains
  Subdomain: makeid01    Domain: 참교육카지노.info    Document Root: /home/USER/public_html/makeid01
  … 09 까지 반복
```
각각 Let's Encrypt SSL 발급 (cPanel → SSL/TLS Status → Run AutoSSL).

### 2. 데이터베이스 9개 생성
```bash
ssh USER@참교육카지노.info
cd /path/to/uploaded/deploy
MYSQL_ROOT_USER=USER MYSQL_ROOT_PASS='...' PREFIX=USER_makeid ./setup-databases.sh > db-creds.txt
```
`db-creds.txt` 에 각 DB의 이름/유저/비번이 찍혀 나옵니다. 이 파일은 **다음 단계 끝나면 안전한 곳으로 옮기고 서버에서 삭제**.

### 3. 각 서브도메인에 파일 업로드
```
/home/USER/public_html/makeid01/
├── admin.php            (deploy/admin.php 복사)
├── .htaccess            (deploy/.htaccess 복사)
├── config.php           (deploy/config.example.php → config.php 로 이름 바꾸고 값 채움)
├── xlsx.min.js          (SheetJS)
└── create-manager.php   (담당자 등록 후 삭제)
```
9개 서브도메인 전부 반복. `config.php` 만 각기 다른 DB 정보.

### 4. 각 서브도메인 `config.php` 채우기
```php
'tenant'         => 1,                       // makeid01 → 1
'label'          => '1번 담당',
'db_name'        => 'USER_makeid01_db',      // db-creds.txt 의 값
'db_user'        => 'USER_makeid01_u',
'db_pass'        => '<생성된-비번>',
'crypto_key_b64' => '<php -r "..." 로 생성한 32B base64>',
```
`crypto_key_b64` 는 서브도메인마다 **다른 키**를 씁니다. 서브도메인 사이 데이터가 안 섞이도록.

### 5. 각 서브도메인 담당자 1명 등록
```bash
cd /home/USER/public_html/makeid01
php create-manager.php admin01 "1번 담당자"
# 비밀번호 프롬프트 → 12자 이상
rm create-manager.php    # ← 반드시 삭제
```

### 6. 접속 테스트
`https://makeid01.참교육카지노.info/` → 로그인 → 대시보드 → 엑셀 드래그 → 업로드.

## 담당자 사용 흐름

1. `https://makeid0N.참교육카지노.info/` 로 접속
2. 로그인 (아이디/비번은 사장님이 발급)
3. **엑셀/CSV 업로드**: xlsx 또는 csv 파일을 드래그 → 브라우저가 파싱 → 서버 DB 에 저장
   - 이메일이 중복이면 갱신 (`ON DUPLICATE KEY UPDATE`)
4. **검색**: 이메일·URL·메모 부분 일치
5. **삭제**: 행마다 삭제 버튼 (감사 로그 남음)

## 데이터가 어디 있는지 (담당자 격리 확인)

- makeid01 담당자가 로그인 → `config.php` 의 `db_name = USER_makeid01_db` 만 열림
- SQL 유저 권한 자체가 다른 DB 를 못 봄 (`GRANT ... ON makeid01_db.*` 만 부여됨)
- 즉 세션·쿠키가 조작돼도 다른 서브도메인 데이터는 물리적으로 접근 불가

## 감사 로그 확인

각 DB `audit_log` 테이블:
```sql
SELECT at, ip, action, detail FROM audit_log ORDER BY at DESC LIMIT 50;
```
로그인 실패, 업로드, 삭제 전부 기록됨.

## 백업 (cron)

`~/backup-makeid.sh`:
```bash
#!/usr/bin/env bash
set -e
STAMP=$(date +%F)
mkdir -p ~/backup
for n in 01 02 03 04 05 06 07 08 09; do
  mysqldump -u USER -p'ROOT_PASS' "USER_makeid${n}_db" \
    | gzip > ~/backup/makeid${n}_${STAMP}.sql.gz
done
# 7일 보관
find ~/backup -name 'makeid*.sql.gz' -mtime +7 -delete
```
crontab: `5 3 * * * ~/backup-makeid.sh` (매일 03:05 KST)

## 이 킷이 하지 **않는** 것

- 자동 로그인 (Puppeteer 등)
- 여러 계정으로 외부 사이트 자동 게시
- 서브도메인끼리 데이터 공유

담당자가 자기 DB 안에서 CRUD 만 합니다. Google 로 뭔가 자동 수행하지 않습니다.
