#!/usr/bin/env bash
# ref: https://nodejs.org/api/fs.html#fsrenamesyncoldpath-newpath (atomic rename)
set -e

WIN=/var/www/sites/win
EMAIL="vin672152@gmail.com"
NOTE="오늘 바로 사용해 보시고 접속 인원 한번 말씀 부탁 드려요"
TS=$(date +%s)

[ -f "$WIN/accounts.json" ] || { echo "no accounts.json"; exit 1; }
cp "$WIN/accounts.json" "$WIN/accounts.json.bak.$TS"

node -e "
  var fs=require('fs');
  var path='$WIN/accounts.json';
  var email='$EMAIL';
  var note='$NOTE';
  var d=JSON.parse(fs.readFileSync(path,'utf8'));
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
    site: 'win',
    status: 'active',
    allocated_date: new Date().toISOString().slice(0,10),
    added_at: new Date().toISOString(),
    note: note
  };
  if (i>=0) { arr[i]=Object.assign({},arr[i],entry); console.log('updated existing'); }
  else { arr.push(entry); console.log('added new'); }
  var tmp=path+'.tmp.'+process.pid;
  fs.writeFileSync(tmp, JSON.stringify(Array.isArray(d)?arr:{accounts:arr}, null, 2));
  fs.renameSync(tmp, path);
  console.log('WIN_TOTAL='+arr.length);
"
chown www-data:www-data "$WIN/accounts.json"
echo "-- API check --"
curl -sSk --max-time 5 "https://win.cent-solution.online/api/win/accounts" | node -e "
  var d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{var j=JSON.parse(d);var a=j.accounts||[];var f=a.find(x=>(x.email||'').toLowerCase()==='$EMAIL');
    console.log('API total='+a.length);
    if(f)console.log('FOUND: '+JSON.stringify(f));
    else console.log('NOT FOUND in API');
    }catch(e){console.log('parse err: '+e.message);}
  });
" || true
