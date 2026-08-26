#!/usr/bin/env bash
set +e
echo "===== georgia Apache vhost ProxyPass 규칙 ====="
sudo grep -rnE "ProxyPass|Location|georgia" /etc/apache2/sites-enabled/ 2>/dev/null | grep -iE "georgia|codes|proxypass" | head -20
echo
echo "===== georgia vhost 파일 전체 (프록시 부분) ====="
F=$(sudo grep -rl "georgia.cent-solution" /etc/apache2/sites-enabled/ 2>/dev/null | head -1)
echo "vhost 파일: $F"
sudo grep -nE "ProxyPass|ProxyPassReverse|Location|RewriteRule|3036|:30" "$F" 2>/dev/null | head -30
echo
echo "===== https 라이브 /codes 테스트 (Apache 경유) ====="
echo "--- /api/georgia/accounts ---"
curl -sk --max-time 6 "https://georgia.cent-solution.online/api/georgia/accounts" -o /dev/null -w "  http=%{http_code}\n"
echo "--- /codes/SECRET ---"
curl -sk --max-time 6 "https://georgia.cent-solution.online/codes/UW6E7MNML5TB3PXCVWRLJV2W2PIBKB2L" -w "\n  http=%{http_code}\n"
echo
echo "===== 비교: bacad (작동중) vhost ====="
FB=$(sudo grep -rl "bacad.cent-solution" /etc/apache2/sites-enabled/ 2>/dev/null | head -1)
sudo grep -nE "ProxyPass|Location|codes|:30" "$FB" 2>/dev/null | head -15
echo "--- bacad https /codes ---"
curl -sk --max-time 6 "https://bacad.cent-solution.online/codes/C6IUY5TUL6AYI5C3BEMMHPHF2XCQ5VZO" -w "\n  http=%{http_code}\n"
