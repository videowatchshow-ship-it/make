#!/usr/bin/env python3
"""같은 (date, start) 여러 entry → best (deposit+실명) 하나만 남김"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

# 07-08 이전 데이터는 100% 정확 · 절대 안 건드림
def is_old(m):
    return m.get("date","") <= "2026-07-08"

groups = defaultdict(list)
for i, m in enumerate(ms):
    if is_old(m): continue
    k = (m.get("date",""), m.get("start",""))
    groups[k].append(i)

deleted = set()
for k, idxs in groups.items():
    if len(idxs) < 2: continue
    # 점수 낮은 것 우선 keep
    def score(i):
        m = ms[i]
        has_dep  = 0 if (m.get("deposit","").strip() and m.get("deposit") != "0") else 1
        is_ms    = 1 if m.get("name") in ("미상","성명미상","") else 0
        note_len = -len(m.get("note",""))
        return (has_dep, is_ms, note_len, i)
    idxs_sorted = sorted(idxs, key=score)
    keep = idxs_sorted[0]
    print(f"  [{k[0]} {k[1]}] {len(idxs)}건: keep [{keep}] {ms[keep].get('name')} ${ms[keep].get('deposit')} {ms[keep].get('type')}")
    for j in idxs_sorted[1:]:
        # 삭제 대상 note 는 keep 에 병합 (정보 보존)
        extra = (ms[j].get("note") or "").strip()
        if extra and extra not in (ms[keep].get("note") or ""):
            ms[keep]["note"] = (ms[keep].get("note") or "") + " · " + extra
        deleted.add(j)
        print(f"    DEL [{j}] {ms[j].get('name')} ${ms[j].get('deposit')} {ms[j].get('type')}")

ms = [m for i, m in enumerate(ms) if i not in deleted]

# 남은 미상 재배정 확장 (07-25 세션3 마키아벨리 · 07-26/27 마키아벨리 · 27-03:29 박진숙)
FIX_NAME = {
    ("2026-07-25","15:58"): "마키아벨리",
    ("2026-07-25","16:27"): "마키아벨리",
    ("2026-07-25","16:47"): "마키아벨리",
    ("2026-07-25","18:43"): "마키아벨리",
    ("2026-07-25","21:39"): "마키아벨리",
    ("2026-07-26","01:42"): "마키아벨리",
    ("2026-07-26","02:36"): "마키아벨리",
    ("2026-07-26","03:11"): "박진숙",
    ("2026-07-27","03:29"): "박진숙",
    ("2026-07-27","04:07"): "마키아벨리",
    ("2026-07-31","03:41"): "마키아벨리",
    # 07-25 김성삼 시퀀스 미상
    ("2026-07-25","13:29"): "김성삼",
    ("2026-07-25","13:43"): "김성삼",
    ("2026-07-25","14:20"): "김성삼",
    ("2026-07-25","14:21"): "김성삼",
    ("2026-07-25","14:25"): "김성삼",
}
KNOWN_ACCT = {
    "김성삼":  ("801103","신한 110345905228",""),
    "박진숙":  ("","우체국 01182502189670",""),
    "마키아벨리":("","",""),
}
reassigned = 0
for m in ms:
    if m.get("name") not in ("미상","성명미상",""): continue
    k = (m.get("date",""), m.get("start",""))
    if k in FIX_NAME:
        new_name = FIX_NAME[k]
        m["name"] = new_name
        if new_name in KNOWN_ACCT:
            ph, ac, nk = KNOWN_ACCT[new_name]
            if ph and not m.get("phone"): m["phone"] = ph
            if ac and not m.get("account"): m["account"] = ac
            if nk and not m.get("nick"): m["nick"] = nk
        reassigned += 1
        print(f"  → {k[0]} {k[1]} 미상 → {new_name}")

# CANCELLED entry 삭제 (07-31 04:04)
before_cancel = len(ms)
ms = [m for m in ms if "CANCELLED" not in (m.get("note") or "")]
print(f"cancelled entries removed: {before_cancel - len(ms)}")

ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"] = ms
d["saved_at"] = "2026-07-31 03:20:00"
d["saved_by"] = "dedup-by-time"

tmp = p + ".dt.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

print(f"\ndeleted (dedup): {len(deleted)}")
print(f"reassigned:      {reassigned}")
print(f"final total:     {len(ms)}")

remaining = [m for m in ms if m.get("name") in ("미상","성명미상","")]
print(f"\n최종 남은 미상: {len(remaining)}")
for r in remaining:
    print(f"  {r.get('date')} {r.get('start')} ${r.get('deposit')} {r.get('type')} {(r.get('note') or '')[:60]}")
