#!/usr/bin/env bash
set -e

SITE=poten
DIR=/var/www/sites/${SITE}
EMAIL="oaixuan0@gmail.com"
NOTE="오늘 바로 사용해 보시고 접속 인원 한번 말씀 부탁 드려요"
TS=$(date +%s)

[ -f "$DIR/accounts.json" ] || { echo "no accounts.json for ${SITE}"; exit 1; }
cp "$DIR/accounts.json" "$DIR/accounts.json.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$DIR/accounts.json';
  var email='$EMAIL';
  var note='$NOTE';
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  var key=email.toLowerCase();
  var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===key;});
  var entry={
    email: email,
    password: '',
    totp_secret: '',
    backup_codes: '',
    recovery_email: '',
    youtube_url: '',
    channel_title: '',
    site: '$SITE',
    status: 'active',
    allocated_date: new Date().toISOString().slice(0,10),
    added_at: new Date().toISOString(),
    note: note
  };
  if (i>=0) { arr[i]=Object.assign({},arr[i],entry); console.log('updated existing'); }
  else { arr.push(entry); console.log('added new'); }
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d)?arr:{accounts:arr}, null, 2));
  fs.renameSync(tmp, p);
  console.log('${SITE}_TOTAL='+arr.length);
"
chown www-data:www-data "$DIR/accounts.json"
