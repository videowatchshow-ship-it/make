#!/usr/bin/env python3
# VPS 설치: systemd 유닛 2개 + nginx 프록시 location (chamgyo server block)
import glob, re, subprocess

UNITS = {
    '/etc/systemd/system/chulmok-collector.service': """[Unit]
Description=chulmok collector
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/chulmok/collector.py
User=www-data
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
""",
    '/etc/systemd/system/chulmok-selapi.service': """[Unit]
Description=chulmok room-select api
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/chulmok/selapi.py
User=www-data
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
""",
}
for p, c in UNITS.items():
    open(p, 'w').write(c)
    print('unit written', p)

LOC = r"""
    # 원본(캄보디아빈)과 동일한 루트 경로: /CAW_1.php /CAH_1.php /CAH_2.php /CAH_3.php /write.php /select.php
    location ~ ^/(CAW_[1-4]|CAH_[1-3]|SNW_1)\.php$ {
        rewrite ^/([A-Z]+_[0-9])\.php$ /photo/$1.html last;
    }
    location = /write.php  { return 302 /photo/admin.html$is_args$args; }
    location = /select.php { return 302 /photo/select.html$is_args$args; }
    location = /login.php  { return 302 /photo/login.html$is_args$args; }
    location ~ ^/photo[23]?/(api_selected_room|write_select_room|api_settings|write_up|login_check)\.php$ {
        proxy_pass http://127.0.0.1:4002;
        proxy_set_header Host $host;
        client_max_body_size 64m;
    }
    location ~ ^/photo[23]?/data/.*\.json$ {
        add_header Cache-Control "no-store";
        try_files $uri =404;
    }
"""
files = []
for f in glob.glob('/etc/nginx/sites-enabled/*') + glob.glob('/etc/nginx/conf.d/*.conf'):
    try:
        if 'chamgyo' in open(f).read():
            files.append(f)
    except Exception:
        pass
print('nginx files:', files)
for f in files:
    s = open(f).read()
    if 'write_select_room' in s and 'api_settings' not in s:
        # v1 블록 제거 후 재삽입
        s = re.sub(r'\n\s*location ~ \^/photo\[23\]\?/\(api_selected_room\|write_select_room\)\\\.php\$ \{[^}]*\}\n\s*location ~ \^/photo\[23\]\?/data/\.\*\\\.json\$ \{[^}]*\}\n', '\n', s)
    if 'api_settings' in s:
        print('already patched', f)
        continue
    s2 = re.sub(r'(server\s*\{)', lambda m: m.group(1) + LOC, s, count=1)
    open(f, 'w').write(s2)
    print('patched', f)
r = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
print(r.stderr)
