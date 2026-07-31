#!/usr/bin/env python3
"""서버 data.json 의 blank deposit 항목 · 텔레그램 실제 텍스트 로 채움
사용자 지적: '이미지만 있는 리바인이 없다 그 밑에 글이 다 있다' — 단독 숫자 파서 미비 문제.
"""
import json, os

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
ms = d.get("members", [])

# 텔레그램 실제 확인 결과 매핑 (date, start 기준)
FILL = {
    # 07-25 마키아벨리 세션 3 (성천지)
    ("2026-07-25","15:27"): {"name":"마키아벨리","type":"테더","deposit":"1000","result":"Lose","note":"마키아벨리 진행 1000 · 세션 3 [tg:성천지]"},
    ("2026-07-25","15:58"): {"name":"마키아벨리","type":"환전","deposit":"4000","result":"Win","note":"역송 4000 게임진행중 · 세션 3 [tg:성천지]"},
    ("2026-07-25","16:27"): {"name":"마키아벨리","type":"환전","deposit":"3000","result":"Win","note":"추가역송 3000 · 세션 3 [tg:성천지]"},
    ("2026-07-25","16:47"): {"name":"마키아벨리","type":"환전","deposit":"3000","result":"Win","note":"추가역송 3000 · 세션 3 [tg:성천지]"},
    ("2026-07-25","18:43"): {"name":"마키아벨리","type":"테더","deposit":"1000","result":"Lose","note":"천불 진행 · 세션 3후반 [tg:성천지]"},

    # 07-26 (성천지)
    ("2026-07-26","02:36"): {"name":"마키아벨리","type":"환전","deposit":"5000","result":"Win","note":"5000 테더 환전 [tg:성천지]"},
    ("2026-07-26","03:11"): {"name":"박진숙",  "type":"환전","deposit":"829","result":"Win","account":"우체국 01182502189670","note":"역송 ₩1,243,635 = $829 [tg:성천지]"},

    # 07-30 (성천지)
    ("2026-07-30","19:56"): {"name":"마키아벨리","type":"환전","deposit":"2500","result":"Win","note":"역송 2500 · 세션 5 [tg:성천지]"},

    # 07-31 캔슬
    ("2026-07-31","04:04"): {"deposit":"0","note":"CANCELLED · aba 신규 바인 예정→캔슬 [tg:성천지 04:05 캔슬]"},
}

# 07-25 오후 이미지 리바인 3건: 실제 금액은 이미지 스샷 · 텍스트로 확인 불가
# 이건 그대로 두거나, 사용자가 알려주면 수동 fill

updated = 0
for m in ms:
    k = (m.get("date",""), m.get("start",""))
    if k in FILL:
        f = FILL[k]
        for key, val in f.items():
            m[key] = val
        updated += 1
        print(f"  update: {k[0]} {k[1]} → deposit=${f.get('deposit','')} type={f.get('type','')} note={f.get('note','')[:60]}")

# 마키아벨리 이름 통일
for m in ms:
    if m.get("name") in ("마키아밸리","마키아벨","마키"):
        m["name"] = "마키아벨리"

# 07-25 이미지 리바인 미상 → 마키아벨리 (세션 3 연속)
SESS3_TIMES = ["19:12","20:08","20:36","20:37"]
for m in ms:
    if m.get("date")=="2026-07-25" and m.get("start") in SESS3_TIMES and m.get("name")=="미상":
        m["name"] = "마키아벨리"
        m["note"] = (m.get("note") or "") + " [세션3 마키아벨리 연속 · 실제금액은 이미지 확인]"
        print(f"  → 25-{m['start']} 미상 → 마키아벨리 (세션3)")

# 07-26 01:42 미상 테더바인 → 마키아벨리
for m in ms:
    if m.get("date")=="2026-07-26" and m.get("start")=="01:42" and m.get("name")=="미상":
        m["name"] = "마키아벨리"
        print(f"  → 26-01:42 미상 → 마키아벨리")

# 07-27 03:29 미상 리바인 → 박진숙 (앞에 02:29 박진숙 시퀀스)
for m in ms:
    if m.get("date")=="2026-07-27" and m.get("start")=="03:29" and m.get("name")=="미상":
        m["name"] = "박진숙"
        m["note"] = (m.get("note") or "") + " [박진숙 후속 리바인]"
        print(f"  → 27-03:29 미상 → 박진숙")

# 정렬
ms.sort(key=lambda x: (x.get("date",""), x.get("start","")))
d["members"]  = ms
d["saved_at"] = "2026-07-31 02:40:00"
d["saved_by"] = "fill-blanks"

tmp = p + ".fb.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)
print(f"\nupdated: {updated} entries")
print(f"total members: {len(ms)}")
