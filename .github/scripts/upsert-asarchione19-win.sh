#!/usr/bin/env bash
set -e

SITE=win
DIR=/var/www/sites/${SITE}
EMAIL="Asarchione19@gmail.com"
NOTE="8월 28일 오후 10시쯤 재사용 부탁 드려요. 구독자 늘리고 있어요 8월 29일 재사용 부탁 드려요"
YT="https://www.youtube.com/@seem611"
TS=$(date +%s)

[ -f "$DIR/accounts.json" ] || { echo "no accounts.json"; exit 1; }
cp "$DIR/accounts.json" "$DIR/accounts.json.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$DIR/accounts.json';
  var email='$EMAIL';
  var note='$NOTE';
  var yt='$YT';
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  var key=email.toLowerCase();
  var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===key;});
  if (i>=0) {
    var prev=arr[i].note||'';
    arr[i].note = prev ? (prev + ' / ' + note) : note;
    if (!arr[i].youtube_url) arr[i].youtube_url = yt;
    arr[i].note_updated_at = new Date().toISOString();
    console.log('EXISTED — note appended');
    console.log('  new note: ' + arr[i].note);
  } else {
    arr.push({
      email: email,
      password: '',
      totp_secret: '',
      backup_codes: '',
      recovery_email: '',
      youtube_url: yt,
      channel_title: '',
      site: '$SITE',
      status: 'active',
      allocated_date: new Date().toISOString().slice(0,10),
      added_at: new Date().toISOString(),
      note: note
    });
    console.log('ADDED NEW');
  }
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d)?arr:{accounts:arr}, null, 2));
  fs.renameSync(tmp, p);
  console.log('${SITE}_TOTAL='+arr.length);
"
chown www-data:www-data "$DIR/accounts.json"
