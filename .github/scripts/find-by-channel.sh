#!/usr/bin/env bash
set +e
echo "===== gauth 마스터 DB 검색 (참교육 / g8r) ====="
sudo grep -i -E "참교육|g8r|chamgyo" /opt/gauth-full/accounts_normalized.json 2>/dev/null | head -20

echo
echo "===== node로 정밀 검색 (youtube_url/channel_title/handle) ====="
sudo node -e '
const fs=require("fs");
function scan(path,label){
  try{
    const d=JSON.parse(fs.readFileSync(path,"utf8"));
    const arr=Array.isArray(d)?d:(d.accounts||[]);
    for(const a of arr){
      const blob=JSON.stringify(a).toLowerCase();
      if(blob.includes("g8r")||blob.includes("참교육")||blob.includes("chamgyo")){
        console.log(label+" | "+(a.email||"?")+" | "+(a.youtube_url||a.channel_title||""));
      }
    }
  }catch(e){}
}
scan("/opt/gauth-full/accounts_normalized.json","gauth");
const base="/var/www/sites/";
for(const s of fs.readdirSync(base)){
  const p=base+s+"/accounts.json";
  if(fs.existsSync(p)) scan(p,s);
}
'
echo DONE
