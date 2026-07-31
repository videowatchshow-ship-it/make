#!/usr/bin/env python3
"""강시원 07-20 중복 제거 · 20:58 하나만 남김"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])

# 강시원 07-20 항목 찾기
ksw_indexes = [i for i, m in enumerate(ms) if m.get("name")=="강시원" and m.get("date")=="2026-07-20"]
print(f"강시원 07-20 항목 {len(ksw_indexes)}건 발견")
for i in ksw_indexes:
    print(f"  [{i}] {ms[i].get('start')} deposit=${ms[i].get('deposit')} nick={ms[i].get('nick')} note={ms[i].get('note','')[:50]}")

# 첫 번째 (제일 이른 시각) 만 남기고 나머지 삭제
if len(ksw_indexes) > 1:
    # 시각 순 정렬 → 첫 번째 keep
    ksw_sorted = sorted(ksw_indexes, key=lambda i: ms[i].get("start",""))
    keep = ksw_sorted[0]
    delete = ksw_sorted[1:]
    print(f"\n  KEEP: [{keep}] {ms[keep].get('start')}")
    for i in delete:
        print(f"  DEL : [{i}] {ms[i].get('start')}")
    # 뒤에서 부터 삭제 (인덱스 밀림 방지)
    for i in sorted(delete, reverse=True):
        del ms[i]
    # keep 항목 확정 값 세팅
    m = ms[keep] if keep < len(ms) else None
    # keep 인덱스가 삭제 후 어디로 갔는지 다시 찾기
    for m in ms:
        if m.get("name")=="강시원" and m.get("date")=="2026-07-20":
            m["deposit"] = "3000"
            m["type"]    = "캐쉬"
            m["nick"]    = "여신"
            m["start"]   = "20:58"
            m["note"]    = "캐쉬 바인 $3000 · 여신 (기존 손님 · 대표 상의 · 이기면 익일 재게임) [사용자 확정]"

d["members"]  = ms
d["saved_at"] = "2026-07-31 02:50:00"
d["saved_by"] = "dedup-ksw"

tmp = p + ".dksw.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)
print(f"\ntotal members after dedup: {len(ms)}")
