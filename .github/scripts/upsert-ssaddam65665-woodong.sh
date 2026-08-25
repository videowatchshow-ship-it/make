#!/usr/bin/env bash
set -e
SITE=woodong
DIR=/var/www/sites/${SITE}
EMAIL="ssaddam65665@gmail.com"
NOTE="8월25일 밤 11시쯤 시작 부탁 드립니다."
TS=$(date +%s)

[ -f "$DIR/accounts.json" ] || { echo "no accounts.json"; exit 1; }
cp "$DIR/accounts.json" "$DIR/accounts.json.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$DIR/accounts.json';
  var email='$EMAIL'; var note='$NOTE';
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===email.toLowerCase();});
  if(i>=0){
    var prev=arr[i].note||'';
    arr[i].note = prev ? (prev+' / '+note) : note;
    arr[i].note_updated_at = new Date().toISOString();
    console.log('EXISTED — appended');
  } else {
    arr.push({email:email,password:'',totp_secret:'',backup_codes:'',recovery_email:'',
      youtube_url:'',channel_title:'',site:'$SITE',status:'active',
      allocated_date:new Date().toISOString().slice(0,10),
      added_at:new Date().toISOString(),note:note});
    console.log('ADDED NEW');
  }
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(Array.isArray(d)?arr:{accounts:arr},null,2));
  fs.renameSync(tmp,p);
  console.log('${SITE}_TOTAL='+arr.length);
"
chown www-data:www-data "$DIR/accounts.json"
