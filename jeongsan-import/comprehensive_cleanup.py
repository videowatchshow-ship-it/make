#!/usr/bin/env python3
"""종합 정리:
1. 같은 (date, start, type) 중복 → best (deposit 채워진 것) 만 남기고 제거
2. 미상 항목 → 문맥 근거 실명 재배정
"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

# ===== 1) 중복 dedup =====
# 그룹핑 (date, start, type) 로 · 이 조합 이 같은 것 은 중복
groups = defaultdict(list)
for i, m in enumerate(ms):
    k = (m.get("date",""), m.get("start",""), m.get("type",""))
    groups[k].append(i)

deleted = set()
for k, idxs in groups.items():
    if len(idxs) < 2: continue
    # deposit 있는 것 우선 · 없으면 첫 번째 keep
    idxs_sorted = sorted(idxs, key=lambda i: (
        0 if ms[i].get("deposit","").strip() else 1,   # deposit 있는 것 우선
        len(ms[i].get("note","")),                       # note 긴 것 우선
        i                                                # 그다음 인덱스
    ))
    keep_idx = idxs_sorted[0]
    # 나머지 note 를 keep 에 병합
    for j in idxs_sorted[1:]:
        extra_note = (ms[j].get("note") or "").strip()
        if extra_note and extra_note not in (ms[keep_idx].get("note") or ""):
            ms[keep_idx]["note"] = (ms[keep_idx].get("note") or "") + " · " + extra_note
        deleted.add(j)
    print(f"  DUP {k}: keep [{keep_idx}] delete {sorted(idxs_sorted[1:])}")

# 삭제
ms = [m for i, m in enumerate(ms) if i not in deleted]
print(f"after dedup: {len(ms)} (deleted {len(deleted)})")

# ===== 2) 미상 재배정 =====
# 문맥 근거 매핑
NAME_MAP = {
    ("2026-07-22","00:59"): "마키아벨리",  # 세션1 시작
    ("2026-07-22","01:04"): "마키아벨리",  # 세션1
    ("2026-07-25","12:21"): "김성삼",       # 김성삼 시퀀스 계속
    ("2026-07-25","13:25"): "김성삼",       # 김성삼 (환율 계산)
    ("2026-07-25","13:29"): "김성삼",       # 100만원 은행 한도
    ("2026-07-25","13:43"): "김성삼",       # 추가바인 게임진행
    ("2026-07-25","14:20"): "김성삼",       # 69만원 문자
    ("2026-07-25","14:21"): "김성삼",       # 455.95
    ("2026-07-25","21:39"): "마키아벨리",  # 세션3 마감 역송
    ("2026-07-26","02:36"): "마키아벨리",  # 세션3 후속 5000환전
    ("2026-07-27","04:07"): "마키아벨리",  # 세션4 시작
    ("2026-07-31","03:41"): "마키아벨리",  # 03:44 마키아 이어짐
}
KNOWN_ACCT = {
    "마키아벨리": ("","",""),
    "김성삼":     ("801103","신한 110345905228",""),
    "박진숙":     ("","우체국 01182502189670",""),
}

reassigned = 0
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if m.get("name") in ("미상","성명미상") and k in NAME_MAP:
        new_name = NAME_MAP[k]
        m["name"] = new_name
        if new_name in KNOWN_ACCT:
            phone, account, nick = KNOWN_ACCT[new_name]
            if phone and not m.get("phone"): m["phone"] = phone
            if account and not m.get("account"): m["account"] = account
            if nick and not m.get("nick"): m["nick"] = nick
        m["note"] = (m.get("note") or "") + " · [문맥 재배정]"
        reassigned += 1
        print(f"  → {k[0]} {k[1]} 미상 → {new_name}")

# 마키아벨리 이름 통일
for m in ms:
    if m.get("name") in ("마키아밸리","마키아벨","마키"):
        m["name"] = "마키아벨리"

# 정렬
ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))

d["members"]  = ms
d["saved_at"] = "2026-07-31 03:00:00"
d["saved_by"] = "comprehensive-cleanup"

tmp = p + ".cc.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

print(f"\ndeleted duplicates: {len(deleted)}")
print(f"reassigned 미상: {reassigned}")
print(f"final total: {len(ms)}")

# 최종 미상 남은 것
remaining_misang = [(m.get("date"), m.get("start"), m.get("deposit"), (m.get("note") or "")[:40]) for m in ms if m.get("name") in ("미상","성명미상")]
print(f"\n남은 미상: {len(remaining_misang)}")
for r in remaining_misang:
    print(f"  {r}")
