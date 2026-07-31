#!/usr/bin/env python3
"""강시원 07-20 20:58 항목 · deposit 70 → 3000 수정"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
n = 0
for m in ms:
    if m.get("name") == "강시원" and m.get("date") == "2026-07-20":
        old = m.get("deposit")
        m["deposit"] = "3000"
        m["type"]    = "캐쉬"
        m["note"]    = "캐쉬 바인 $3000 (기존 손님 · 대표 상의) [수정]"
        print(f"강시원 07-20 {m.get('start')}: deposit {old} → 3000, type 캐쉬")
        n += 1

if n == 0:
    print("WARN: 강시원 07-20 항목 없음")
d["saved_at"] = "2026-07-31 02:20:00"
d["saved_by"] = "fix-강시원"

tmp = p + ".ksw.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)
print(f"updated: {n} entries")
