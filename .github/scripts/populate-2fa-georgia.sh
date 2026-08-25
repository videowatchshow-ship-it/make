#!/usr/bin/env bash
# 2fa.live는 backup codes를 그대로 입력받아 TOTP를 생성하므로
# frontend "2FA 시크릿" 슬롯에도 backup codes를 노출.
set -e
ACCT=/opt/gauth-full/accounts_normalized.json
GEO=/var/www/sites/georgia/accounts.json
TS=$(date +%s)

for f in "$ACCT" "$GEO"; do
  [ -f "$f" ] || continue
  cp "$f" "$f.bak.$TS"
done

node -e "
  var fs=require('fs');
  var emails={
    'psond17fd@gmail.com':'uw6e 7mnm l5tb 3pxc vwrl jv2w 2pib kb2l',
    'maitdde628@gmail.com':'iphr ote7 v5s5 xxbe h5f6 dtrt iqhy 3kdy'
  };
  function patch(p){
    var d=JSON.parse(fs.readFileSync(p,'utf8'));
    var arr=Array.isArray(d)?d:(d.accounts||[]);
    Object.keys(emails).forEach(function(em){
      var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===em;});
      if(i<0)return;
      arr[i].totp_secret = emails[em];
      arr[i].backup_codes = emails[em];
      arr[i].totp_hint = '2fa.live 에 backup codes 붙여넣어 TOTP 생성';
    });
    var tmp=p+'.tmp.'+process.pid;
    fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d)?arr:{accounts:arr}, null, 2));
    fs.renameSync(tmp, p);
    console.log('patched ' + p);
  }
  patch('$ACCT');
  patch('$GEO');
"

systemctl restart gauth 2>&1 || true
sleep 3

echo "-- 검증 --"
curl -sSk --max-time 5 "http://127.0.0.1:4000/api/lookup/psond17fd@gmail.com" | head -c 500
echo ""
curl -sSk --max-time 5 "http://127.0.0.1:4000/api/lookup/maitdde628@gmail.com" | head -c 500
echo ""
