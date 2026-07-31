#!/usr/bin/env python3
"""통합 최종 정리 (멱등 — 몇 번을 돌려도 같은 결과):
1) 확정 삭제: 강시원 중복(07-20 21:00), 마키아벨리 이중집계(07-22 01:04),
   파서 오탐(07-25 14:20 $460, 14:21 $95), 캔슬(07-31 04:04)
2) 금액 없는 7월 미상 행 삭제 (06-22 원본 제외)
3) 테더 표기 미상 → 마키아벨리
4) 이름 확정: 07-25 13:29·14:25 → 김성삼 / 07-26 03:11·07-27 04:07 → 마키아벨리 /
   07-08 00:34 성명미상 → 니우니우
"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

def is_misang(m): return m.get("name") in ("미상","성명미상","")
def dep(m):
    try: return float(m.get("deposit") or 0)
    except ValueError: return 0

DELETE = {
    ("2026-07-20","21:00"),
    ("2026-07-22","01:04"),
    ("2026-07-25","14:20"),
    ("2026-07-25","14:21"),
    ("2026-07-31","04:04"),
    ("2026-07-25","13:29"),  # $666 파서 오탐 (₩1,000,000 환산 오류 — 실존 안 함)
}
ASSIGN = {
    ("2026-07-25","14:25"): "김성삼",
    ("2026-07-26","03:11"): "박진숙",
    ("2026-07-27","04:07"): "마키아벨리",
    ("2026-07-08","00:34"): "니우니우",
}

kept = []
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if k in DELETE:
        print(f"  삭제(확정): {k[0]} {k[1]} ${m.get('deposit')}")
        continue
    if dep(m) == 0 and m.get("date","").startswith("2026-07"):
        print(f"  삭제(빈금액): {k[0]} {k[1]} {m.get('name')}")
        continue
    if is_misang(m) and "테더" in (m.get("note") or ""):
        print(f"  테더→마키아벨리: {k[0]} {k[1]} ${m.get('deposit')}")
        m["name"] = "마키아벨리"
    if k in ASSIGN and m.get("name") != ASSIGN[k]:
        print(f"  이름확정: {k[0]} {k[1]} ${m.get('deposit')} {m.get('name')} → {ASSIGN[k]}")
        m["name"] = ASSIGN[k]
    kept.append(m)
ms = kept

# 전역 중복 제거: (날짜, 시각, 이름, 금액, 종류) 동일 행은 1개만 유지 (note 긴 것 우선)
seen = {}
for m in ms:
    key = (m.get("date",""), m.get("start",""), m.get("name",""), str(m.get("deposit","")), m.get("type",""))
    if key in seen:
        if len(m.get("note") or "") > len(seen[key].get("note") or ""):
            seen[key] = m
    else:
        seen[key] = m
if len(seen) != len(ms):
    print(f"중복 제거: {len(ms) - len(seen)}건")
ms = list(seen.values())
print(f"after-clean: {len(ms)}")

ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"]  = ms
d["saved_at"] = "2026-07-31 05:10:00"
d["saved_by"] = "final5"

tmp = p + ".f5.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

misang = [m for m in ms if is_misang(m)]
print(f"미상 남음: {len(misang)}")
for m in misang: print(f"  {m.get('date')} {m.get('start')} ${m.get('deposit')}")
by_in = defaultdict(float); by_out = defaultdict(float)
for m in ms:
    (by_out if m.get("type")=="환전" else by_in)[m.get("name","")] += dep(m)
for nm in ("김성삼","마키아벨리","강시원","니우니우"):
    print(f"{nm}: IN ${by_in[nm]:,.0f} OUT ${by_out[nm]:,.0f}")
jul_in  = sum(dep(m) for m in ms if m.get('date','').startswith('2026-07') and m.get('type')!='환전')
jul_out = sum(dep(m) for m in ms if m.get('date','').startswith('2026-07') and m.get('type')=='환전')
print(f"7월 IN ${jul_in:,.0f} / OUT ${jul_out:,.0f}")
