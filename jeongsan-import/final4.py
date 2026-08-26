#!/usr/bin/env python3
"""7월 잔여 미상 4건 이름 확정 (대화 문맥 기준, 6월 원본은 건드리지 않음):
- 보물섬 07-25 13:29 $666, 14:25 $455 → 김성삼 (김성삼 세션 연속)
- 성천지 07-26 03:11 $829 역송, 07-27 04:07 $2000 바인 → 마키아벨리 (마키아벨리 세션)
"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])

ASSIGN = {
    ("2026-07-25","13:29"): "김성삼",
    ("2026-07-25","14:25"): "김성삼",
    ("2026-07-26","03:11"): "마키아벨리",
    ("2026-07-27","04:07"): "마키아벨리",
}
n = 0
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if k in ASSIGN and m.get("name") in ("미상","성명미상",""):
        m["name"] = ASSIGN[k]
        n += 1
        print(f"  {k[0]} {k[1]} ${m.get('deposit')} → {ASSIGN[k]}")
print(f"assigned: {n}")

d["members"]  = ms
d["saved_at"] = "2026-07-31 04:50:00"
d["saved_by"] = "final4"

tmp = p + ".f4.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

def dep(m):
    try: return float(m.get("deposit") or 0)
    except ValueError: return 0
misang = [m for m in ms if m.get("name") in ("미상","성명미상","")]
print(f"미상 남음: {len(misang)}")
for m in misang: print(f"  {m.get('date')} {m.get('start')} ${m.get('deposit')}")
for nm in ("김성삼","마키아벨리"):
    i = sum(dep(m) for m in ms if m.get("name")==nm and m.get("type")!="환전")
    o = sum(dep(m) for m in ms if m.get("name")==nm and m.get("type")=="환전")
    print(f"{nm}: IN ${i:,.0f} OUT ${o:,.0f}")
