#!/usr/bin/env bash
# setup-databases.sh — makeid01_db..makeid09_db 9개를 한 번에 만듭니다.
#
# 사용법 (cPanel 접속 후 SSH):
#   MYSQL_ROOT_USER=cpuser MYSQL_ROOT_PASS='...' ./setup-databases.sh
#
# 참고: cPanel MySQL Wizard 로 GUI로도 만들 수 있지만 9번 반복이라 스크립트가 편함.
# MySQL 8 공식 문서: https://dev.mysql.com/doc/refman/8.0/en/create-database.html
set -euo pipefail

: "${MYSQL_ROOT_USER:?MYSQL_ROOT_USER 환경변수 필요}"
: "${MYSQL_ROOT_PASS:?MYSQL_ROOT_PASS 환경변수 필요}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
PREFIX="${PREFIX:-makeid}"          # cPanel 은 접두어가 자동 붙기도 함 (예: cpuser_makeid01)
SCHEMA_FILE="$(dirname "$0")/schema.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "❌ schema.sql not found next to this script"; exit 1
fi

for n in 01 02 03 04 05 06 07 08 09; do
  DB="${PREFIX}${n}_db"
  USER="${PREFIX}${n}_u"
  # DB 별 랜덤 비번 (32자, /dev/urandom base64) — 나중에 config.php 에 넣을 것
  PW="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)"

  echo "→ creating $DB / user $USER"
  mysql -h "$MYSQL_HOST" -u "$MYSQL_ROOT_USER" -p"$MYSQL_ROOT_PASS" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB}\`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${USER}'@'localhost' IDENTIFIED BY '${PW}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DB}\`.* TO '${USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

  # 스키마 적용
  mysql -h "$MYSQL_HOST" -u "$MYSQL_ROOT_USER" -p"$MYSQL_ROOT_PASS" "$DB" < "$SCHEMA_FILE"

  # config 스니펫을 stdout 에 뿌림 — 사장님이 각 서브도메인 config.php 에 붙여넣기
  cat <<CONF
# ---- makeid${n} 용 config 값 (config.php 에 붙여넣으세요) ----
DB_HOST='localhost'
DB_NAME='${DB}'
DB_USER='${USER}'
DB_PASS='${PW}'
# ------------------------------------------------------------

CONF
done

echo "✅ 9개 DB + 9명 유저 생성 완료. 위 config 값을 각 서브도메인 config.php 에 붙여넣으세요."
