-- Schema for one makeid subdomain (DB 9개 완전 분리 방식)
-- Run this against EACH of makeid01_db .. makeid09_db.
-- Source: MySQL 8.0 Reference Manual §13.1.20 CREATE TABLE Statement.
--         https://dev.mysql.com/doc/refman/8.0/en/create-table.html

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS managers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,          -- password_hash(PASSWORD_ARGON2ID)
  display_name  VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login    TIMESTAMP    NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(320) NOT NULL,
  password_enc  VARBINARY(512) NOT NULL,        -- sodium_crypto_secretbox
  totp_secret_enc VARBINARY(512) NULL,          -- 같은 방식
  year          SMALLINT UNSIGNED NULL,
  month         TINYINT  UNSIGNED NULL,
  login_url     VARCHAR(500) NOT NULL DEFAULT 'https://accounts.google.com',
  notes         TEXT NULL,
  source_file   VARCHAR(255) NULL,              -- 원본 xlsx/csv 파일명
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  KEY idx_date (year, month),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS upload_batches (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  manager_id  INT UNSIGNED NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  row_count   INT UNSIGNED NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_upload_manager FOREIGN KEY (manager_id) REFERENCES managers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  manager_id  INT UNSIGNED NULL,
  action      VARCHAR(32)  NOT NULL,            -- login, upload, delete, export
  detail      VARCHAR(500) NULL,
  ip          VARCHAR(45)  NULL,
  at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_at (at),
  KEY idx_manager (manager_id, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
