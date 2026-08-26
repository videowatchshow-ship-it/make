#!/usr/bin/env bash
set +e
ACCT_FILE="/opt/gauth-full/accounts_normalized.json"
echo "=== 전체 지메일 계정 목록 ==="
sudo python3 -c "
import json
data = json.load(open('$ACCT_FILE'))
items = data if isinstance(data, list) else list(data.values())
for i, a in enumerate(items):
    if isinstance(a, dict):
        email = a.get('email') or a.get('id') or ''
        url   = a.get('url') or a.get('channel_url') or a.get('youtube_url') or ''
        name  = a.get('name') or ''
        print(f'{i+1}. {email}  name={name}  url={url}')
"
