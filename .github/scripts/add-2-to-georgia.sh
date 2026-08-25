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
    {email:'psond17fd@gmail.com', password:'TmK#FFwUCN',
     backup_codes:'uw6e 7mnm l5tb 3pxc vwrl jv2w 2pib kb2l',
     youtube_url:'https://www.youtube.com/user/arshavskypavel/videos'},
    {email:'maitdde628@gmail.com', password:'TmK#vBh8x7',
     backup_codes:'iphr ote7 v5s5 xxbe h5f6 dtrt iqhy 3kdy',
     youtube_url:'https://youtube.com/user/ECP6372/videos'}
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
        totp_secret:'', recovery_email:'', channel_title:'',
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
