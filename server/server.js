/**
 * 센트빔 CENTBEAM — Relay API (server part)
 * 역할: destinations(대상 목록) CRUD + 헬스체크. 실제 미디어 fan-out은 MediaMTX가
 *       publish 이벤트에서 fanout.sh를 호출해 처리한다. (docs/ARCHITECTURE.md 참고)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
app.disable('x-powered-by');   // 불필요 노출 헤더 제거 (OWASP Node.js Security)
// Apache 리버스프록시 뒤에서 실제 클라이언트 IP를 X-Forwarded-For 로 신뢰 (레이트리밋이
// 모든 클라이언트를 127.0.0.1 로 묶어버리는 문제 방지). loopback 프록시 1홉만 신뢰.
app.set('trust proxy', 'loopback');
// 씬 동기화만 큰 바디 허용(이미지 dataURL 포함 가능) — 전역 64kb 파서보다 먼저 등록해야
// 이 경로가 2mb 한도로 파싱되고, 이후 전역 파서는 이미 파싱된 바디를 건너뜀(body-parser 동작)
app.use('/api/scenes', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '64kb' }));

// 보안 응답 헤더 (OWASP Secure Headers) — 의존성 없이 최소 적용
app.use((_, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 레이트리밋 (OWASP API4:2023 브루트포스 방지) — 인메모리 슬라이딩 윈도우, IP당 분당 60회
const RL = new Map();
app.use((req, res, next) => {
  // MediaMTX 외부인증 콜백은 HLS 세그먼트마다 호출되므로 레이트리밋 제외(로컬 전용 경로)
  if (req.path === '/api/mediamtx/auth') return next();
  const now = Date.now(), win = 60000, max = Number(process.env.RATE_MAX || 60);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const arr = (RL.get(ip) || []).filter(t => now - t < win);
  arr.push(now); RL.set(ip, arr);
  if (arr.length > max) return res.status(429).json({ error: 'rate limited' });
  next();
});
// 오래된 항목 주기적 정리 (메모리 누수 방지)
setInterval(() => { const now = Date.now(); for (const [ip, arr] of RL) { const f = arr.filter(t => now - t < 60000); if (f.length) RL.set(ip, f); else RL.delete(ip); } }, 120000).unref?.();

const DEST = process.env.DEST_FILE || path.join(__dirname, 'data', 'destinations.json');
const load = () => { try { return JSON.parse(fs.readFileSync(DEST, 'utf8')); } catch (_) { return {}; } };
const save = (o) => fs.writeFileSync(DEST, JSON.stringify(o, null, 2));

// 경로탐색 방지 (입력검증) — 아바타 이름 화이트리스트
const AVATAR_RE = /^[a-z0-9_-]{1,40}$/i;
// rtmpUrl 검증: rtmp(s)/srt 스킴만, 파일/HTTP/내부주소 차단 (SSRF·파일덮어쓰기 방지) — 로그인과 무관한 입력검증이라 유지
function validRtmp(u) {
  u = String(u || '');
  if (!/^(rtmps?|srt):\/\//i.test(u)) return false;
  try { const h = new URL(u).hostname.toLowerCase();
    if (h === 'localhost' || h === '::1' || /^(127\.|10\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  } catch (_) { return false; }
  return true;
}

app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// ─────────────────────────────────────────────────────────────────────────────
// 로그인 세션 (구글 연동 로그인 의무화) — 프리즘 방식: 한 번 로그인하면 사실상 안 풀림.
//   · 세션 180일 + 사용할 때마다 자동 연장(rolling) → 직접 로그아웃 전엔 유지
//   · 토큰: crypto.randomBytes(32) — 추측 불가(OWASP Session Management)
//   · 게이트는 구글 OAuth 시크릿이 설정된 환경에서만 강제(개발/테스트 환경은 개방 모드로
//     동작하고 경고만 출력 — 로그인 자체가 불가능한 환경을 잠그면 아무도 못 쓰므로)
// ─────────────────────────────────────────────────────────────────────────────
const SESS_FILE = process.env.SESS_FILE || path.join(__dirname, 'data', 'sessions.json');
const SESS_TTL = 180 * 24 * 3600 * 1000;   // 180일(rolling — me/API 호출 때마다 연장)
const loadSessions = () => { try { return JSON.parse(fs.readFileSync(SESS_FILE, 'utf8')); } catch (_) { return {}; } };
const saveSessions = (s) => { try { fs.mkdirSync(path.dirname(SESS_FILE), { recursive: true }); fs.writeFileSync(SESS_FILE, JSON.stringify(s), { mode: 0o600 }); } catch (_) {} };
function createSession(email, name) {
  const token = 'cbs_' + crypto.randomBytes(32).toString('hex');
  const s = loadSessions();
  // 만료 세션 청소
  const now = Date.now();
  for (const k of Object.keys(s)) if (s[k].expires < now) delete s[k];
  s[token] = { email, name, created: now, expires: now + SESS_TTL };
  saveSessions(s);
  return token;
}
function checkSession(req) {
  const h = String(req.get('authorization') || '');
  const token = h.startsWith('Bearer cbs_') ? h.slice(7) : String(req.query.s || '');   // ?s= : sendBeacon(헤더 불가) 전용
  if (!token.startsWith('cbs_')) return null;
  const s = loadSessions(); const sess = s[token];
  if (!sess || sess.expires < Date.now()) return null;
  sess.expires = Date.now() + SESS_TTL;   // rolling 연장 — 쓰는 동안은 절대 안 풀림
  saveSessions(s);
  return sess;
}
const authEnforced = () => { const c = oauthCreds('google'); return !!(c && c.client_id && c.client_secret); };
app.use(['/api/avatars', '/api/destinations', '/api/scenes'], (req, res, next) => {
  if (!authEnforced()) return next();   // 개발 환경(시크릿 없음): 개방 — 프로덕션에선 항상 강제됨
  const sess = checkSession(req);
  if (!sess) return res.status(401).json({ error: 'login_required' });
  req.user = sess;
  next();
});
app.get('/api/auth/me', (req, res) => {
  if (!authEnforced()) return res.json({ open: true });   // 게이트 비활성 환경 표시
  const sess = checkSession(req);
  if (!sess) return res.status(401).json({ error: 'login_required' });
  res.json({ email: sess.email, name: sess.name });
});
app.post('/api/auth/logout', (req, res) => {
  const h = String(req.get('authorization') || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = loadSessions(); if (s[token]) { delete s[token]; saveSessions(s); }
  res.json({ ok: true });
});

app.get('/api/avatars', (_, res) => {
  const d = load();
  res.json(Object.keys(d).map(name => ({ name, count: (d[name] || []).length })));
});

app.get('/api/destinations', (_, res) => res.json(load()));
app.get('/api/destinations/:avatar', (req, res) => {
  if (!AVATAR_RE.test(req.params.avatar)) return res.status(400).json({ error: 'bad_avatar' });
  res.json(load()[req.params.avatar] || []);
});

// 대상 객체 검증+정규화 — POST(단건 추가)/PUT(통짜 치환) 공용
function sanitizeDest(b) {
  b = b || {};
  const rtmpUrl = String(b.rtmpUrl || '');
  if (!validRtmp(rtmpUrl)) return null;     // SSRF/파일싱크 차단
  const streamKey = String(b.streamKey || '');
  if (streamKey.includes('/') || streamKey.includes('..')) return null;
  const dest = {
    platform: String(b.platform || 'custom').slice(0, 32),
    name: String(b.name || 'unnamed').slice(0, 80),
    rtmpUrl, streamKey,
    locked: !!b.locked,
  };
  if (b.enabled === false) dest.enabled = false;
  if (b.bitrate && Number(b.bitrate) > 0) dest.bitrate = Number(b.bitrate);      // kbps
  if (b.resolution && /^\d{2,4}x\d{2,4}$/.test(b.resolution)) dest.resolution = b.resolution;  // WxH
  if (b.preset && /^(ultrafast|superfast|veryfast|faster|fast|medium|slow|slower|veryslow)$/.test(b.preset)) dest.preset = b.preset;
  if (b.gop != null && Number(b.gop) >= 1 && Number(b.gop) <= 10) dest.gop = Number(b.gop);       // 키프레임 간격(초)
  if (b.rateControl === 'cbr' || b.rateControl === 'vbr') dest.rateControl = b.rateControl;        // 레이트 컨트롤
  if (b.bframes != null && Number.isInteger(Number(b.bframes)) && Number(b.bframes) >= 0 && Number(b.bframes) <= 3) dest.bframes = Number(b.bframes);
  // fullUrl:true — 페이스북 Live Video API 처럼 rtmpUrl 자체가 이미 완전한 1회성 URL이라
  // streamKey 를 따로 붙이면 안 되는 대상(fanout.sh 가 이 플래그로 분기)
  if (b.fullUrl === true) dest.fullUrl = true;
  if (b.title) dest.title = String(b.title).slice(0, 100);
  if (b.desc) dest.desc = String(b.desc).slice(0, 500);
  return dest;
}

// 대상 추가 { platform, name, rtmpUrl, streamKey, bitrate?, resolution?, enabled? }
app.post('/api/destinations/:avatar', (req, res) => {
  if (!AVATAR_RE.test(req.params.avatar)) return res.status(400).json({ error: 'bad_avatar' });
  const dest = sanitizeDest(req.body);
  if (!dest) return res.status(400).json({ error: 'bad_rtmpUrl_or_streamKey' });
  const d = load();
  const list = (d[req.params.avatar] ||= []);
  if (list.length >= 20) return res.status(429).json({ error: 'too_many_destinations' });   // 쿼터(DoS 방지)
  list.push(dest);
  save(d);
  res.json({ ok: true, index: list.length - 1 });
});

// 대상 목록 통짜 치환 — 브라우저(localStorage)와 서버(destinations.json)를 한 번에 맞춤.
// 프론트는 지금까지 대상 추가를 localStorage 에만 저장하고 서버엔 전달하지 않아, 실제
// fan-out(fanout.sh)이 참조하는 destinations.json 이 항상 비어있던 문제(방송은 릴레이
// 서버까지만 연결되고 유튜브 등으로는 안 나감)를 이 엔드포인트로 해소한다.
app.put('/api/destinations/:avatar', (req, res) => {
  if (!AVATAR_RE.test(req.params.avatar)) return res.status(400).json({ error: 'bad_avatar' });
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'bad_body' });
  if (body.length > 20) return res.status(429).json({ error: 'too_many_destinations' });   // 쿼터(DoS 방지)
  const list = [];
  for (const b of body) {
    const dest = sanitizeDest(b);
    if (!dest) return res.status(400).json({ error: 'bad_rtmpUrl_or_streamKey' });
    list.push(dest);
  }
  const d = load(); d[req.params.avatar] = list; save(d);
  res.json({ ok: true, count: list.length });
});

// ── 씬 클라우드 동기화 (체크리스트 224) — 브라우저 localStorage에만 있던 씬(레이아웃)을
//    서버에도 저장해 기기를 바꿔도 이어서 사용. 미디어 스트림(카메라/화면)은 직렬화 불가라
//    클라이언트 sceneData()가 이미 제외함. 용량 상한 2MB(이미지 dataURL 포함 가능성). ──
const SCENES = process.env.SCENES_FILE || path.join(path.dirname(DEST), 'scenes.json');
const loadScenesFile = () => { try { return JSON.parse(fs.readFileSync(SCENES, 'utf8')); } catch (_) { return {}; } };
app.get('/api/scenes/:avatar', (req, res) => {
  if (!AVATAR_RE.test(req.params.avatar)) return res.status(400).json({ error: 'bad_avatar' });
  res.json(loadScenesFile()[req.params.avatar] || null);
});
function putScene(req, res) {
  if (!AVATAR_RE.test(req.params.avatar)) return res.status(400).json({ error: 'bad_avatar' });
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_body' });
  const raw = JSON.stringify(body);
  if (raw.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'too_large' });
  const all = loadScenesFile(); all[req.params.avatar] = body;
  fs.writeFileSync(SCENES, JSON.stringify(all));
  res.json({ ok: true, bytes: raw.length });
}
app.put('/api/scenes/:avatar', putScene);
app.post('/api/scenes/:avatar', putScene);   // sendBeacon(언로드 직전 저장)은 POST만 가능

// 대상 삭제 (locked 는 삭제 불가)
app.delete('/api/destinations/:avatar/:idx', (req, res) => {
  const d = load(); const list = d[req.params.avatar] || [];
  const t = list[Number(req.params.idx)];
  if (!t) return res.status(404).json({ error: 'not found' });
  if (t.locked) return res.status(403).json({ error: 'locked' });
  list.splice(Number(req.params.idx), 1);
  save(d);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Google/YouTube OAuth (RFC 9700: Authorization Code + PKCE) — 294/295/298/335/337
//   Client Secret 은 서버 파일에만: /var/secrets/oauth-nodetube.json
//   포맷: {"client_id":"...","client_secret":"..."}  또는 Google 다운로드형 {"web":{...}}
//   프론트는 code_challenge 로 redirect → 여기서 code→token 교환(secret 사용) →
//   YouTube liveStreams 로 스트림키 조회 → 프론트엔 최소 정보만 반환(토큰은 서버 보관).
// ─────────────────────────────────────────────────────────────────────────────
// 플랫폼별 시크릿 파일 (google=YouTube, twitch, facebook). 포맷 {"client_id","client_secret"} 또는 Google형 {"web":{...}}
const OAUTH_FILES = {
  google: process.env.OAUTH_SECRET_FILE || '/var/secrets/oauth-nodetube.json',
  twitch: process.env.TWITCH_SECRET_FILE || '/var/secrets/oauth-twitch.json',
  facebook: process.env.FB_SECRET_FILE || '/var/secrets/oauth-facebook.json',
};
const TOKEN_URL = {
  google: 'https://oauth2.googleapis.com/token',
  twitch: 'https://id.twitch.tv/oauth2/token',
  facebook: 'https://graph.facebook.com/v19.0/oauth/access_token',
};
function oauthCreds(provider) {
  const f = OAUTH_FILES[provider]; if (!f) return null;
  try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); return c.web || c.installed || c; }
  catch (_) { return null; }
}
app.get('/api/oauth/config', (req, res) => {
  const p = String(req.query.provider || 'google');
  const c = oauthCreds(p);
  res.json({ provider: p, configured: !!(c && c.client_id), clientId: (c && c.client_id) || '' });
});
app.post('/api/oauth/exchange', async (req, res) => {
  let { code, redirectUri, codeVerifier, provider = 'google', title, description } = req.body || {};
  // google-login: 의무 로그인 게이트용 — 구글 앱은 같은 걸 쓰되 스코프만 openid/email(클라이언트에서
  // 지정), 유튜브 API 호출은 전부 건너뛰고 세션 토큰만 발급
  const loginOnly = provider === 'google-login';
  if (loginOnly) provider = 'google';
  const c = oauthCreds(provider);
  if (!c || !c.client_id || !c.client_secret) return res.status(500).json({ error: 'oauth_not_configured' });
  if (!code || !redirectUri || !TOKEN_URL[provider]) return res.status(400).json({ error: 'missing_code' });
  // 방송 제목/설명(있을 때만) — 각 플랫폼 공식 API로 실제 반영 시도(316: 없으면 조용히 스킵)
  const bTitle = String(title || '').trim().slice(0, 100);
  const bDesc = String(description || '').trim().slice(0, 5000);
  try {
    const form = new URLSearchParams({
      code, client_id: c.client_id, client_secret: c.client_secret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    if (codeVerifier) form.set('code_verifier', codeVerifier);   // PKCE (google/twitch)
    const tok = await fetch(TOKEN_URL[provider], {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    }).then(r => r.json());
    if (tok.error) return res.status(400).json({ error: tok.error, detail: tok.error_description || tok.message });
    let email = null, name = null, sub = 'user', streamKey = null, streamTitle = null;
    let rtmpUrl = null, broadcastCreated = false, broadcastError = null;
    if (provider === 'google') {
      const who = await fetch('https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json()).catch(() => ({}));
      email = who.email || null; name = who.name || null; sub = who.sub || 'user';
      if (loginOnly) {   // 로그인 전용: 유튜브 API 안 건드리고 세션만 발급
        const session = email ? createSession(email, name) : null;
        if (!session) return res.status(400).json({ error: 'no_email_in_token' });
        return res.json({ ok: true, provider: 'google-login', email, name, session });
      }
      let streamId = null;
      try {
        const ls = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=cdn,snippet&mine=true',
          { headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json());
        const item = ls.items && ls.items[0];
        if (item && item.cdn && item.cdn.ingestionInfo) {
          streamKey = item.cdn.ingestionInfo.streamName; streamTitle = item.snippet && item.snippet.title; streamId = item.id;
        }
      } catch (_) {}
      // liveBroadcasts.insert(제목/설명) + bind(기존 영구 스트림) — 공식문서: YouTube Live Streaming API
      // (developers.google.com/youtube/v3/live/docs/liveBroadcasts/insert · .../bind). 쓰기 권한(youtube
      // 또는 youtube.force-ssl) 없으면 insert 자체가 403 나므로 실패해도 스트림키 발급 자체는 그대로 진행.
      if (bTitle && streamId) {
        try {
          const bc = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails', {
            method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              snippet: { title: bTitle, description: bDesc, scheduledStartTime: new Date().toISOString() },
              status: { privacyStatus: 'unlisted' },
              contentDetails: { enableAutoStart: true, enableAutoStop: true },
            }),
          }).then(r => r.json());
          if (bc.id) {
            const bind = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${bc.id}&streamId=${streamId}&part=id`,
              { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json());
            if (bind.id) broadcastCreated = true; else broadcastError = 'bind_실패';
          } else broadcastError = (bc.error && bc.error.message) || 'broadcast_생성_실패(쓰기 권한 필요)';
        } catch (e) { broadcastError = String(e && e.message || e); }
      }
    } else if (provider === 'twitch') {
      const who = await fetch('https://api.twitch.tv/helix/users',
        { headers: { Authorization: 'Bearer ' + tok.access_token, 'Client-Id': c.client_id } }).then(r => r.json()).catch(() => ({}));
      const u = who.data && who.data[0];
      if (u) { name = u.display_name; email = u.email || null; sub = u.id || 'user';
        try {
          const k = await fetch('https://api.twitch.tv/helix/streams/key?broadcaster_id=' + u.id,
            { headers: { Authorization: 'Bearer ' + tok.access_token, 'Client-Id': c.client_id } }).then(r => r.json());
          streamKey = k.data && k.data[0] && k.data[0].stream_key;
        } catch (_) {}
        // 채널 타이틀 변경 — 공식문서: Twitch Helix "Modify Channel Information" (PATCH /helix/channels,
        // scope channel:manage:broadcast). 트위치는 방송별 제목이 아니라 채널 자체의 제목이라 설명(description)
        // 항목은 없음 — 지원 안 되는 걸 있는 척 만들지 않음.
        if (bTitle) {
          try {
            const patch = await fetch('https://api.twitch.tv/helix/channels?broadcaster_id=' + u.id, {
              method: 'PATCH',
              headers: { Authorization: 'Bearer ' + tok.access_token, 'Client-Id': c.client_id, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: bTitle }),
            });
            broadcastCreated = patch.ok;
            if (!patch.ok) broadcastError = '제목_변경_실패_' + patch.status + '(쓰기 권한 필요)';
          } catch (e) { broadcastError = String(e && e.message || e); }
        }
      }
    } else if (provider === 'facebook') {
      const who = await fetch('https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=' + encodeURIComponent(tok.access_token))
        .then(r => r.json()).catch(() => ({}));
      name = who.name || null; email = who.email || null; sub = who.id || 'user';
      // 라이브 비디오 생성 — 공식문서: Meta Live Video API (POST /me/live_videos, status=LIVE_NOW,
      // scope publish_video). 페이스북은 유튜브/트위치처럼 고정 스트림키가 아니라, 방송마다 새로
      // 발급되는 하나의 완전한 URL(쿼리스트링 포함)을 그대로 써야 함 — rtmpUrl/streamKey 로 못 쪼갬.
      if (bTitle) {
        try {
          const form2 = new URLSearchParams({ title: bTitle, description: bDesc, status: 'LIVE_NOW', access_token: tok.access_token });
          const lv = await fetch('https://graph.facebook.com/v19.0/me/live_videos', { method: 'POST', body: form2 }).then(r => r.json());
          if (lv.secure_stream_url) { rtmpUrl = lv.secure_stream_url; broadcastCreated = true; }
          else broadcastError = (lv.error && lv.error.message) || 'live_video_생성_실패(쓰기 권한/앱 심사 필요)';
        } catch (e) { broadcastError = String(e && e.message || e); }
      }
    }
    // refresh_token 은 서버에만 보관(자격증명 안전 저장 298). 프론트엔 최소 정보만.
    if (tok.refresh_token) {
      try { const dir = path.join(__dirname, 'data'); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, provider + '-token-' + sub + '.json'),
          JSON.stringify({ refresh_token: tok.refresh_token, email }), { mode: 0o600 }); } catch (_) {}
    }
    // 구글 연동(유튜브 연결)도 로그인으로 인정 — 세션 발급(게이트 통과)
    const session = (provider === 'google' && email) ? createSession(email, name) : undefined;
    res.json({ ok: true, provider, email, name, streamKey, streamTitle, rtmpUrl, broadcastCreated, broadcastError, session });
  } catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

app.get('/', (_, res) => res.type('text').send('CENTBEAM relay up'));
const PORT = process.env.PORT || 3000;
// loopback 바인딩: 오직 Apache 리버스프록시만 접근 (직접 인터넷 노출 방지 — OWASP API8)
const server = app.listen(PORT, '127.0.0.1', () => console.log('web :' + PORT));
// slowloris/느린연결 방어 (RFC 9110 · OWASP DoS)
server.headersTimeout = 20000;
server.requestTimeout = 30000;
