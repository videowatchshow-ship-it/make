#!/usr/bin/env bash
# 전체 계정 1by1 정규식 감사 + 자동 교정
# ref: RFC 6238 (TOTP Base32), Google backup codes = 4+ groups of [a-z0-9]{4}
set -e

ACCT=/opt/gauth-full/accounts_normalized.json
BAK="${ACCT}.audit.bak.$(date +%s)"
cp "$ACCT" "$BAK"
echo "backup: $BAK"

sudo node <<'ENDOFNODE'
const fs = require('fs');
const ACCT = '/opt/gauth-full/accounts_normalized.json';

// 정규식 (MDN 정규식 표준)
const RE_EMAIL   = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const RE_URL     = /^https?:\/\//i;
const RE_TOTP    = /^[A-Z2-7]{16,64}$/;  // RFC 4648 Base32
const RE_BACKUP  = /^(?:[a-z0-9]{4}\s+){3,15}[a-z0-9]{4}$/i;  // 4~16 groups
const RE_KOREAN  = /[ㄱ-힣]/;
const RE_PHONE   = /^\+?[0-9\-() ]{7,}$/;
const RE_DIGITS  = /^[0-9]+$/;

function classify(v) {
  const s = String(v || '').trim();
  if (!s) return 'empty';
  if (RE_URL.test(s))    return 'url';
  if (RE_EMAIL.test(s))  return 'email';
  if (RE_BACKUP.test(s)) return 'backup';
  if (RE_TOTP.test(s))   return 'totp';
  if (RE_PHONE.test(s))  return 'phone';
  if (RE_KOREAN.test(s)) return 'korean';
  return 'other';
}

const raw = JSON.parse(fs.readFileSync(ACCT, 'utf8'));
const arr = Array.isArray(raw) ? raw : (raw.accounts || []);
console.log('scanning', arr.length, 'accounts');

let stats = {
  totp_was_backup:0, totp_was_url:0, totp_was_korean:0, totp_was_phone:0, totp_was_digits:0,
  pw_was_korean:0, pw_was_url:0, pw_was_backup:0, pw_was_totp:0,
  backup_was_totp:0,
  recovery_bad:0, recovery_recovered:0,
  fixed:0
};

for (const a of arr) {
  let touched = false;

  // 1) totp_secret 슬롯 정리
  if (a.totp_secret) {
    const t = classify(a.totp_secret);
    if (t === 'backup') {
      if (!a.backup_codes) a.backup_codes = a.totp_secret;
      a.totp_secret = '';
      stats.totp_was_backup++; touched = true;
    } else if (t === 'url' || t === 'korean' || t === 'phone' || t === 'digits' || t === 'email') {
      // 무효값
      if (t === 'url') stats.totp_was_url++;
      else if (t === 'korean') stats.totp_was_korean++;
      else if (t === 'phone') stats.totp_was_phone++;
      else if (t === 'digits') stats.totp_was_digits++;
      a.totp_secret = '';
      touched = true;
    } else if (t === 'other') {
      // 대소문자 오염된 Base32 시도
      const up = String(a.totp_secret).toUpperCase().replace(/[^A-Z2-7]/g, '');
      if (RE_TOTP.test(up)) { a.totp_secret = up; touched = true; }
      else { a.totp_secret = ''; touched = true; }
    }
  }

  // 2) password 슬롯 정리
  if (a.password) {
    const p = classify(a.password);
    if (p === 'korean') {
      // 한글 비번은 채널명 오검출 가능성 → 지움
      a.password = '';
      stats.pw_was_korean++; touched = true;
    } else if (p === 'url') {
      a.password = '';
      stats.pw_was_url++; touched = true;
    } else if (p === 'backup') {
      if (!a.backup_codes) a.backup_codes = a.password;
      a.password = '';
      stats.pw_was_backup++; touched = true;
    } else if (p === 'totp') {
      // 대문자 Base32는 비번보다 TOTP일 가능성 높음
      if (!a.totp_secret) a.totp_secret = a.password;
      a.password = '';
      stats.pw_was_totp++; touched = true;
    }
  }

  // 3) backup_codes 슬롯 정리
  if (a.backup_codes) {
    const b = classify(a.backup_codes);
    if (b === 'totp') {
      // 진짜 TOTP였음 → totp로 이동
      if (!a.totp_secret) a.totp_secret = a.backup_codes;
      a.backup_codes = '';
      stats.backup_was_totp++; touched = true;
    }
  }

  // 4) recovery_email 슬롯 정리
  if (a.recovery_email) {
    if (!RE_EMAIL.test(String(a.recovery_email).trim())) {
      a.recovery_email = '';
      stats.recovery_bad++; touched = true;
    }
  }

  if (touched) stats.fixed++;
}

// 원자적 저장
const tmp = ACCT + '.tmp.' + process.pid;
fs.writeFileSync(tmp, JSON.stringify(raw, null, 2));
fs.renameSync(tmp, ACCT);

console.log('===== AUDIT STATS =====');
console.log(JSON.stringify(stats, null, 2));

// 최종 요약
const noPw    = arr.filter(a => !a.password).length;
const noTotp  = arr.filter(a => !a.totp_secret).length;
const noBak   = arr.filter(a => !a.backup_codes).length;
const no2FA   = arr.filter(a => !a.totp_secret && !a.backup_codes).length;
console.log('AFTER: total=' + arr.length + ' noPw=' + noPw + ' noTotp=' + noTotp + ' noBackup=' + noBak + ' no2FA=' + no2FA);
ENDOFNODE

# gauth 서비스 재시작
sudo systemctl restart gauth 2>&1 || true
sleep 2
sudo systemctl is-active gauth && echo "gauth OK" || echo "gauth FAIL"
