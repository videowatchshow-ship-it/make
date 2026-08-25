#!/usr/bin/env bash
set -e

SITE=sunbi
DIR=/var/www/sites/${SITE}
EMAIL="dun23315@gmail.com"
NOTE="8월28일 오후 10시 시작 부탁 합니다"
TS=$(date +%s)

[ -f "$DIR/accounts.json" ] || { echo "no accounts.json"; exit 1; }
cp "$DIR/accounts.json" "$DIR/accounts.json.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$DIR/accounts.json';
  var email='$EMAIL';
  var note='$NOTE';
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  var key=email.toLowerCase();
  var acct=arr.find(function(a){return (a.email||'').toLowerCase()===key;});
  if(!acct){console.log('NOT FOUND — abort'); process.exit(2);}
  var prev=acct.note||'';
  acct.note = prev ? (prev + ' / ' + note) : note;
  acct.note_updated_at = new Date().toISOString();
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d)?arr:{accounts:arr}, null, 2));
  fs.renameSync(tmp, p);
  console.log('note updated for ' + email);
  console.log('  new note: ' + acct.note);
"
chown www-data:www-data "$DIR/accounts.json"
