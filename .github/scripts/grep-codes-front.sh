#!/usr/bin/env bash
set +e
for s in georgia bacad poten simmani; do
  echo "===== $s index.html: codes/renderCards/tdcode 관련 ====="
  sudo grep -nE "var codes|codes =|codes\[|renderCards|tdcode|/codes/|Promise.all|ALL.map" /var/www/sites/$s/public/index.html 2>/dev/null | head -25
  echo
done
