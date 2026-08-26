#!/usr/bin/env bash
set +e
ACCT_FILE="/opt/gauth-full/accounts_normalized.json"
echo "=== accounts_normalized.json 에 2개 계정 추가 ==="
sudo python3 << 'PYEOF'
import json, sys

new_accounts = [
    {
        "email": "amanylove129@gmail.com",
        "password": "DXrbBGgfvbxOkB",
        "recovery_email": "amanylove12907.05ntc@hotmail.com",
        "totp_secret": "enlne2qwkgnnsynpi7ju6kmcplt4ussf",
        "url": "https://youtube.com/user/taylorfootball24/videos",
        "site": "spreadsheet"
    },
    {
        "email": "hendabadlla@gmail.com",
        "password": "BojICpgWeIXDbd",
        "recovery_email": "hendabadlla06.05ntc@hotmail.com",
        "totp_secret": "zxojjbopklumafkmv36b6koqst7atfz4",
        "url": "https://youtube.com/user/pillows900/videos",
        "site": "spreadsheet"
    }
]

try:
    with open('/opt/gauth-full/accounts_normalized.json', 'r') as f:
        data = json.load(f)
except Exception as e:
    print(f'읽기 실패: {e}')
    sys.exit(1)

existing_emails = set()
if isinstance(data, list):
    for a in data:
        if isinstance(a, dict):
            existing_emails.add(a.get('email',''))
    added = 0
    for acct in new_accounts:
        if acct['email'] not in existing_emails:
            data.append(acct)
            added += 1
            print(f'추가: {acct["email"]}')
        else:
            print(f'이미 존재: {acct["email"]}')
elif isinstance(data, dict):
    for a in data.values():
        if isinstance(a, dict):
            existing_emails.add(a.get('email',''))
    added = 0
    for acct in new_accounts:
        if acct['email'] not in existing_emails:
            data[acct['email']] = acct
            added += 1
            print(f'추가: {acct["email"]}')
        else:
            print(f'이미 존재: {acct["email"]}')

with open('/opt/gauth-full/accounts_normalized.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f'완료. {added}개 추가됨')
PYEOF
