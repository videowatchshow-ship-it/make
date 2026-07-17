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

// 대상 추가 { platform, name, rtmpUrl, streamKey }
app.post('/api/destinations/:avatar', (req, res) => {
  const d = load(); const b = req.body || {};
  const dest = {
    platform: b.platform || 'custom',
    name: String(b.name || 'unnamed'),
    rtmpUrl: String(b.rtmpUrl || ''),
    streamKey: String(b.streamKey || ''),
    locked: !!b.locked,
  };
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

app.get('/', (_, res) => res.type('text').send('CENTBEAM relay up'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('web :' + PORT));
