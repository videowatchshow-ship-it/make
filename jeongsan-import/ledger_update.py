#!/usr/bin/env python3
"""ledger 개편: 회사 차입금 삭제 · cent/jay/tak/ha/점프대표 개인 차용 5명 추가"""
import json, os, sys

p = "/var/www/sites/chamgyo/settlement-data/data.json"
d = json.load(open(p, encoding="utf-8"))
old = d.get("ledger", [])
print("ledger before:", len(old))

kept = [r for r in old if r.get("item") != "회사 차입금"]
for u in ["cent", "jay", "tak", "ha", "점프대표"]:
    kept.append({
        "date":"2026-07-31",
        "item": u + " 차용",
        "sign":"+",
        "amount":"",
        "note":"개인 차용 · 금액 사이트에서 입력"
    })

d["ledger"]   = kept
d["saved_at"] = "2026-07-31 02:15:00"
d["saved_by"] = "ledger-restructure"

tmp = p + ".ldg.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=4)
os.rename(tmp, p)

print("ledger after:", len(d["ledger"]))
for r in d["ledger"]:
    print(" ", r)
