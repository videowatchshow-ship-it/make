#!/usr/bin/env bash
# ref: RFC 4648 §6 Base32 alphabet
set -e

echo "===== 서브사이트 목록 ====="
ls -1d /var/www/sites/*/ | sed 's#/var/www/sites/##;s#/##' | sort > /tmp/sites.txt
COUNT=$(wc -l < /tmp/sites.txt)
echo "총 서브사이트: $COUNT"
cat /tmp/sites.txt
echo

# 정규식 검수 + 자동 승격 (backup_codes → totp_secret)
cat > /tmp/audit.js <<'JS'
var fs=require('fs');
var sites=fs.readFileSync('/tmp/sites.txt','utf8').split('\n').filter(Boolean);
var B32=/^[A-Z2-7]{16,64}$/;
var report=[];
for(var s of sites){
  if(s==='gauth'||s==='gauth01') continue;
  var p='/var/www/sites/'+s+'/accounts.json';
  if(!fs.existsSync(p)){ report.push({site:s,total:0,ok:0,fix:0,bad:0,note:'no accounts.json'}); continue; }
  var raw;
  try{ raw=JSON.parse(fs.readFileSync(p,'utf8')); }
  catch(e){ report.push({site:s,total:0,ok:0,fix:0,bad:0,note:'JSON parse fail: '+e.message}); continue; }
  var arr = Array.isArray(raw) ? raw : (raw.accounts||[]);
  var total=arr.length, ok=0, fix=0, bad=0, changed=false;
  for(var a of arr){
    var t=(a.totp_secret||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z2-7]/g,'');
    if(t && B32.test(t)){
      if(t!==a.totp_secret){ a.totp_secret=t; changed=true; }
      ok++; continue;
    }
    // try backup_codes → maybe it holds the Base32 secret
    var bc=(a.backup_codes||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z2-7]/g,'');
    if(bc && B32.test(bc)){
      a.totp_secret=bc; changed=true; fix++; continue;
    }
    bad++;
  }
  if(changed){
    var tmp=p+'.tmp';
    fs.writeFileSync(tmp, Array.isArray(raw)?JSON.stringify(arr,null,2):JSON.stringify(raw,null,2));
    fs.renameSync(tmp,p);
  }
  report.push({site:s,total:total,ok:ok,fix:fix,bad:bad});
}
console.log('site,total,ok,fix,bad,note');
for(var r of report){
  console.log([r.site,r.total,r.ok,r.fix||0,r.bad,r.note||''].join(','));
}
JS
node /tmp/audit.js
rm -f /tmp/audit.js /tmp/sites.txt

echo
echo "===== gauth 마스터 DB 정규식 검수 ====="
node -e "
var fs=require('fs');
var p='/opt/gauth-full/accounts_normalized.json';
var d=JSON.parse(fs.readFileSync(p,'utf8'));
var arr=Array.isArray(d)?d:(d.accounts||[]);
var B32=/^[A-Z2-7]{16,64}$/;
var t=0,o=0,f=0,b=0,ch=false;
for(var a of arr){
  t++;
  var s=(a.totp_secret||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z2-7]/g,'');
  if(s && B32.test(s)){
    if(s!==a.totp_secret){ a.totp_secret=s; ch=true; }
    o++; continue;
  }
  var bc=(a.backup_codes||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z2-7]/g,'');
  if(bc && B32.test(bc)){ a.totp_secret=bc; ch=true; f++; continue; }
  b++;
}
if(ch){
  var tmp=p+'.tmp';
  fs.writeFileSync(tmp, Array.isArray(d)?JSON.stringify(arr,null,2):JSON.stringify(d,null,2));
  fs.renameSync(tmp,p);
}
console.log('gauth total='+t+' ok='+o+' fixed='+f+' bad='+b);
"
