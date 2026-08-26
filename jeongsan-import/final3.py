#!/usr/bin/env python3
"""미상 정리 3차:
- 금액 없는 미상 행(바인/리바인/역송 텍스트만, deposit 빈값) 삭제 — 합계 0 노이즈 제거
- 테더 표기 미상 → 마키아벨리 (규칙: 테더는 모두 마키아벨리)
"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

def is_misang(m):
    return m.get("name") in ("미상", "성명미상", "")

def dep(m):
    try:
        return float(m.get("deposit") or 0)
    except ValueError:
        return 0

# 1) 테더 미상 → 마키아벨리
for m in ms:
    if is_misang(m) and "테더" in (m.get("note") or ""):
        print(f"  테더→마키아벨리: {m.get('date')} {m.get('start')} ${m.get('deposit')}")
        m["name"] = "마키아벨리"

# 2) 금액 없는 미상 삭제 (2026-06-22 원본 제외)
before_d = len(ms)
kept = []
for m in ms:
    if is_misang(m) and dep(m) == 0 and m.get("date") != "2026-06-22":
        print(f"  삭제(빈금액): {m.get('date')} {m.get('start')} note={(m.get('note') or '')[:40]}")
        continue
    kept.append(m)
ms = kept
print(f"deleted: {before_d - len(ms)}")

ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"]  = ms
d["saved_at"] = "2026-07-31 04:30:00"
d["saved_by"] = "final3"

tmp = p + ".f3.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

by_in = defaultdict(float); by_out = defaultdict(float)
for m in ms:
    if m.get("type") == "환전": by_out[m.get("name","")] += dep(m)
    else: by_in[m.get("name","")] += dep(m)
print(f"\nafter: {len(ms)}")
misang_left = [m for m in ms if is_misang(m)]
print(f"미상 남음: {len(misang_left)}")
for m in misang_left:
    print(f"  {m.get('date')} {m.get('start')} ${m.get('deposit')} {(m.get('note') or '')[:40]}")
jul_in = sum(dep(m) for m in ms if m.get('date','').startswith('2026-07') and m.get('type')!='환전')
jul_out = sum(dep(m) for m in ms if m.get('date','').startswith('2026-07') and m.get('type')=='환전')
print(f"\n7월 IN  ${jul_in:>10,.0f}")
print(f"7월 OUT ${jul_out:>10,.0f}")
print(f"마키아벨리 IN ${by_in['마키아벨리']:,.0f} OUT ${by_out['마키아벨리']:,.0f}")
