#!/usr/bin/env python3
"""파서 오탐 3건 삭제:
- 07-25 10:16 $8 (991.08 파싱 오류)
- 07-25 14:20 $460 (690,000 원화→USD 추정 오탐)
- 07-25 14:21 $95 (455.95 파싱 오류)
"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

DELETE = [
    ("2026-07-25","10:16"),
    ("2026-07-25","14:20"),
    ("2026-07-25","14:21"),
]

kept = []
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if k in DELETE:
        print(f"  DEL {k[0]} {k[1]} {m.get('name')} ${m.get('deposit')} note={(m.get('note') or '')[:50]}")
    else:
        kept.append(m)

d["members"] = kept
d["saved_at"] = "2026-07-31 03:30:00"
d["saved_by"] = "delete-false"

tmp = p + ".df.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)
print(f"\nafter: {len(kept)} (deleted {len(ms) - len(kept)})")
