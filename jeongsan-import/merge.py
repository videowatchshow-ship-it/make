#!/usr/bin/env python3
"""텔레그램 파싱 결과 → 정산 data.json 병합
사용법: merge.py <new_entries.json> <target data.json>
"""
import json, sys, os

if len(sys.argv) != 3:
    print("usage: merge.py <new.json> <data.json>", file=sys.stderr); sys.exit(1)

new_path, data_path = sys.argv[1], sys.argv[2]

with open(new_path, encoding="utf-8") as f:
    new_entries = json.load(f)
with open(data_path, encoding="utf-8") as f:
    data = json.load(f)

members = data.setdefault("members", [])
print(f"current members: {len(members)}")
print(f"new candidates:  {len(new_entries)}")

# dedupe key: (date, start, name, deposit, type)
existing = {(m.get("date",""), m.get("start",""), m.get("name",""),
             m.get("deposit",""), m.get("type","")) for m in members}
added, skipped = 0, 0
for e in new_entries:
    k = (e.get("date",""), e.get("start",""), e.get("name",""),
         e.get("deposit",""), e.get("type",""))
    if k in existing:
        print(f"  SKIP dup: {k}"); skipped += 1; continue
    members.append(e); existing.add(k); added += 1

members.sort(key=lambda x: (x.get("date",""), x.get("start","")))
data["members"]  = members
data["saved_at"] = "2026-07-31 02:00:00"
data["saved_by"] = "tg-import"

tmp = data_path + ".tgi.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
os.rename(tmp, data_path)

print(f"added:   {added}")
print(f"skipped: {skipped}")
print(f"total:   {len(members)}")
