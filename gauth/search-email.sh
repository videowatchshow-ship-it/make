#!/usr/bin/env bash
BASE="https://gauth.cent-solution.online"

echo "=== Searching for ibrahimaishatu227 in server accounts ==="
curl -s "${BASE}/api/accounts" | python3 -c "
import json,sys
d=json.load(sys.stdin)
accs = d.get('accounts', d) if isinstance(d, dict) else d
if not isinstance(accs, list):
  print('Unexpected format:', type(accs))
  sys.exit(1)

print(f'Total accounts in response: {len(accs)}')

# Search for ibrahimaishatu (partial match)
found = []
for i, a in enumerate(accs):
  email = a.get('email','') or ''
  if 'ibrahimaishatu' in email.lower():
    found.append((i, a))
  # Also check partial - maybe domain was stripped
  if 'ibrahimaishatu227' in email.lower():
    found.append((i, a))

if found:
  print(f'FOUND {len(found)} matches:')
  for idx, a in found:
    print(f'  [{idx}] {json.dumps(a, ensure_ascii=False)}')
else:
  print('NOT FOUND in accounts list')
  # Search for partial matches
  partial = []
  for i, a in enumerate(accs):
    email = a.get('email','') or ''
    if 'ibrahim' in email.lower():
      partial.append((i, a))
  if partial:
    print(f'Partial matches for ibrahim: {len(partial)}')
    for idx, a in partial:
      print(f'  [{idx}] {json.dumps(a, ensure_ascii=False)}')
  else:
    print('No partial matches for ibrahim either')

# Check for emails without domains (stripped by old parser)
no_domain = [a for a in accs if '@' not in (a.get('email','') or '')]
print(f'\nEmails without @ symbol: {len(no_domain)}')
for a in no_domain[:10]:
  print(f'  {json.dumps(a, ensure_ascii=False)}')
"

echo ""
echo "=== Check parse_fail.log for ibrahimaishatu ==="
curl -s "${BASE}/api/parse-report" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(json.dumps(d, indent=2, ensure_ascii=False))
"
