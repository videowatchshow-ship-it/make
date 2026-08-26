#!/usr/bin/env python3
"""파서 오탐 · 중복 강제 삭제 (final)"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

# 1. 07-25 오전 김성삼 특정 시각 파서 오탐/중복 삭제
DELETE_KEYS = {
    ("2026-07-25","10:16"),  # $8 = 991.08 파싱 오류
    ("2026-07-25","14:20"),  # $460 = 690000 원화→달러 오탐
    ("2026-07-25","14:21"),  # $95 = 455.95 파싱 오류
    ("2026-07-25","10:25"),  # 991 콩 = 10:11 신규 991 과 동일 (중복 방송)
    ("2026-07-25","11:03"),  # $1466 = 11:06 리바인 $1452 와 동일
}

before = len(ms)
ms = [m for m in ms if (m.get("date",""), m.get("start","")) not in DELETE_KEYS]
print(f"deleted: {before - len(ms)}")

# 2. 07-22 마키아벨리 세션1 (01:40 · 01:43 · 01:45 · 01:52) 조각 4건 → 1건 (누적 2000)
sess1_times = ["01:40","01:43","01:45","01:52"]
sess1_indexes = [i for i, m in enumerate(ms)
                 if m.get("date")=="2026-07-22" and m.get("start") in sess1_times
                 and m.get("name")=="마키아벨리"]
if len(sess1_indexes) >= 2:
    keep = sess1_indexes[0]
    ms[keep]["deposit"] = "2000"
    ms[keep]["start"]   = "01:40"
    ms[keep]["note"]    = "마키아벨리 세션1 · 4조각 통합 (500+500+500+500 = 2000콩) [tg:성천지]"
    for j in sorted(sess1_indexes[1:], reverse=True):
        del ms[j]
    print(f"세션1 4조각 → 1건 통합 ($2000)")

# 3. 마키아벨리 이름 통일
for m in ms:
    if m.get("name") in ("마키아밸리","마키아벨","마키"):
        m["name"] = "마키아벨리"

ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"] = ms
d["saved_at"] = "2026-07-31 03:50:00"
d["saved_by"] = "nuke-bad"

tmp = p + ".nb.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

print(f"\nafter: {len(ms)}")

# 회원별 최종 합계 재검산
by_in = defaultdict(float)
by_out = defaultdict(float)
for m in ms:
    dep = float(m.get("deposit") or 0)
    if m.get("type") == "환전": by_out[m.get("name","")] += dep
    else: by_in[m.get("name","")] += dep

print("\n===== 최종 회원별 합계 =====")
for n in sorted(set(list(by_in.keys())+list(by_out.keys())), key=lambda x:-(by_in[x]+by_out[x])):
    print(f"  {n:12}  IN ${by_in[n]:>8,.0f}  OUT ${by_out[n]:>8,.0f}  차액 ${by_in[n]-by_out[n]:+8,.0f}")
