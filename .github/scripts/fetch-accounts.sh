#!/usr/bin/env bash
set +e
ACCT_FILE="/opt/gauth-full/accounts_normalized.json"
SEARCH="${1:-tientong9941}"
echo "=== URL 검색: $SEARCH ==="
sudo python3 -c "
import json, sys
data = json.load(open('$ACCT_FILE'))
items = data if isinstance(data, list) else list(data.values())
for i, a in enumerate(items):
    if isinstance(a, dict):
        email = a.get('email') or a.get('id') or ''
        url   = a.get('url') or a.get('channel_url') or a.get('youtube_url') or ''
        name  = a.get('name') or ''
        if '$SEARCH' in url or '$SEARCH' in email or '$SEARCH' in name:
            print(f'{i+1}. {email}  name={name}  url={url}')
"
