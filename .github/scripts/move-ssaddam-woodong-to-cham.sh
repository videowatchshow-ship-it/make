#!/usr/bin/env bash
set -e
EMAIL="ssaddam65665@gmail.com"
NOTE="8월25일 1회 30일 1회"
TS=$(date +%s)

# 1) woodong 에서 제거
WOO=/var/www/sites/woodong
[ -f "$WOO/accounts.json" ] && {
  cp "$WOO/accounts.json" "$WOO/accounts.json.bak.$TS"
  node -e "
    var fs=require('fs');
    var p='$WOO/accounts.json';
    var email='$EMAIL';
    var d=JSON.parse(fs.readFileSync(p,'utf8'));
    var arr=Array.isArray(d)?d:(d.accounts||[]);
    var before=arr.length;
    arr=arr.filter(function(a){return (a.email||'').toLowerCase()!==email.toLowerCase();});
    var d2=Array.isArray(d)?arr:{accounts:arr};
    var tmp=p+'.tmp.'+process.pid;
    fs.writeFileSync(tmp,JSON.stringify(d2,null,2));
    fs.renameSync(tmp,p);
    console.log('woodong: '+before+' → '+arr.length);
  "
  chown www-data:www-data "$WOO/accounts.json"
}

# 2) cham 에 추가/업데이트
CHM=/var/www/sites/cham
[ -f "$CHM/accounts.json" ] || { echo "no cham accounts.json"; exit 1; }
cp "$CHM/accounts.json" "$CHM/accounts.json.bak.$TS"
node -e "
  var fs=require('fs');
  var p='$CHM/accounts.json';
  var email='$EMAIL'; var note='$NOTE';
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===email.toLowerCase();});
  if(i>=0){
    var prev=arr[i].note||'';
    arr[i].note = prev ? (prev+' / '+note) : note;
    arr[i].site='cham';
    arr[i].note_updated_at = new Date().toISOString();
    console.log('cham: EXISTED — appended');
  } else {
    arr.push({email:email,password:'',totp_secret:'',backup_codes:'',recovery_email:'',
      youtube_url:'',channel_title:'',site:'cham',status:'active',
      allocated_date:new Date().toISOString().slice(0,10),
      added_at:new Date().toISOString(),note:note,migrated_from:'woodong'});
    console.log('cham: ADDED NEW (moved from woodong)');
  }
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(Array.isArray(d)?arr:{accounts:arr},null,2));
  fs.renameSync(tmp,p);
  console.log('cham_TOTAL='+arr.length);
"
chown www-data:www-data "$CHM/accounts.json"
