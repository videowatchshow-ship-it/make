#!/usr/bin/env python3
"""텔레그램 재검수 결과 → 정산 data.json 병합
- dedup key: (date, start, name, type) — deposit 비교 안 함 (덮어쓰기 X)
- 07-08 이전은 유지 (서버 기존 데이터 100% 정확)
- 강시원 07-20 = $3000 (사용자 지정) → 병합 후 강제 확정
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

# 기존 (date, start, name, type) 집합
existing = {(m.get("date",""), m.get("start",""), m.get("name",""), m.get("type","")) for m in members}
added, skipped = 0, 0
for e in new_entries:
    k = (e.get("date",""), e.get("start",""), e.get("name",""), e.get("type",""))
    if k in existing:
        skipped += 1; continue
    members.append(e); existing.add(k); added += 1
    print(f"  + {e['date']} {e['start']} {e['name']:10} {e['type']:2} ${e['deposit']:6} {e.get('note','')[:60]}")

# 강시원 07-20 = $3000 강제 확정 (사용자 지정)
for m in members:
    if m.get("name")=="강시원" and m.get("date")=="2026-07-20" and m.get("deposit")!="3000":
        old = m.get("deposit")
        m["deposit"] = "3000"
        m["type"]    = "캐쉬"
        m["nick"]    = "여신"
        m["note"]    = "캐쉬 바인 $3000 (기존 손님·대표 상의·이기면 익일 재게임) [사용자 확정]"
        print(f"  ! 강시원 07-20 강제확정: deposit {old} → 3000")

# 마키아벨리 정규화 (마키아밸리 · 마키 → 마키아벨리)
for m in members:
    if m.get("name") in ("마키아밸리","마키아벨","마키"):
        m["name"] = "마키아벨리"

# 정렬
members.sort(key=lambda x: (x.get("date",""), x.get("start","")))
data["members"]   = members
data["saved_at"]  = "2026-07-31 02:30:00"
data["saved_by"]  = "full-audit"

tmp = data_path + ".mrg.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
os.rename(tmp, data_path)

print(f"\nadded:   {added}")
print(f"skipped: {skipped}")
print(f"total:   {len(members)}")
