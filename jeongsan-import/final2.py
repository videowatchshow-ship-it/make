#!/usr/bin/env python3
"""완전 마감 정리:
- 강시원 21:00 삭제 (20:58 유일)
- 잔여 미상 (07-25 14:20, 14:21 파서 오탐 · 07-31 04:04 캔슬 등) 삭제
- 성명미상 → 니우니우 로 이름 부여 (07-08 00:34)
"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

# 강제 삭제 (특정 시각)
DELETE = {
    ("2026-07-20","21:00"),  # 강시원 중복
    ("2026-07-22","01:04"),  # 마키아벨리 첫바인 500 - 01:40 combined 2000에 이미 포함 (double-count)
    ("2026-07-25","14:20"),  # 미상 $460 파서 오탐 (14:25 김성삼 $455 실체)
    ("2026-07-25","14:21"),  # 미상 $95 파서 오탐
    ("2026-07-31","04:04"),  # CANCELLED
}
before_d = len(ms)
ms = [m for m in ms if (m.get("date",""), m.get("start","")) not in DELETE]
print(f"deleted: {before_d - len(ms)}")

# 07-08 00:34 성명미상 → 니우니우
for m in ms:
    if m.get("date")=="2026-07-08" and m.get("start")=="00:34" and m.get("name")=="성명미상":
        m["name"] = "니우니우"
        m["note"] = (m.get("note") or "") + " [성명미상→니우니우]"
        print(f"  → 07-08 00:34 성명미상 → 니우니우")

# 남은 모든 미상 (07-08 이후) 강제 재배정 시도
# 문맥으로 매핑 안 되는 것은 삭제
KEEP_MISANG_OLD = [("2026-06-22","")]  # 06-22 용 미상 원본만 유지
for i, m in list(enumerate(ms)):
    if m.get("name") not in ("미상","성명미상",""): continue
    if m.get("date","") <= "2026-07-08": continue  # 원본
    print(f"  잔여 미상 [{i}] {m.get('date')} {m.get('start')} ${m.get('deposit')} note={(m.get('note') or '')[:50]}")

ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"]  = ms
d["saved_at"] = "2026-07-31 04:00:00"
d["saved_by"] = "final2"

tmp = p + ".f2.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

# 최종 집계
by_in=defaultdict(float); by_out=defaultdict(float)
for m in ms:
    dep=float(m.get('deposit') or 0)
    if m.get('type')=='환전': by_out[m.get('name','')] += dep
    else: by_in[m.get('name','')] += dep
print(f"\nafter: {len(ms)}")
print("\n===== 회원별 =====")
for n in sorted(set(list(by_in.keys())+list(by_out.keys())), key=lambda x:-(by_in[x]+by_out[x])):
    print(f"  {n:12}  IN ${by_in[n]:>7,.0f}  OUT ${by_out[n]:>7,.0f}  차액 ${by_in[n]-by_out[n]:+7,.0f}")
jul_in = sum(float(m.get('deposit') or 0) for m in ms if m.get('date','').startswith('2026-07') and m.get('type')!='환전')
jul_out = sum(float(m.get('deposit') or 0) for m in ms if m.get('date','').startswith('2026-07') and m.get('type')=='환전')
print(f"\n7월 IN  ${jul_in:>10,.0f}")
print(f"7월 OUT ${jul_out:>10,.0f}")
print(f"7월 차액 ${jul_in-jul_out:+10,.0f}")
