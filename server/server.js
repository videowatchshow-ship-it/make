/**
 * 센트빔 CENTBEAM — Relay API (server part)
 * 역할: destinations(대상 목록) CRUD + 헬스체크. 실제 미디어 fan-out은 MediaMTX가
 *       publish 이벤트에서 fanout.sh를 호출해 처리한다. (docs/ARCHITECTURE.md 참고)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
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
const load = () => JSON.parse(fs.readFileSync(DEST, 'utf8'));
const save = (o) => fs.writeFileSync(DEST, JSON.stringify(o, null, 2));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/avatars', (_, res) => {
  const d = load();
  res.json(Object.keys(d).map(name => ({ name, count: d[name].length })));
});

app.get('/api/destinations', (_, res) => res.json(load()));
app.get('/api/destinations/:avatar', (req, res) =>
  res.json(load()[req.params.avatar] || []));

// 대상 추가 { platform, name, rtmpUrl, streamKey, bitrate?, resolution?, enabled? }
app.post('/api/destinations/:avatar', (req, res) => {
  const d = load(); const b = req.body || {};
  const dest = {
    platform: b.platform || 'custom',
    name: String(b.name || 'unnamed'),
    rtmpUrl: String(b.rtmpUrl || ''),
    streamKey: String(b.streamKey || ''),
    locked: !!b.locked,
  };
  // 대상별 프로파일 (203/204): 지정 시 fanout.sh 가 재인코딩, 없으면 -c copy
  if (b.enabled === false) dest.enabled = false;
  if (b.bitrate && Number(b.bitrate) > 0) dest.bitrate = Number(b.bitrate);      // kbps
  if (b.resolution && /^\d{2,4}x\d{2,4}$/.test(b.resolution)) dest.resolution = b.resolution;  // WxH
  (d[req.params.avatar] ||= []).push(dest);
  save(d);
  res.json({ ok: true, index: d[req.params.avatar].length - 1 });
});

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
const OAUTH_FILE = process.env.OAUTH_SECRET_FILE || '/var/secrets/oauth-nodetube.json';
function oauthCreds() {
  try { const c = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); return c.web || c.installed || c; }
  catch (_) { return null; }
}
app.get('/api/oauth/config', (_, res) => {
  const c = oauthCreds();
  res.json({ configured: !!(c && c.client_id), clientId: (c && c.client_id) || '' });
});
app.post('/api/oauth/exchange', async (req, res) => {
  const c = oauthCreds();
  if (!c || !c.client_id || !c.client_secret) return res.status(500).json({ error: 'oauth_not_configured' });
  const { code, redirectUri, codeVerifier } = req.body || {};
  if (!code || !redirectUri) return res.status(400).json({ error: 'missing_code' });
  try {
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: c.client_id, client_secret: c.client_secret,
        redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier || '',
      }),
    }).then(r => r.json());
    if (tok.error) return res.status(400).json({ error: tok.error, detail: tok.error_description });
    const who = await fetch('https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json()).catch(() => ({}));
    let streamKey = null, streamTitle = null;
    try {
      const ls = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=cdn,snippet&mine=true',
        { headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json());
      const item = ls.items && ls.items[0];
      if (item && item.cdn && item.cdn.ingestionInfo) {
        streamKey = item.cdn.ingestionInfo.streamName;
        streamTitle = item.snippet && item.snippet.title;
      }
    } catch (_) {}
    // refresh_token 은 서버에만 보관(자격증명 안전 저장 298). 프론트엔 최소 정보만.
    if (tok.refresh_token) {
      try { const dir = path.join(__dirname, 'data'); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'yt-token-' + (who.sub || 'user') + '.json'),
          JSON.stringify({ refresh_token: tok.refresh_token, email: who.email }), { mode: 0o600 }); } catch (_) {}
    }
    res.json({ ok: true, email: who.email || null, name: who.name || null, streamKey, streamTitle });
  } catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

app.get('/', (_, res) => res.type('text').send('CENTBEAM relay up'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('web :' + PORT));
