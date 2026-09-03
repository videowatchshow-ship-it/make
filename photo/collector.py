#!/usr/bin/env python3
# 출목표 크롤러 — 성천지(xjh) + 싱지(xtd6688) → data/room_<key>.json
import json, os, sys, time, urllib.request, urllib.error

DATA = '/var/www/sites/chamgyo/public/photo/data'
TABLES = os.path.join(DATA, 'tables.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

def get(url, headers, timeout=8):
    req = urllib.request.Request(url, headers=dict({'User-Agent': UA}, **headers))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))

def write(key, out):
    tmp = os.path.join(DATA, f'room_{key}.json.tmp')
    dst = os.path.join(DATA, f'room_{key}.json')
    with open(tmp, 'w') as f:
        json.dump(out, f, ensure_ascii=False)
    os.replace(tmp, dst)

def now():
    return time.strftime('%Y-%m-%d %H:%M:%S')

# ---------- 성천지 : xjh.liveview2024.vip ----------
XJH = 'https://xjh.liveview2024.vip'
XJH_H = {'Origin': 'https://fcj6.oqogyf.com', 'Referer': 'https://fcj6.oqogyf.com/'}

def crawl_xjh(room):
    rid = room['id']
    j = get(f'{XJH}/api/pub/get_newly_issue?room_id={rid}', XJH_H)
    d = j.get('data') or {}
    iid = d.get('id')
    if not iid:
        return None
    n = get(f'{XJH}/api/pub/get_open_nums?issue_id={iid}', XJH_H)
    nums = n.get('nums') or []
    nums = [x for x in nums if isinstance(x, str) and len(x) >= 3 and x[0] in 'PBT']
    return {'id': f'sc_{rid}', 'venue': 'sc', 'label': room.get('name') or str(rid), 'room_id': rid,
            'issue_id': iid, 'ver': d.get('version', len(nums)), 'nums': nums,
            't': int(time.time()), 'server_time': now(), 'source': 'xjh.liveview2024.vip'}

# ---------- 싱지 : api.xtd6688.com ----------
XTD_H = {'Origin': 'https://gs.xtd6688.com', 'Referer': 'https://gs.xtd6688.com/luzhu/zh/pc.html'}

def crawl_xtd(room):
    label = room['id']
    api_id = room.get('api', label)
    j = get(f'https://api.xtd6688.com/api/diantou/table/getData/gameType/3/tableId/{api_id}/xue/null', XTD_H)
    if j.get('code') != 1:
        return None
    items = j.get('data') or {}
    if not isinstance(items, dict):
        items = {}
    keys = sorted(items.keys(), key=lambda k: int(''.join(c for c in k if c.isdigit()) or 0))
    nums = []
    for k in keys:
        o = items[k]
        if not isinstance(o, dict):
            continue
        r = int(o.get('result', 0)); e = int(o.get('ext', 0))
        letter = 'P' if r == 2 else ('T' if r == 3 else 'B')
        nums.append(letter + ('1' if e & 1 else '0') + ('1' if e & 2 else '0'))
    return {'id': f'xtd_{label}', 'venue': 'xtd', 'label': room.get('name') or str(label), 'room_id': label,
            'apiId': api_id, 'kind': room.get('kind', ''), 'ver': len(nums), 'nums': nums,
            't': int(time.time()), 'server_time': now(), 'source': 'xtd6688'}

CRAWLERS = {'sc': crawl_xjh, 'xtd': crawl_xtd}

def run_once():
    with open(TABLES) as f:
        tables = json.load(f)
    ok = fail = 0
    for venue in tables.get('venues', []):
        fn = CRAWLERS.get(venue.get('source'))
        if not fn:
            continue
        for room in venue.get('rooms', []):
            key = f"{venue['key']}_{room['id']}"
            try:
                out = fn(room)
                if out:
                    out['venue_name'] = venue.get('name', '')
                    write(key, out); ok += 1
                else:
                    fail += 1
            except Exception as ex:
                fail += 1
                print(f'{key}: {ex}', file=sys.stderr)
            time.sleep(0.2)
    print(f'{now()} ok={ok} fail={fail}', flush=True)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'once':
        run_once()
    else:
        while True:
            try:
                run_once()
            except Exception as ex:
                print(f'loop error: {ex}', file=sys.stderr, flush=True)
            time.sleep(30)
