#!/usr/bin/env python3
"""테더 미상 → 마키아벨리 일괄 rename
규칙:
- date >= 2026-07-09 (신규 import 만 대상)
- type == 테더
- name in ("미상", "성명미상")
- note 에 '니우니우' 없음 (니우니우 방은 유지)
"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
n = 0
for m in ms:
    if m.get("date","") < "2026-07-09":  continue
    if m.get("type") != "테더":            continue
    if m.get("name") not in ("미상","성명미상"): continue
    if "니우니우" in (m.get("note") or ""):  continue
    m["name"] = "마키아벨리"
    m["note"] = (m.get("note") or "") + " · [테더→마키아벨리 자동배정]"
    n += 1
    print(f"  → {m['date']} {m['start']} deposit={m.get('deposit')}")
print(f"renamed: {n}")

d["saved_at"] = "2026-07-31 02:25:00"
d["saved_by"] = "teder-to-maki"
tmp = p + ".mk.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)
