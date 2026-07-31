#!/usr/bin/env python3
"""최종 강력 정리 (100건 → 실제 유효):
1. (date, start) 기준 중복 완전 제거 · deposit 있는 것 우선
2. deposit blank 이고 note가 "예정/예정입니다/예정→캔슬/CANCELLED" 계열 → 삭제
3. 남은 미상 → 문맥으로 재배정 (마키아벨리/김성삼/박진숙)
4. 닉네임 강제 확정 (채창호=쁘롱, 강시원=여신, 다른 것 nick 다 지움 만약 mismatch)
"""
import json, os
from collections import defaultdict

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])
print(f"before: {len(ms)}")

# 07-08 이전은 절대 안 건드림
def is_old(m):
    return m.get("date","") <= "2026-07-08"

# ===== 1. CANCELLED · 예정만 있는 것 삭제 =====
before_c = len(ms)
def is_junk(m):
    if is_old(m): return False
    note = (m.get("note") or "").lower()
    dep  = (m.get("deposit") or "").strip()
    # CANCELLED
    if "cancelled" in note or "캔슬" in note: return True
    # 완전히 blank + 예정 만 있는 것 (실체 바인 아님)
    if not dep and m.get("date")=="2026-07-22" and m.get("start")=="00:59":  # 참교육 신규 예정 메시지
        return True
    return False
ms = [m for m in ms if not is_junk(m)]
print(f"cancelled/junk removed: {before_c - len(ms)}")

# ===== 2. (date, start) 중복 제거 =====
groups = defaultdict(list)
for i, m in enumerate(ms):
    if is_old(m): continue
    k = (m.get("date",""), m.get("start",""))
    groups[k].append(i)
deleted = set()
for k, idxs in groups.items():
    if len(idxs) < 2: continue
    def score(i):
        m = ms[i]
        has_dep  = 0 if (m.get("deposit","").strip() and m.get("deposit") != "0") else 1
        is_ms    = 1 if m.get("name") in ("미상","성명미상","") else 0
        note_len = -len(m.get("note",""))
        return (has_dep, is_ms, note_len, i)
    idxs_sorted = sorted(idxs, key=score)
    keep = idxs_sorted[0]
    for j in idxs_sorted[1:]:
        extra = (ms[j].get("note") or "").strip()
        if extra and extra not in (ms[keep].get("note") or ""):
            ms[keep]["note"] = (ms[keep].get("note") or "") + " · " + extra
        # 삭제 대상이 이름 있고 keep이 미상 이면 이름 승계
        if ms[keep].get("name") in ("미상","성명미상","") and ms[j].get("name") not in ("미상","성명미상",""):
            ms[keep]["name"] = ms[j]["name"]
        deleted.add(j)
        print(f"  DUP {k}: keep [{keep}]<{ms[keep].get('name')}> DEL [{j}]<{ms[j].get('name')} ${ms[j].get('deposit')}>")

ms = [m for i, m in enumerate(ms) if i not in deleted]
print(f"dedup deleted: {len(deleted)}")

# ===== 3. 남은 미상 재배정 (문맥) =====
FIX = {
    ("2026-07-22","14:44"): "마키아벨리",
    ("2026-07-22","18:39"): "서정남",
    ("2026-07-22","18:47"): "김진호",
    ("2026-07-25","10:58"): "김성삼",
    ("2026-07-25","12:21"): "김성삼",
    ("2026-07-25","13:25"): "김성삼",
    ("2026-07-25","13:43"): "김성삼",
    ("2026-07-25","15:22"): "마키아벨리",
    ("2026-07-25","15:27"): "마키아벨리",
    ("2026-07-25","15:58"): "마키아벨리",
    ("2026-07-25","16:27"): "마키아벨리",
    ("2026-07-25","16:47"): "마키아벨리",
    ("2026-07-25","18:43"): "마키아벨리",
    ("2026-07-25","19:12"): "마키아벨리",
    ("2026-07-25","20:08"): "마키아벨리",
    ("2026-07-25","20:37"): "마키아벨리",
    ("2026-07-26","01:42"): "마키아벨리",
    ("2026-07-26","02:36"): "마키아벨리",
    ("2026-07-27","02:29"): "박진숙",
    ("2026-07-27","03:29"): "박진숙",
}
KNOWN_ACCT = {
    "채창호":   ("01024488553","케이뱅크 100127355415","쁘롱"),
    "이유신":   ("","하나은행 박태영",""),
    "최동학":   ("01064743313","카카오뱅크 3333212353835",""),
    "김성삼":   ("801103","신한 110345905228",""),
    "박진숙":   ("","우체국 01182502189670",""),
    "강시원":   ("","","여신"),
    "서정남":   ("","김진호 농협",""),
    "마키아벨리":("","",""),
}
reassigned = 0
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if m.get("name") in ("미상","성명미상","") and k in FIX:
        m["name"] = FIX[k]
        reassigned += 1
    if m.get("name") in ("마키아밸리","마키아벨","마키"):
        m["name"] = "마키아벨리"

# ===== 4. 닉네임 강제 확정 =====
nick_fixed = 0
for m in ms:
    if m.get("name") in KNOWN_ACCT:
        ph, ac, nk = KNOWN_ACCT[m["name"]]
        if nk:
            if m.get("nick") != nk:
                m["nick"] = nk; nick_fixed += 1
        else:
            # 다른 잘못된 닉 (용 등) 제거
            if m.get("nick") and m.get("nick") not in ("여신","쁘롱",""):
                m["nick"] = ""; nick_fixed += 1
        if ph and not m.get("phone"): m["phone"] = ph
        if ac and not m.get("account"): m["account"] = ac
print(f"nick fixed: {nick_fixed}")

# 정렬
ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"]  = ms
d["saved_at"] = "2026-07-31 03:40:00"
d["saved_by"] = "final-cleanup"

tmp = p + ".fc.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

print(f"\ndeleted (dedup): {len(deleted)}")
print(f"reassigned: {reassigned}")
print(f"final total: {len(ms)}")

# 남은 미상 / blank
remaining = [m for m in ms if m.get("name") in ("미상","성명미상","")]
blanks    = [m for m in ms if not (m.get("deposit","").strip()) and not is_old(m)]
print(f"\n남은 미상 (원본만 유지): {len(remaining)}")
for r in remaining:
    print(f"  {r.get('date')} {r.get('start')} {r.get('type')} ${r.get('deposit')} {(r.get('note') or '')[:50]}")
print(f"\n남은 blank deposit: {len(blanks)}")
for r in blanks:
    print(f"  {r.get('date')} {r.get('start')} {r.get('name')} {r.get('type')} {(r.get('note') or '')[:50]}")
