#!/usr/bin/env bash
set -e

SITE=cham
DIR=/var/www/sites/${SITE}
EMAIL="atulsinghc767@gmail.com"
NOTE="9월1일 방송 하세요."
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
  var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===key;});
  if (i>=0) {
    var prev=arr[i].note||'';
    arr[i].note = prev ? (prev + ' / ' + note) : note;
    arr[i].note_updated_at = new Date().toISOString();
    console.log('EXISTED — note appended');
  } else {
    arr.push({
      email: email, password:'', totp_secret:'', backup_codes:'', recovery_email:'',
      youtube_url:'', channel_title:'', site:'$SITE', status:'active',
      allocated_date: new Date().toISOString().slice(0,10),
      added_at: new Date().toISOString(), note: note
    });
    console.log('ADDED NEW');
  }
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d)?arr:{accounts:arr}, null, 2));
  fs.renameSync(tmp, p);
  console.log('${SITE}_TOTAL='+arr.length);
"
chown www-data:www-data "$DIR/accounts.json"
