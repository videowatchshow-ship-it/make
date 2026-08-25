#!/usr/bin/env bash
set +e

echo "===== 1) nocache 설정 제거 (혹시 문제 원인일 수 있어 롤백) ====="
a2disconf nocache-html >/dev/null 2>&1 || true
rm -f /etc/apache2/conf-available/nocache-html.conf
echo "  removed"

echo
echo "===== 2) Apache 설정 문법 체크 ====="
apachectl configtest 2>&1 | tail -10
if [ $? -ne 0 ]; then
  echo "  configtest FAIL - 그래도 진행"
fi

echo
echo "===== 3) Apache full restart ====="
systemctl restart apache2
sleep 2
systemctl is-active apache2

echo
echo "===== 4) 모든 서브사이트 systemd 재시작 ====="
for svc in aura bacad cha gain georgia hanrabong james misskim poten rambo romi second simmani sunbi woodong woodong2; do
  systemctl daemon-reload >/dev/null 2>&1
  systemctl restart "$svc" 2>&1 | head -3
  state=$(systemctl is-active "$svc")
  echo "  $svc → $state"
done

echo
echo "===== 5) 리스닝 포트 확인 ====="
sleep 3
ss -ltnp 2>/dev/null | grep node | head -40

echo
echo "===== 6) 로컬 curl 각 서브사이트 (Apache 경유) ====="
for s in georgia simmani win cham poten bacad; do
  R=$(curl -sk --max-time 5 -o /tmp/gr -w "%{http_code}" "https://127.0.0.1/api/$s/accounts" -H "Host: $s.cent-solution.online" 2>/dev/null)
  echo "$s https://$s.cent-solution.online/api/$s/accounts → $R"
  head -c 200 /tmp/gr 2>/dev/null; echo
done
