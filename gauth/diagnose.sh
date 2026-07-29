#!/usr/bin/env bash
set -euo pipefail
BASE="https://gauth.cent-solution.online"

echo "=== GET endpoints ==="
for ep in / /api/accounts /api/stats /api/conflicts /api/parse-report /api/upload-excels /api/deploy /api/health /api/search /api/fail-queue /api/reparse /api/git-pull /api/update /api/self-update /webhook /deploy /pull; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}${ep}" --max-time 5 || echo "000")
  echo "  GET  ${ep} => HTTP ${CODE}"
done

echo ""
echo "=== POST endpoints ==="
for ep in /api/upload-excels /api/deploy /api/git-pull /api/update /api/self-update /api/restart /webhook /deploy /pull /api/webhook; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}${ep}" -H "Content-Type: application/json" -d '{}' --max-time 5 || echo "000")
  echo "  POST ${ep} => HTTP ${CODE}"
done

echo ""
echo "=== /api/parse-report ==="
curl -s "${BASE}/api/parse-report" | python3 -m json.tool 2>/dev/null || curl -s "${BASE}/api/parse-report"

echo ""
echo "=== /api/accounts sample ==="
curl -s "${BASE}/api/accounts" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  if isinstance(d,list):
    print(f'Total accounts: {len(d)}')
    for a in d[:2]: print(json.dumps(a,indent=2,ensure_ascii=False))
  else:
    print(json.dumps(d,indent=2,ensure_ascii=False)[:2000])
except: print('parse error')
"

echo ""
echo "=== Response headers ==="
curl -sI "${BASE}/" | head -10
curl -sI "${BASE}/api/accounts" | head -5

echo ""
echo "=== Webhook test ==="
curl -s -w "\nHTTP %{http_code}" -X POST "${BASE}/webhook" -H "Content-Type: application/json" -d '{"ref":"refs/heads/main"}' --max-time 10
echo ""
