#!/usr/bin/env bash
set -e
EMAIL="borensteindemarcro935@gmail.com"
LOCAL="borensteindemarcro935"

echo "===== accounts_normalized.json 상태 ====="
node -e "
  var d=JSON.parse(require('fs').readFileSync('/opt/gauth-full/accounts_normalized.json','utf8'));
  var a=Array.isArray(d)?d:(d.accounts||[]);
  var f=a.filter(x=>(x.email||'').toLowerCase()==='$EMAIL');
  if(!f.length){console.log('  NOT FOUND in normalized');}
  else f.forEach(x=>console.log('  '+JSON.stringify({email:x.email,pw:(x.password||'').slice(0,20),totp:(x.totp_secret||'').slice(0,40),bak:(x.backup_codes||'').slice(0,50),rec:x.recovery_email,src:x.source_file})));
"

echo ""
echo "===== Excel 파일 raw 스캔 ====="
sudo node -e "
  var fs=require('fs'), path=require('path');
  var XLSX=require('/opt/gauth-full/node_modules/xlsx');
  var dir='/opt/gauth-full/uploads_debug';
  var em='$LOCAL';
  var files=fs.readdirSync(dir).filter(f=>/\.(xlsx|xls)$/i.test(f));
  console.log('scanning '+files.length+' files for '+em);
  files.forEach(fn=>{
    try{
      var wb=XLSX.readFile(path.join(dir,fn));
      wb.SheetNames.forEach(sn=>{
        var rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:false});
        rows.forEach((r,ri)=>{
          if(JSON.stringify(r||[]).toLowerCase().includes(em)){
            console.log('FILE='+fn.slice(0,40)+' SHEET='+sn+' R'+ri+' '+JSON.stringify((r||[]).map(c=>String(c||'').slice(0,50))));
          }
        });
      });
    }catch(e){}
  });
"
