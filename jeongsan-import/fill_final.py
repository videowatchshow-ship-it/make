#!/usr/bin/env python3
"""사용자 확정 금액 반영:
- 07-25 19:12 마키아벨리 리바인 $1000
- 07-25 20:08 마키아벨리 리바인 $1000
- 07-25 20:36/37 마키아벨리 리바인 $2000
- 07-25 12:21 김성삼 리바인 $1457 (예정→실체)
"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])

FILL = {
    ("2026-07-25","19:12"): {"deposit":"1000","type":"테더","result":"Lose","name":"마키아벨리",
                              "note":"리바인 $1000 세션3 [사용자 확정]"},
    ("2026-07-25","20:08"): {"deposit":"1000","type":"테더","result":"Lose","name":"마키아벨리",
                              "note":"리바인 $1000 세션3 [사용자 확정]"},
    ("2026-07-25","20:36"): {"deposit":"2000","type":"테더","result":"Lose","name":"마키아벨리",
                              "note":"리바인 $2000 세션3 [사용자 확정]"},
    ("2026-07-25","20:37"): {"deposit":"2000","type":"테더","result":"Lose","name":"마키아벨리",
                              "note":"리바인 $2000 세션3 [사용자 확정]"},
    ("2026-07-25","12:21"): {"deposit":"1457","type":"캐쉬","result":"Lose","name":"김성삼",
                              "phone":"801103","account":"신한 110345905228",
                              "note":"리바인 $1457 [사용자 확정]"},
}

updated = 0
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if k in FILL:
        for key, val in FILL[k].items():
            m[key] = val
        updated += 1
        print(f"  update {k[0]} {k[1]} → {FILL[k]}")

# 최종 dedup — 같은 (date, start, name, type) 는 하나만
from collections import defaultdict
groups = defaultdict(list)
for i, m in enumerate(ms):
    k = (m.get("date",""), m.get("start",""), m.get("name",""), m.get("type",""))
    groups[k].append(i)
delete = set()
for k, idxs in groups.items():
    if len(idxs) < 2: continue
    idxs_sorted = sorted(idxs, key=lambda i: (
        0 if ms[i].get("deposit","").strip() else 1,
        -len(ms[i].get("note","")),
        i
    ))
    keep = idxs_sorted[0]
    for j in idxs_sorted[1:]:
        delete.add(j)
        print(f"  dedup {k}: delete [{j}]")
ms = [m for i, m in enumerate(ms) if i not in delete]

ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"]  = ms
d["saved_at"] = "2026-07-31 03:10:00"
d["saved_by"] = "user-confirmed-fills"

tmp = p + ".uf.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

print(f"\nupdated: {updated}, dedup deleted: {len(delete)}, total: {len(ms)}")

# 남은 미상
remaining = [m for m in ms if m.get("name") in ("미상","성명미상")]
print(f"\n남은 미상: {len(remaining)}")
for r in remaining:
    print(f"  {r.get('date')} {r.get('start')} ${r.get('deposit')} {r.get('note','')[:50]}")
