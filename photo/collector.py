#!/usr/bin/env python3
# 출목표 크롤러 — 성천지(xjh) + 싱지(xtd6688) → data/room_<key>.json
import json, os, sys, time, urllib.request, urllib.error

DATA = '/var/www/sites/chamgyo/public/photo/data'
TABLES = os.path.join(DATA, 'tables.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

def get(url, headers, timeout=4):
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
    # 원본 클라이언트 regex /^[BPTbpt](\d{2,4})([A-Z]*)$/ : [승자][庄对][闲对][특수: 62=럭키6 2장, 63=럭키6 3장, 7=용7, 8=판다8]
    nums = [x.upper() for x in nums if isinstance(x, str) and len(x) >= 3 and x[0] in 'PBTpbt' and x[1:].rstrip('ABCDEFGHIJKLMNOPQRSTUVWXYZ').isdigit()]
    return {'id': f'sj_{rid}', 'venue': 'sj', 'label': room.get('name') or str(rid), 'room_id': rid,
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
        # xtd result: 1 庄 2 闲 3 和 4 幸运6(庄 6점)  ext: bit1 庄对 bit2 闲对  → 싱지와 같은 문자열 형식으로 통일
        letter = 'P' if r == 2 else ('T' if r == 3 else 'B')
        nums.append(letter + ('1' if e & 1 else '0') + ('1' if e & 2 else '0') + ('6' if r == 4 else ''))
    return {'id': f'xtd_{label}', 'venue': 'xtd', 'label': room.get('name') or str(label), 'room_id': label,
            'apiId': api_id, 'kind': room.get('kind', ''), 'ver': len(nums), 'nums': nums,
            't': int(time.time()), 'server_time': now(), 'source': 'xtd6688'}

CRAWLERS = {'sc': crawl_xjh, 'xtd': crawl_xtd}

CYCLE = 1.0          # 초 — 결과→표시 1초 이내 요구: 전 테이블 병렬 크롤, 1초 주기
_last_sig = {}

def crawl_one(venue, room):
    key = f"{venue['key']}_{room['id']}"
    fn = CRAWLERS.get(venue.get('source'))
    if not fn:
        return key, None
    try:
        out = fn(room)
        if out:
            out['venue_name'] = venue.get('name', '')
            sig = ''.join(out.get('nums') or [])
            # 변경 시에만 파일 갱신(디스크 I/O 최소화) — 단 60초마다 하트비트 기록
            if _last_sig.get(key, (None, 0))[0] != sig or time.time() - _last_sig.get(key, (None, 0))[1] > 60:
                write(key, out); _last_sig[key] = (sig, time.time())
            return key, True
        return key, False
    except Exception as ex:
        return key, ex

def run_once(pool=None):
    with open(TABLES) as f:
        tables = json.load(f)
    jobs = [(v, r) for v in tables.get('venues', []) if CRAWLERS.get(v.get('source')) for r in v.get('rooms', [])]
    ok = fail = 0; errs = []
    if pool is None:
        results = [crawl_one(v, r) for v, r in jobs]
    else:
        results = list(pool.map(lambda vr: crawl_one(*vr), jobs))
    for key, res in results:
        if res is True: ok += 1
        else:
            fail += 1
            if isinstance(res, Exception): errs.append(f'{key}: {res}')
    return ok, fail, errs

if __name__ == '__main__':
    from concurrent.futures import ThreadPoolExecutor
    if len(sys.argv) > 1 and sys.argv[1] == 'once':
        with ThreadPoolExecutor(24) as pool:
            ok, fail, errs = run_once(pool)
        print(f'{now()} ok={ok} fail={fail}'); [print(e, file=sys.stderr) for e in errs[:10]]
    else:
        pool = ThreadPoolExecutor(24); n = 0
        while True:
            t0 = time.time()
            try:
                ok, fail, errs = run_once(pool)
                n += 1
                if n % 60 == 1:
                    print(f'{now()} ok={ok} fail={fail} cycle={time.time()-t0:.2f}s', flush=True)
                    for e in errs[:5]: print(e, file=sys.stderr, flush=True)
            except Exception as ex:
                print(f'loop error: {ex}', file=sys.stderr, flush=True)
            time.sleep(max(0.05, CYCLE - (time.time() - t0)))
