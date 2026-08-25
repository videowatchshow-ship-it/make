#!/usr/bin/env bash
set -e
ACCT=/opt/gauth-full/accounts_normalized.json
TS=$(date +%s)

[ -f "$ACCT" ] || { echo "no normalized"; exit 1; }
cp "$ACCT" "$ACCT.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$ACCT';
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
    var base={
      email:x.email, password:x.password, totp_secret:'',
      backup_codes:x.backup_codes, recovery_email:'',
      youtube_url:x.youtube_url, channel_title:'',
      source_file:'manual-add-georgia',
      source_mtime: Date.now()
    };
    if(i>=0){
      Object.assign(arr[i], base);
      console.log('UPDATED normalized: '+x.email);
    } else {
      arr.push(base);
      console.log('ADDED normalized: '+x.email);
    }
  });
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(Array.isArray(d)?arr:{accounts:arr},null,2));
  fs.renameSync(tmp,p);
  console.log('normalized_TOTAL='+arr.length);
"
systemctl restart gauth 2>&1 || true
sleep 2

echo "-- lookup 검증 --"
curl -sS --max-time 5 "http://127.0.0.1:4000/api/lookup/psond17fd@gmail.com" | head -c 400
echo ""
curl -sS --max-time 5 "http://127.0.0.1:4000/api/lookup/maitdde628@gmail.com" | head -c 400
echo ""
