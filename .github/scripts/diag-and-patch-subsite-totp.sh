#!/usr/bin/env bash
# ref: RFC 6238 (TOTP) — HMAC-SHA1 30s window
set -e

echo "===== 1) georgia server.js에 TOTP/code 엔드포인트 있는지 ====="
grep -n "TOTP\|totp\|generateTOTP\|/code" /var/www/sites/georgia/server.js 2>/dev/null | head -20 || true
echo ""
echo "===== 2) 프론트가 어떤 엔드포인트로 코드 요청하는지 ====="
grep -oE '/api/[^"'"'"' ]+|/codes/[^"'"'"' ]+' /var/www/sites/georgia/public/index.html 2>/dev/null | sort -u | head -20 || true
