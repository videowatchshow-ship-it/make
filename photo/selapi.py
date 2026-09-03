#!/usr/bin/env python3
# 출목표 API — 127.0.0.1:4002 (nginx 프록시)
#   GET  /photo/api_selected_room.php?ch=XX     → {"room_id": "xtd_10"}
#   POST /photo/write_select_room.php  {ch, room_id}
#   GET  /photo/api_settings.php?ch=XX          → 그림장 설정 (settings_<ch>.json)
#   POST /photo/write_up.php  (multipart)       → 그림장 설정 저장 + 배너 GIF 업로드 (관리자 인증)
#   POST /photo/login_check.php {id, passwd}    → 관리자 로그인 확인
import json, os, re, time, urllib.parse
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = '/var/www/sites/chamgyo/public/photo'
DATA = os.path.join(ROOT, 'data')
IMAGES = os.path.join(ROOT, 'images')
SAFE = re.compile(r'^[A-Za-z0-9_-]{1,32}$')
ADMIN = {'aass0707': 'aass0707'}          # 마스터 (원본 캄보디아빈 write.php 와 동일)
USER_PW = 'QWE123!@'                      # 01~20 계정 비번
DEFAULT_SETTINGS = {
    'write_check01': 'Y', 'write_text01': '', 'write_check02': 'Y', 'write_text02': '',
    'write_check03': 'Y', 'write_text03': '', 'write_check04': 'Y', 'write_text04': '',
    'kakao': 'N', 'ktime': 'N', 'url': 'en', 'table_num': '', 'table2_num': '',
    'banner_height': '', 'banner_width': '', 'updated': 0,
}

def sel_path(ch):  return os.path.join(DATA, f'sel_{ch}.json')
def set_path(ch):  return os.path.join(DATA, f'settings_{ch}.json')

def atomic_write(path, data: bytes):
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f: f.write(data)
    os.replace(tmp, path)

def load_settings(ch):
    s = dict(DEFAULT_SETTINGS)
    try:
        with open(set_path(ch)) as f: s.update(json.load(f))
    except Exception: pass
    return s

def auth_ok(uid, pw, ch):
    if uid in ADMIN and ADMIN[uid] == pw: return True          # 마스터: 모든 ch
    return uid == ch and pw == USER_PW and SAFE.match(uid)      # 일반: 자기 채널만

class H(BaseHTTPRequestHandler):
    server_version = 'selapi/2'
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n) if n else b''
        ctype = self.headers.get('Content-Type', '')
        if 'json' in ctype:
            try: return json.loads(raw.decode('utf-8', 'replace') or '{}'), {}
            except Exception: return {}, {}
        if 'multipart' in ctype:
            # cgi 모듈 없이 multipart 파싱 (email 파서)
            msg = BytesParser(policy=default).parsebytes(
                b'Content-Type: ' + ctype.encode() + b'\r\nMIME-Version: 1.0\r\n\r\n' + raw)
            fields, files = {}, {}
            for part in msg.iter_parts():
                name = part.get_param('name', header='content-disposition')
                if not name: continue
                fn = part.get_filename()
                payload = part.get_payload(decode=True) or b''
                if fn: files[name] = (fn, payload)
                else: fields[name] = payload.decode('utf-8', 'replace')
            return fields, files
        return {k: v[0] for k, v in urllib.parse.parse_qs(raw.decode('utf-8', 'replace')).items()}, {}

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        ch = (q.get('ch') or ['01'])[0]
        if not SAFE.match(ch): return self._json(400, {'error': 'bad ch'})
        if u.path.endswith('api_selected_room.php'):
            try:
                with open(sel_path(ch)) as f: return self._json(200, json.load(f))
            except Exception: return self._json(200, {'room_id': None})
        if u.path.endswith('api_settings.php'):
            return self._json(200, load_settings(ch))
        return self._json(404, {'error': 'not found'})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        fields, files = self._body()
        if u.path.endswith('write_select_room.php'):
            ch = str(fields.get('ch') or '01'); room_id = str(fields.get('room_id') or '')
            if not SAFE.match(ch) or not SAFE.match(room_id): return self._json(400, {'ok': False, 'error': 'bad input'})
            atomic_write(sel_path(ch), json.dumps({'room_id': room_id, 'ch': ch}).encode())
            return self._json(200, {'ok': True, 'room_id': room_id, 'ch': ch})

        if u.path.endswith('login_check.php'):
            uid = str(fields.get('id') or ''); pw = str(fields.get('passwd') or fields.get('pw') or '')
            if uid in ADMIN and ADMIN[uid] == pw: return self._json(200, {'ok': True, 'role': 'master', 'id': uid})
            if SAFE.match(uid) and pw == USER_PW:  return self._json(200, {'ok': True, 'role': 'user', 'id': uid})
            return self._json(401, {'ok': False, 'error': '아이디 또는 비밀번호가 올바르지 않습니다.'})

        if u.path.endswith('write_up.php'):
            ch = str(fields.get('ch') or '01')
            uid = str(fields.get('admin_id') or ''); pw = str(fields.get('admin_pw') or '')
            if not SAFE.match(ch): return self._json(400, {'ok': False, 'error': 'bad ch'})
            if not auth_ok(uid, pw, ch): return self._json(401, {'ok': False, 'error': '인증 실패'})
            s = load_settings(ch)
            for i in ('01', '02', '03', '04'):
                s['write_check' + i] = 'Y' if fields.get('write_check' + i) == 'Y' else 'N'
                s['write_text' + i] = str(fields.get('write_text' + i) or '')[:200]
            s['kakao'] = 'Y' if fields.get('kakao') == 'Y' else 'N'
            s['ktime'] = 'Y' if fields.get('ktime') == 'Y' else 'N'
            s['url'] = 'zh' if fields.get('url') == 'zh' else 'en'
            s['table_num'] = re.sub(r'\D', '', str(fields.get('table_num') or ''))[:2]
            s['table2_num'] = re.sub(r'\D', '', str(fields.get('table2_num') or ''))[:2]
            d = os.path.join(IMAGES, 'ch', ch); os.makedirs(d, exist_ok=True)
            ts = int(time.time())
            for fkey, name, skey in (('banner_img_height', 'Live_height_kakao.gif', 'banner_height'),
                                     ('banner_img_width', 'Live_width_01_banner_kakao.gif', 'banner_width')):
                if fkey in files and files[fkey][1]:
                    blob = files[fkey][1]
                    if not blob.startswith(b'GIF8'): return self._json(400, {'ok': False, 'error': f'{name}: GIF 파일만 가능'})
                    if len(blob) > 8 * 1024 * 1024: return self._json(400, {'ok': False, 'error': f'{name}: 8MB 초과'})
                    atomic_write(os.path.join(d, name), blob)
                    s[skey] = f'images/ch/{ch}/{name}?v={ts}'
            s['updated'] = ts
            atomic_write(set_path(ch), json.dumps(s, ensure_ascii=False).encode())
            return self._json(200, {'ok': True, 'settings': s})

        return self._json(404, {'error': 'not found'})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, *a): pass

if __name__ == '__main__':
    os.makedirs(DATA, exist_ok=True)
    ThreadingHTTPServer(('127.0.0.1', 4002), H).serve_forever()
