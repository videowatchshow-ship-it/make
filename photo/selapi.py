#!/usr/bin/env python3
# 방 선택 API — 127.0.0.1:4002
#   GET  /photo/api_selected_room.php?ch=XX   → {"room_id": "sc_101"}
#   POST /photo/write_select_room.php  {ch, room_id}
import json, os, re, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATA = '/var/www/sites/chamgyo/public/photo/data'
SAFE = re.compile(r'^[A-Za-z0-9_-]{1,32}$')

def sel_path(ch):
    return os.path.join(DATA, f'sel_{ch}.json')

class H(BaseHTTPRequestHandler):
    server_version = 'selapi/1'
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if not u.path.endswith('api_selected_room.php'):
            return self._json(404, {'error': 'not found'})
        q = urllib.parse.parse_qs(u.query)
        ch = (q.get('ch') or ['01'])[0]
        if not SAFE.match(ch):
            return self._json(400, {'error': 'bad ch'})
        try:
            with open(sel_path(ch)) as f:
                return self._json(200, json.load(f))
        except Exception:
            return self._json(200, {'room_id': None})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not u.path.endswith('write_select_room.php'):
            return self._json(404, {'error': 'not found'})
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n).decode('utf-8', 'replace') if n else ''
        ctype = self.headers.get('Content-Type', '')
        try:
            if 'json' in ctype:
                body = json.loads(raw or '{}')
            else:
                body = {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}
        except Exception:
            body = {}
        ch = str(body.get('ch') or '01')
        room_id = str(body.get('room_id') or '')
        if not SAFE.match(ch) or not SAFE.match(room_id):
            return self._json(400, {'ok': False, 'error': 'bad input'})
        tmp = sel_path(ch) + '.tmp'
        with open(tmp, 'w') as f:
            json.dump({'room_id': room_id, 'ch': ch}, f)
        os.replace(tmp, sel_path(ch))
        return self._json(200, {'ok': True, 'room_id': room_id, 'ch': ch})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, *a):
        pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 4002), H).serve_forever()
