#!/usr/bin/env bash
set -e
SITE=georgia
DIR=/var/www/sites/${SITE}
TS=$(date +%s)

[ -f "$DIR/accounts.json" ] || { echo "no accounts.json"; exit 1; }
cp "$DIR/accounts.json" "$DIR/accounts.json.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$DIR/accounts.json';
  var incoming=[
    {email:'amanylove129@gmail.com', password:'DXrbBGgfvbxOkB',
     recovery_email:'amanylove12907.05ntc@hotmail.com',
     backup_codes:'enlne2qwkgnnsynpi7ju6kmcplt4ussf',
     youtube_url:'https://youtube.com/user/taylorfootball24/videos'},
    {email:'hendabadlla@gmail.com', password:'BojICpgWeIXDbd',
     recovery_email:'hendabadlla06.05ntc@hotmail.com',
     backup_codes:'zxojjbopklumafkmv36b6koqst7atfz4',
     youtube_url:'https://youtube.com/user/pillows900/videos'}
  ];
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  incoming.forEach(function(x){
    var key=x.email.toLowerCase();
    var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===key;});
    if(i>=0){
      Object.assign(arr[i], x, {site:'georgia', note_updated_at:new Date().toISOString()});
      console.log('UPDATED '+x.email);
    } else {
      arr.push(Object.assign({
        totp_secret:'', channel_title:'',
        site:'georgia', status:'active',
        allocated_date:new Date().toISOString().slice(0,10),
        added_at:new Date().toISOString(), note:''
      }, x));
      console.log('ADDED '+x.email);
    }
  });
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(Array.isArray(d)?arr:{accounts:arr},null,2));
  fs.renameSync(tmp,p);
  console.log('georgia_TOTAL='+arr.length);
"
chown www-data:www-data "$DIR/accounts.json"
