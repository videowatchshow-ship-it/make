#!/usr/bin/env bash
set -e
GEO=/var/www/sites/georgia/accounts.json
TS=$(date +%s)
cp "$GEO" "$GEO.bak.$TS"

node -e "
  var fs=require('fs');
  var p='$GEO';
  var d=JSON.parse(fs.readFileSync(p,'utf8'));
  var arr=Array.isArray(d)?d:(d.accounts||[]);
  var targets=['amanylove129@gmail.com','hendabadlla@gmail.com'];
  targets.forEach(function(em){
    var i=arr.findIndex(function(a){return (a.email||'').toLowerCase()===em.toLowerCase();});
    if(i<0){console.log('NOT FOUND: '+em);return;}
    var bc=arr[i].backup_codes||'';
    if(bc && !arr[i].totp_secret){
      arr[i].totp_secret=bc;
      console.log('FIXED totp_secret for '+em);
    } else {
      console.log('SKIP '+em+' totp_secret='+arr[i].totp_secret);
    }
  });
  var tmp=p+'.tmp.'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(Array.isArray(d)?arr:{accounts:arr},null,2));
  fs.renameSync(tmp,p);
"
chown www-data:www-data "$GEO"
systemctl restart georgia 2>/dev/null || true
sleep 2
echo "georgia: $(systemctl is-active georgia)"
