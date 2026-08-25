#!/usr/bin/env bash
set +e
echo "===== georgia index.html: 렌더/로드 로직 부분만 ====="
# loadAccounts, render, fetch, codes 관련 라인 앞뒤 문맥
sudo grep -nE "loadAccounts|render|fetch|/codes|await|innerHTML|account-list|ALL|codes\[" /var/www/sites/georgia/public/index.html | head -120
echo
echo "===== 전체 script 블록 (라인번호) — 마지막 <script>부터 끝까지 ====="
sudo awk 'NR>=90 && NR<=210' /var/www/sites/georgia/public/index.html | cat -n
