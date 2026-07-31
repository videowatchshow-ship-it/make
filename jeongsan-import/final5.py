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
    ("2026-07-22","01:04"),
    ("2026-07-25","14:20"),
    ("2026-07-25","14:21"),
    ("2026-07-31","04:04"),
    ("2026-07-25","13:29"),  # $666 파서 오탐 (₩1,000,000 환산 오류 — 실존 안 함)
    ("2026-07-17","23:53"),  # $666 동일 오탐 패턴 (₩1,000,000 환산)
    ("2026-07-27","02:33"),  # $800 — 02:36 바인 793us 와 같은 입금 이중집계
}
# 07-22 18:46 김진호 $510 — 같은 분 서정남 $500(₩765,250) 이중집계 → 김진호 행만 삭제
DELETE_NAMED = {("2026-07-22","18:46","김진호")}
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
    if (k[0], k[1], m.get("name","")) in DELETE_NAMED:
        print(f"  삭제(이중집계): {k[0]} {k[1]} {m.get('name')} ${m.get('deposit')}")
        continue
    # (빈금액 행 삭제 규칙 폐지 — 이미지로만 온 애매한 거래도 전부 표에 남긴다)
    if is_misang(m) and "테더" in (m.get("note") or ""):
        print(f"  테더→마키아벨리: {k[0]} {k[1]} ${m.get('deposit')}")
        m["name"] = "마키아벨리"
    if k in ASSIGN and m.get("name") != ASSIGN[k]:
        print(f"  이름확정: {k[0]} {k[1]} ${m.get('deposit')} {m.get('name')} → {ASSIGN[k]}")
        m["name"] = ASSIGN[k]
    kept.append(m)
ms = kept

# ---- 복원/추가: 강시원 여신 더블(2건) + 이미지로만 온 애매 거래 전부 ----
def row(date, start, name, typ, depv, result, note, nick="", phone="", account=""):
    return {"date": date, "start": start, "end": "", "nick": nick, "name": name,
            "phone": phone, "account": account, "type": typ, "deposit": depv,
            "result": result, "rolling": "", "note": note}
RESTORE = [
    row("2026-07-20","21:00","강시원","캐쉬","3000","Lose","여신 더블 2건째 (20:58과 별개 확정)"),
    row("2026-07-08","06:45","최동학","캐쉬","","Lose","신규 바인 [이미지 2장·금액미상] [tg:보물섬]",
        phone="01064743313", account="카카오뱅크 3333212353835"),
    row("2026-07-22","00:59","마키아벨리","테더","","Lose","바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-25","12:21","김성삼","캐쉬","","Lose","리바인 [이미지·금액미상] [tg:보물섬]"),
    row("2026-07-25","13:25","김성삼","캐쉬","","Lose","바인 [이미지·금액미상] [tg:보물섬]"),
    row("2026-07-25","13:43","김성삼","캐쉬","","Lose","바인 [이미지·금액미상] [tg:보물섬]"),
    row("2026-07-25","15:27","마키아벨리","캐쉬","","Lose","바인 [이미지확인·금액미상] [tg:성천지]"),
    row("2026-07-25","15:58","마키아벨리","캐쉬","","Lose","바인 [이미지확인·금액미상] [tg:성천지]"),
    row("2026-07-25","16:27","마키아벨리","캐쉬","","Lose","바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-25","16:47","마키아벨리","캐쉬","","Lose","바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-25","18:43","마키아벨리","테더","","Lose","바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-25","19:12","마키아벨리","캐쉬","","Lose","리바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-25","20:08","마키아벨리","캐쉬","","Lose","리바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-25","20:37","마키아벨리","캐쉬","","Lose","리바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-26","01:42","마키아벨리","테더","","Lose","바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-26","02:36","마키아벨리","환전","","Win","역송 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-27","02:29","최명진","캐쉬","","Lose","바인 [이미지·금액미상] [tg:성천지]"),
    row("2026-07-27","03:29","마키아벨리","캐쉬","","Lose","리바인 [이미지·금액미상] [tg:성천지]"),
]
existing = {(m.get("date",""), m.get("start",""), m.get("name","")) for m in ms}
added = 0
for r in RESTORE:
    kk = (r["date"], r["start"], r["name"])
    if kk not in existing:
        ms.append(r); existing.add(kk); added += 1
        print(f"  복원: {kk[0]} {kk[1]} {kk[2]} ${r['deposit'] or '미상'}")
print(f"복원 추가: {added}건")

# 7월 중복 제거: (날짜, 시각, 이름, 금액, 종류) 동일 행은 1개만 유지 (note 긴 것 우선)
# 6월 데이터는 확정본 — 어떤 규칙도 건드리지 않는다
seen = {}
_june = 0
for m in ms:
    if not m.get("date","").startswith("2026-07"):
        _june += 1
        seen[("JUNE", _june)] = m
        continue
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

ms = d["members"]  # (정렬 반영본)

# ---- 자금 장부: 개인 차용 5명 × 10칸 (제이·센트·탁·데니(퇴사)·하바드) ----
# 금액은 공란 (사이트에서 직접 입력). AI 비용·회사 차입금·구명단 차용 행 제거.
# 이미 새 명단 행이 있으면 입력된 금액 보존, 10칸 미만이면 빈 칸으로 채움.
NAMES = ["제이", "센트", "탁", "데니(퇴사)", "하바드"]
old_ledger = d.get("ledger", [])
LEGACY = ("회사 차입금", "AI 비용", "cent 차용", "jay 차용", "tak 차용", "ha 차용", "점프대표 차용")
new_ledger = []
for nm in NAMES:
    item = f"{nm} 차용"
    keep_rows = [r for r in old_ledger if r.get("item") == item]
    keep_rows = keep_rows[:10]
    while len(keep_rows) < 10:
        keep_rows.append({"date": "", "item": item, "sign": "+", "amount": "", "note": ""})
    new_ledger.extend(keep_rows)
removed = [r for r in old_ledger if r.get("item") in LEGACY]
for r in removed:
    print(f"  장부 삭제: {r.get('date')} {r.get('item')} {r.get('sign')}{r.get('amount')}")
d["ledger"] = new_ledger
print(f"장부: {len(new_ledger)}칸 (5명 × 10)")

tmp2 = p + ".f5b.tmp"
with open(tmp2, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp2, p)

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
