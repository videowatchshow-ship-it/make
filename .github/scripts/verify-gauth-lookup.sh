#!/usr/bin/env bash
# ref: https://www.freedesktop.org/software/systemd/man/systemctl.html
set -e
echo "-- gauth service status --"
systemctl is-active gauth || true
systemctl status gauth --no-pager -n 15 | head -30 || true
echo ""
echo "-- port 4000 listening --"
ss -tlnp 2>/dev/null | grep ':4000' || echo "(nothing on 4000)"
echo ""
echo "-- lookup psond17fd --"
curl -sSk --max-time 5 "http://127.0.0.1:4000/api/lookup/psond17fd@gmail.com" | head -c 400 || echo "(failed)"
echo ""
echo "-- lookup maitdde628 --"
curl -sSk --max-time 5 "http://127.0.0.1:4000/api/lookup/maitdde628@gmail.com" | head -c 400 || echo "(failed)"
echo ""
echo "-- (public https) --"
curl -sSk --max-time 5 "https://gauth.cent-solution.online/api/lookup/psond17fd@gmail.com" | head -c 400 || echo "(failed)"
echo ""
