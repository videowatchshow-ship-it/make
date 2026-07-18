/**
 * 센트빔 CENTBEAM — 인증 · 결제 · 엔타이틀먼트 (server-is-truth)
 * 구현 근거(추측 없음, 공식 출처):
 *  - Google Sign-In: GIS `response.credential`(ID토큰) → google-auth-library
 *    OAuth2Client.verifyIdToken({idToken,audience}) (developers.google.com/identity/gsi/web/guides/verify-google-id-token)
 *  - NOWPayments: POST /v1/invoice (헤더 x-api-key) → invoice_url,
 *    IPN 서명 = HMAC-SHA512(정렬본문 JSON, IPN Secret) vs header x-nowpayments-sig,
 *    payment_status==='finished' 에서만 승인 (nowpayments.zendesk.com IPN 문서 / 공식 WooCommerce 플러그인)
 *  - 세션: HttpOnly+Secure+SameSite=Lax 서명쿠키 (RFC 6265bis / OWASP Session Mgmt)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const APP_URL = process.env.APP_URL || 'https://panda-avata.cc';

function readSecretFile(p) {
  try { const c = JSON.parse(fs.readFileSync(p, 'utf8')); return c.web || c.installed || c; }
  catch (_) { return null; }
}
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || (readSecretFile(process.env.OAUTH_SECRET_FILE || '/var/secrets/oauth-nodetube.json') || {}).client_id
  || '';
const NP_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NP_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || '';
const NP_BASE = process.env.NOWPAYMENTS_SANDBOX === '1'
  ? 'https://api-sandbox.nowpayments.io/v1' : 'https://api.nowpayments.io/v1';
// 지갑/API키가 없으면 더미 결제 모드 (지금은 서비스 준비 단계) — 키 넣으면 자동으로 실결제 전환
const DUMMY = !NP_API_KEY;

const PLANS = {
  monthly:  { price: 25,  days: 30,  desc: 'CENTBEAM Monthly (1 month)' },
  sixmonth: { price: 120, days: 182, desc: 'CENTBEAM 6 months' },
};

// ── 세션 서명키 (재시작해도 세션 유지되도록 파일 보존) ──
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA, '.session-secret');
  try { return fs.readFileSync(f, 'utf8'); } catch (_) {}
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(f, s, { mode: 0o600 }); } catch (_) {}
  return s;
}
const SECRET = sessionSecret();

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
const sign = data => b64u(crypto.createHmac('sha256', SECRET).update(data).digest());

function makeSession(user) {
  const body = b64u(JSON.stringify({
    sub: user.sub, email: user.email, name: user.name || '',
    iat: Date.now(), exp: Date.now() + 7 * 864e5,
  }));
  return body + '.' + sign(body);
}
function verifySession(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const i = tok.indexOf('.'); const body = tok.slice(0, i), sig = tok.slice(i + 1);
  const expect = sign(body);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let p; try { p = JSON.parse(unb64u(body)); } catch (_) { return null; }
  if (!p || !p.sub || !p.exp || Date.now() > p.exp) return null;
  return p;
}

const COOKIE = '__Host-cb_sess';
function parseCookies(req) {
  const h = req.headers.cookie || ''; const o = {};
  h.split(';').forEach(kv => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim()); });
  return o;
}
function setSessionCookie(res, tok) {
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(tok)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 86400}`);
}
function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}
function sessionFromReq(req) { return verifySession(parseCookies(req)[COOKIE]); }
function requireLogin(req, res, next) {
  const s = sessionFromReq(req);
  if (!s) return res.status(401).json({ error: 'login_required' });
  req.user = s; next();
}

// ── 엔타이틀먼트(결제상태) — 서버가 진실 ──
const ENT = path.join(DATA, 'entitlements.json');
const loadEnt = () => { try { return JSON.parse(fs.readFileSync(ENT, 'utf8')); } catch (_) { return {}; } };
const saveEnt = o => { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(ENT, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch (_) {} };
function isPaid(sub) { const e = loadEnt()[sub]; return !!(e && e.expires && Date.now() < e.expires); }
function grant(sub, plan) {
  const e = loadEnt(); const days = (PLANS[plan] || PLANS.monthly).days;
  const base = Math.max(Date.now(), (e[sub] && e[sub].expires) || 0);
  e[sub] = { plan, expires: base + days * 864e5, updated: Date.now() };
  saveEnt(e); return e[sub];
}
function requirePaid(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'login_required' });
  if (!isPaid(req.user.sub)) return res.status(402).json({ error: 'payment_required' });
  next();
}

// 초기 프로모: 처음 N명(구글 sub 기준)만 1개월 무료 풀사용. N번째 이후는 결제 필요.
// 데스크톱/모바일 구분 없음 — 같은 구글 계정이면 한 슬롯. 슬롯은 1회성(만료 후 결제).
const FOUNDERS = path.join(DATA, 'founders.json');
const FREE_SLOTS = Number(process.env.CB_FREE_SLOTS || 5);
const loadFounders = () => { try { const o = JSON.parse(fs.readFileSync(FOUNDERS, 'utf8')); o.list = o.list || []; return o; } catch (_) { return { list: [] }; } };
const saveFounders = (o) => { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FOUNDERS, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch (_) {} };
function maybeFounderGrant(sub) {
  const f = loadFounders();
  if (f.list.includes(sub)) return { founder: true, already: true };   // 이미 슬롯 사용(무료 부여됨)
  if (f.list.length >= FREE_SLOTS) return { founder: false, full: true }; // 슬롯 마감 → 결제 필요
  f.list.push(sub); saveFounders(f);
  grant(sub, 'monthly');                                                 // 1개월 무료 풀사용
  return { founder: true, slot: f.list.length };
}

// 멱등 처리된 결제(txid/payment_id) 기록 — 리플레이 방지
const PAID = path.join(DATA, 'payments.json');
const loadPaid = () => { try { return JSON.parse(fs.readFileSync(PAID, 'utf8')); } catch (_) { return {}; } };
const savePaid = o => { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(PAID, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch (_) {} };

// NOWPayments IPN 서명 검증 (공식: 재귀 정렬 → JSON.stringify → HMAC-SHA512 hex → x-nowpayments-sig 비교)
function sortObject(obj) {
  return Object.keys(obj).sort().reduce((r, k) => {
    r[k] = (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) ? sortObject(obj[k]) : obj[k];
    return r;
  }, {});
}
function validSig(params, received) {
  if (!NP_IPN_SECRET) return false;
  const hmac = crypto.createHmac('sha512', NP_IPN_SECRET);
  hmac.update(JSON.stringify(sortObject(params)));
  const a = Buffer.from(hmac.digest('hex')), b = Buffer.from(String(received || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── MediaMTX 외부 인증 토큰 (authMethod: http) — 시청/송출을 세션에 묶음 ──
// 토큰 = base64url(payload) + "." + base64url(HMAC-SHA256).  payload={u,p,act,exp}.
// ⚠️ 콜론(:) 금지 — MediaMTX 가 Bearer 를 ':' 로 분리해 user:pass 로 오인함(공식 소스 확인). base64url 은 콜론 없음.
function mintMtxToken(userId, pathName, act, ttlSec) {
  const payload = { u: userId, p: pathName, act, exp: Math.floor(Date.now() / 1000) + (ttlSec || 6 * 3600) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyMtxToken(tok) {
  if (!tok || tok.includes(':')) return null;
  const dot = tok.lastIndexOf('.'); if (dot < 0) return null;
  const body = tok.slice(0, dot), sig = tok.slice(dot + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { return null; }
  if (p.exp && Date.now() / 1000 > p.exp) return null;
  return p;
}
const isLoopback = (ip) => !ip || ip === '::1' || ip === '::ffff:127.0.0.1' || String(ip).startsWith('127.');

const gclient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function mountAuth(app) {
  // 프론트가 로그인 버튼/페이월을 그리는 데 필요한 공개 설정 (시크릿 없음)
  app.get('/api/auth/config', (_, res) => res.json({
    googleClientId: GOOGLE_CLIENT_ID, dummy: DUMMY,
    plans: { monthly: PLANS.monthly.price, sixmonth: PLANS.sixmonth.price },
  }));

  // 구글 로그인: ID토큰(credential) 서버 검증 → 세션쿠키 발급
  app.post('/api/auth/google', async (req, res) => {
    try {
      const cred = (req.body || {}).credential;
      if (!cred) return res.status(400).json({ error: 'missing_credential' });
      if (!gclient) return res.status(500).json({ error: 'google_not_configured' });
      const ticket = await gclient.verifyIdToken({ idToken: cred, audience: GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();  // 서명/iss/aud/exp 는 라이브러리가 검증
      if (!p || !p.email_verified) return res.status(401).json({ error: 'email_not_verified' });
      setSessionCookie(res, makeSession({ sub: p.sub, email: p.email, name: p.name }));
      const fg = maybeFounderGrant(p.sub);   // 처음 5명 1개월 무료 자동 부여
      res.json({ ok: true, email: p.email, name: p.name, founder: fg.founder });
    } catch (e) { res.status(401).json({ error: 'invalid_token' }); }
  });

  // 현재 로그인/결제 상태 (모바일·데스크톱 동일 게이트)
  app.get('/api/me', (req, res) => {
    const s = sessionFromReq(req);
    if (!s) return res.json({ authed: false, paid: false, dummy: DUMMY });
    const e = loadEnt()[s.sub];
    const paid = !!(e && e.expires && Date.now() < e.expires);
    res.json({ authed: true, email: s.email, name: s.name, paid, plan: (e && e.plan) || null, expires: (e && e.expires) || null, dummy: DUMMY });
  });

  app.post('/api/logout', (req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

  // 결제 시작: 실모드=NOWPayments 인보이스(invoice_url 리다이렉트), 더미모드=프론트에 dummy 반환
  app.post('/api/checkout', requireLogin, async (req, res) => {
    const plan = (req.body || {}).plan === 'sixmonth' ? 'sixmonth' : 'monthly';
    const P = PLANS[plan];
    const orderId = `${plan}_${req.user.sub}_${Date.now()}`;
    if (DUMMY) return res.json({ dummy: true, plan, orderId });
    try {
      const r = await fetch(NP_BASE + '/invoice', {
        method: 'POST',
        headers: { 'x-api-key': NP_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_amount: P.price, price_currency: 'usd', pay_currency: 'usdttrc20',
          order_id: orderId, order_description: P.desc,
          ipn_callback_url: APP_URL + '/api/nowpayments/ipn',
          success_url: APP_URL + '/studio.html?paid=1', cancel_url: APP_URL + '/studio.html',
        }),
      }).then(r => r.json());
      if (!r || !r.invoice_url) return res.status(502).json({ error: 'invoice_failed' });
      res.json({ invoice_url: r.invoice_url, invoiceId: r.id });
    } catch (e) { res.status(502).json({ error: String(e && e.message || e) }); }
  });

  // 더미 결제 확정 — DUMMY 모드에서만 동작(실 키 넣으면 403). 실제론 IPN 이 승인.
  app.post('/api/pay/dummy', requireLogin, (req, res) => {
    if (!DUMMY) return res.status(403).json({ error: 'dummy_disabled' });
    const plan = (req.body || {}).plan === 'sixmonth' ? 'sixmonth' : 'monthly';
    const ent = grant(req.user.sub, plan);
    res.json({ ok: true, plan, expires: ent.expires });
  });

  // NOWPayments IPN: 서명 검증 → finished 만 승인(멱등). 클라이언트 'paid' 는 절대 신뢰 안 함.
  app.post('/api/nowpayments/ipn', (req, res) => {
    if (!validSig(req.body || {}, req.headers['x-nowpayments-sig'])) return res.status(400).send('invalid signature');
    const b = req.body || {};
    if (b.payment_status === 'finished') {
      const done = loadPaid();
      const key = String(b.payment_id || b.invoice_id || b.order_id);
      if (key && !done[key]) {
        const m = String(b.order_id || '').match(/^(monthly|sixmonth)_([^_]+)_/);
        if (m) { grant(m[2], m[1]); done[key] = { ts: Date.now(), order: b.order_id }; savePaid(done); }
      }
    }
    res.status(200).send('OK'); // 수신 확인 → NOWPayments 재시도 중단
  });

  // MediaMTX 외부 인증 콜백 — 매 publish/read/playback 요청마다 호출. 2xx=허용, 그 외=거부.
  // (api/metrics/pprof 는 mediamtx.yml authHTTPExclude 로 제외되어 여기 안 옴)
  app.post('/api/mediamtx/auth', (req, res) => {
    const b = req.body || {}; const action = b.action, pth = b.path;
    // 내부 fanout(로컬 루프백)의 read 는 허용 — 같은 서버가 재송출하려고 rtmp://127.0.0.1 로 읽음
    if ((action === 'read' || action === 'playback') && isLoopback(b.ip)) return res.status(204).end();
    let tok = b.token; if (!tok && b.query) { try { tok = new URLSearchParams(b.query).get('token') || ''; } catch (_) {} }
    const c = verifyMtxToken(tok);
    if (!c || c.p !== pth) return res.status(401).end();                    // 토큰 무효 or 경로 불일치 → 거부
    const ok = (action === 'publish' && c.act === 'publish')
      || ((action === 'read' || action === 'playback') && (c.act === 'read' || c.act === 'publish'));
    return ok ? res.status(204).end() : res.status(401).end();
  });

  return { requireLogin, requirePaid, sessionFromReq, isPaid };
}

module.exports = { mountAuth, requireLogin, requirePaid, sessionFromReq, isPaid, grant, verifySession, makeSession, validSig, sortObject, maybeFounderGrant, mintMtxToken, verifyMtxToken, PLANS, FREE_SLOTS };
