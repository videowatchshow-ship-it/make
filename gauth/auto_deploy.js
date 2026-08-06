/* gauth API routes — Express 모듈
 * ref: https://github.com/expressjs/express/blob/master/lib/router/index.js
 * ref: https://github.com/nodejs/node/blob/main/doc/api/child_process.md#child_processexecfilesyncfile-args-options
 * ref: https://github.com/nodejs/node/blob/main/doc/api/fs.md
 * ref: https://github.com/nodejs/node/blob/main/doc/api/crypto.md */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeEmail(s) {
  s = String(s || '').trim().toLowerCase();
  const parts = s.split('@');
  if (parts.length === 2) {
    let local = parts[0];
    const domain = parts[1];
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      local = local.replace(/\./g, '').split('+')[0];
      return local + '@gmail.com';
    }
  }
  return s;
}

const DATA_DIR = '/opt/gauth-full';
const DATA_FILE = path.join(DATA_DIR, 'accounts_normalized.json');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const FRONTEND_DIR = '/var/www/sites/gauth/public';

/* OWASP: timing-safe 비교 — HMAC으로 고정 길이 변환하여 길이 누출 방지
 * ref: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 * ref: https://github.com/nodejs/node/blob/main/doc/api/crypto.md#cryptotimingsafeequala-b */
function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || (req.query && req.query.token) || '';
  const expected = process.env.GAUTH_API_TOKEN || '';
  if (!expected) return res.status(503).json({ ok: false, error: 'GAUTH_API_TOKEN not configured' });
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const hmac = (s) => crypto.createHmac('sha256', 'gauth').update(s).digest();
  if (!crypto.timingSafeEqual(hmac(token), hmac(expected))) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

function safeReadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.accounts || []);
  } catch (e) {
    return [];
  }
}

module.exports = function(app) {
  app.get('/api/accounts', (req, res) => {
    try {
      const accounts = safeReadJSON(DATA_FILE);
      const profilesDir = PROFILES_DIR;
      let sessCount = 0;
      const mapped = accounts.map(a => {
        const has2FA = !!(a.totp_secret && a.totp_secret.trim());
        const hasSess = fs.existsSync(path.join(profilesDir, a.email || ''));
        if (hasSess) sessCount++;
        return { email: a.email, has2FA, has_session: hasSess };
      });
      const usable = accounts.filter(a => a.email && a.password).length;
      const invalid = accounts.length - usable;
      res.json({ accounts: mapped, total: accounts.length, file_total: accounts.length, usable, invalid, sessions: sessCount, source: 'auto_deploy' });
    } catch (e) {
      res.json({ accounts: [], total: 0, file_total: 0, usable: 0, invalid: 0, sessions: 0 });
    }
  });

  app.post('/api/deploy', authMiddleware, async (req, res) => {
    try {
      const rawBranch = req.body && req.body.branch || 'main';
      /* git-check-ref-format: 금지 문자 제거 — https://git-scm.com/docs/git-check-ref-format */
      const branch = rawBranch.replace(/[\x00-\x1f\x7f ~^:?*\[\\]/g, '').replace(/\.{2,}/g, '.').replace(/\.lock$/i, '').replace(/^\/|\/$/g, '');
      if (!branch) return res.status(400).json({ ok: false, error: 'invalid branch name' });
      const repoDir = '/tmp/gauth-deploy-repo';

      if (fs.existsSync(repoDir)) {
        execFileSync('rm', ['-rf', repoDir]);
      }

      execFileSync('git', ['clone', '--depth', '1', '--branch', branch,
        'https://github.com/videowatchshow-ship-it/make', repoDir],
        { timeout: 60000 }
      );

      const fileMappings = [
        { src: 'gauth/upload_excels.js', dst: path.join(DATA_DIR, 'upload_excels.js') },
        { src: 'gauth/auto_deploy.js', dst: path.join(DATA_DIR, 'auto_deploy.js') },
        { src: 'gauth/index.html', dst: path.join(FRONTEND_DIR, 'index.html') },
        { src: 'gauth/xlsx.core.min.js', dst: path.join(FRONTEND_DIR, 'xlsx.core.min.js') },
        { src: 'gauth/manifest.json', dst: path.join(FRONTEND_DIR, 'manifest.json') },
        { src: 'gauth/sw.js', dst: path.join(FRONTEND_DIR, 'sw.js') },
        { src: 'advanced-google-login-v2.js', dst: path.join(DATA_DIR, 'advanced-google-login-v2.js') },
        { src: 'package.json', dst: path.join(DATA_DIR, 'package.json') },
      ];

      const deployed = [];
      for (const m of fileMappings) {
        const srcPath = path.join(repoDir, m.src);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, m.dst);
          deployed.push(path.basename(m.dst));
        }
      }

      execFileSync('rm', ['-rf', repoDir]);

      if (deployed.includes('package.json')) {
        try {
          execFileSync('rm', ['-rf', path.join(DATA_DIR, 'node_modules', 'multer')]);
          execFileSync('npm', ['install', '--production'], { cwd: DATA_DIR, timeout: 120000 });
          deployed.push('npm-install-ok');
        } catch (e) {
          deployed.push('npm-install-failed:' + e.message.slice(0, 100));
        }
      }

      try {
        execFileSync('sudo', ['systemctl', 'restart', 'gauth'], { timeout: 30000 });
        deployed.push('service-restarted');
      } catch (e) {
        deployed.push('restart-failed:' + e.message.slice(0, 100));
      }

      let cfResult = 'skipped';
      try {
        let cfToken = '', cfZone = '';
        const envFiles = ['/opt/gauth-full/.env', '/etc/environment', '/etc/default/gauth'];
        for (const ef of envFiles) {
          try {
            const content = fs.readFileSync(ef, 'utf8');
            if (!cfToken) { const m = content.match(/(?:CLOUDFLARE_TOKEN|CF_TOKEN)=(\S+)/); if (m) cfToken = m[1]; }
            if (!cfZone) { const m = content.match(/(?:CLOUDFLARE_ZONE_ID|CF_ZONE_ID)=(\S+)/); if (m) cfZone = m[1]; }
          } catch (_) {}
        }
        try {
          const svc = fs.readFileSync('/etc/systemd/system/gauth.service', 'utf8');
          if (!cfToken) { const m = svc.match(/CLOUDFLARE_TOKEN=(\S+)/); if (m) cfToken = m[1]; }
          if (!cfZone) { const m = svc.match(/CLOUDFLARE_ZONE_ID=(\S+)/); if (m) cfZone = m[1]; }
        } catch (_) {}
        if (!cfToken) cfToken = process.env.CLOUDFLARE_TOKEN || process.env.CF_TOKEN || '';
        if (!cfZone) cfZone = process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID || '';
        if (cfToken && cfZone) {
          const https = require('https');
          const purgeData = JSON.stringify({ purge_everything: true });
          const purgeResult = await new Promise((resolve) => {
            const req = https.request({
              hostname: 'api.cloudflare.com',
              path: `/client/v4/zones/${cfZone}/purge_cache`,
              method: 'POST',
              headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json', 'Content-Length': purgeData.length }
            }, (res) => {
              let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
            });
            req.on('error', (e) => resolve('error:' + e.message));
            req.write(purgeData); req.end();
          });
          try { cfResult = JSON.parse(purgeResult).success ? 'purged' : 'failed'; } catch (_) { cfResult = 'parse-error'; }
        } else {
          cfResult = 'no-tokens';
        }
      } catch (e) { cfResult = 'error:' + e.message.slice(0, 50); }
      deployed.push('cf-cache:' + cfResult);

      res.json({ ok: true, deployed });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/update-secret', authMiddleware, (req, res) => {
    try {
      const { email, totp_secret } = req.body || {};
      if (!email || !totp_secret) return res.status(400).json({ ok: false, error: 'email and totp_secret required' });
      /* Base32: RFC 4648 Section 6 — https://datatracker.ietf.org/doc/html/rfc4648#section-6 */
      const normalized = String(totp_secret).toUpperCase().replace(/[\s\-_=]/g, '').replace(/[^A-Z2-7]/g, '');
      if (normalized.length < 16) return res.status(400).json({ ok: false, error: 'secret too short (min 16 Base32 chars)' });
      /* RFC 4226 Section 4 — https://datatracker.ietf.org/doc/html/rfc4226#section-4
       * 권장 길이: 20(SHA-1), 32(SHA-256), 64(SHA-512). Google Authenticator는 16도 허용 */
      const VALID_LENGTHS = [16, 20, 32, 64];
      if (!VALID_LENGTHS.includes(normalized.length)) {
        console.log(`Warning: secret length ${normalized.length} is non-standard (RFC 4226: 16/20/32/64)`);
      }
      const dataFile = DATA_FILE;
      const accounts = safeReadJSON(dataFile);
      const account = accounts.find(a => normalizeEmail(a.email) === normalizeEmail(email));
      if (!account) return res.status(404).json({ ok: false, error: 'account not found' });
      account.totp_secret = normalized;
      const tmpFile = dataFile + '.tmp.' + process.pid;
      fs.writeFileSync(tmpFile, JSON.stringify(accounts, null, 2));
      fs.renameSync(tmpFile, dataFile);
      res.json({ ok: true, email, secret_length: normalized.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/normalized-accounts', (req, res) => {
    try {
      const accounts = safeReadJSON(DATA_FILE);
      let filesScanned = 0;
      const fileCounts = {};
      for (const a of accounts) {
        const src = a.source_file || 'unknown';
        fileCounts[src] = (fileCounts[src] || 0) + 1;
      }
      filesScanned = Object.keys(fileCounts).length;
      const pw2fa = accounts.filter(a => a.password && a.totp_secret).length;
      const pwOnly = accounts.filter(a => a.password && !a.totp_secret).length;
      const fileDetails = Object.entries(fileCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      res.json({
        accounts,
        summary: {
          total: accounts.length,
          files_scanned: filesScanned,
          PASSWORD_2FA: pw2fa,
          PASSWORD_ONLY: pwOnly,
          file_details: fileDetails
        }
      });
    } catch (e) {
      res.status(500).json({ accounts: [], summary: {}, error: e.message });
    }
  });

  /* ref: https://github.com/nodejs/node/blob/main/doc/api/fs.md#fsreaddirsyncpath-options */
  app.get('/api/profiles', (req, res) => {
    try {
      const profilesDir = PROFILES_DIR;
      const profiles = [];
      if (fs.existsSync(profilesDir)) {
        for (const folder of fs.readdirSync(profilesDir)) {
          const fullPath = path.join(profilesDir, folder);
          if (fs.statSync(fullPath).isDirectory()) {
            /* 폴더명→이메일: 첫 _ → @, 이후 _ → . (multi-dot 도메인 대응) */
        const email = folder.replace(/^([^_]+)_(.+)$/, (_, u, d) => u + '@' + d.replace(/_/g, '.'));
            profiles.push({ folder, email });
          }
        }
      }
      res.json({ profiles });
    } catch (e) {
      res.json({ profiles: [] });
    }
  });

  app.get('/api/failed-accounts', (req, res) => {
    try {
      const failFile = path.join(DATA_DIR, 'failed_accounts.json');
      if (fs.existsSync(failFile)) {
        res.json(JSON.parse(fs.readFileSync(failFile, 'utf8')));
      } else {
        res.json({});
      }
    } catch (e) {
      res.json({});
    }
  });

  app.delete('/api/failed-accounts/:email', (req, res) => {
    try {
      const email = (req.params.email || '').trim().toLowerCase();
      const failFile = path.join(DATA_DIR, 'failed_accounts.json');
      if (!fs.existsSync(failFile)) return res.json({ ok: true });
      const data = JSON.parse(fs.readFileSync(failFile, 'utf8'));
      const key = Object.keys(data).find(k => k.toLowerCase() === email);
      if (key) {
        delete data[key];
        fs.writeFileSync(failFile, JSON.stringify(data, null, 2));
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/lookup/:email', (req, res) => {
    try {
      const email = normalizeEmail(req.params.email);
      if (!email) return res.status(400).json({ error: 'email required' });
      const dataFile = DATA_FILE;
      const accounts = safeReadJSON(dataFile);
      const account = accounts.find(a => normalizeEmail(a.email) === email);
      if (!account) return res.status(404).json({ error: 'not found' });
      const profileDir = path.join(PROFILES_DIR, account.email);
      const hasSession = fs.existsSync(profileDir);
      res.json({
        email: account.email,
        password: account.password || '',
        password_alts: account.password_alts || [],
        totp_secret: account.totp_secret || '',
        recovery_email: account.recovery_email || '',
        source_file: account.source_file || '',
        source_mtime: account.source_mtime || 0,
        youtube_url: account.youtube_url || '',
        has_session: hasSession,
        extra: account.extra || []
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/search-account', (req, res) => {
    try {
      const q = (req.query.q || '').trim().toLowerCase();
      if (!q || q.length < 3) return res.status(400).json({ ok: false, error: 'query too short (min 3 chars)' });
      const dataFile = DATA_FILE;
      const accounts = safeReadJSON(dataFile);
      const results = [];
      for (const a of accounts) {
        const email = (a.email || '').toLowerCase();
        const extra = JSON.stringify(a.extra || []).toLowerCase();
        const recovery = (a.recovery_email || '').toLowerCase();
        const alts = JSON.stringify(a.password_alts || []).toLowerCase();
        if (email.includes(q) || extra.includes(q) || recovery.includes(q) || alts.includes(q)) {
          results.push({ email: a.email, password: a.password ? '***' : '', totp_secret: a.totp_secret || '', recovery_email: a.recovery_email || '', source_file: a.source_file || '', source_mtime: a.source_mtime || 0, extra: a.extra || [], password_alts: a.password_alts || [] });
        }
      }
      res.json({ ok: true, query: q, total_accounts: accounts.length, found: results.length, results: results.slice(0, 50) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* ref: https://github.com/nodejs/node/blob/main/doc/api/child_process.md#child_processexecfilesyncfile-args-options */
  app.get('/api/deploy-status', authMiddleware, (req, res) => {
    const checks = {};
    try { checks.chrome = execFileSync('which', ['google-chrome-stable'], { encoding: 'utf8' }).trim(); } catch { try { checks.chrome = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(); } catch { checks.chrome = 'not-found'; } }
    try { execFileSync('pgrep', ['-f', 'Xvfb :99']); checks.xvfb = 'running'; } catch { checks.xvfb = 'stopped'; }
    try { checks.node = execFileSync('node', ['-v'], { encoding: 'utf8' }).trim(); } catch { checks.node = 'not-found'; }
    checks.display = process.env.DISPLAY || 'not-set';
    res.json(checks);
  });

  const loginQueue = new Map();
  /* Puppeteer 로그인 최대 90초(advancedGoogleLogin timeout) + 버퍼 30초 */
  const LOGIN_TIMEOUT = 120000;
  /* Chrome 인스턴스당 ~300MB RAM, 서버 2GB 기준 최대 3개 */
  const MAX_CONCURRENT_LOGINS = 3;

  setInterval(() => {
    const now = Date.now();
    for (const [email, startTime] of loginQueue) {
      if (now - startTime > LOGIN_TIMEOUT) {
        loginQueue.delete(email);
      }
    }
  }, 30000);

  app.post('/api/login-one', authMiddleware, async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, reason: 'email required' });

    if (loginQueue.has(email)) {
      const elapsed = Date.now() - loginQueue.get(email);
      if (elapsed < LOGIN_TIMEOUT) {
        return res.status(409).json({ success: false, reason: 'LOGIN_IN_PROGRESS' });
      }
      loginQueue.delete(email);
    }

    if (loginQueue.size >= MAX_CONCURRENT_LOGINS) {
      return res.status(429).json({ success: false, reason: 'TOO_MANY_CONCURRENT', max: MAX_CONCURRENT_LOGINS });
    }

    const dataFile = DATA_FILE;
    let account;
    try {
      const accounts = safeReadJSON(dataFile);
      account = accounts.find(a => normalizeEmail(a.email) === normalizeEmail(email));
    } catch (e) {
      return res.status(500).json({ success: false, reason: 'DATA_READ_ERROR', error: e.message });
    }
    if (!account) return res.status(404).json({ success: false, reason: 'ACCOUNT_NOT_FOUND' });
    if (!account.password) return res.status(400).json({ success: false, reason: 'UNKNOWN_PASSWORD' });

    loginQueue.set(email, Date.now());
    let loginModule;
    try {
      loginModule = require(path.join(__dirname, 'advanced-google-login-v2.js'));
    } catch (e) {
      loginQueue.delete(email);
      return res.status(500).json({ success: false, reason: 'LOGIN_MODULE_ERROR', error: e.message });
    }

    try {
      const result = await loginModule.advancedGoogleLogin(
        { email: account.email, password: account.password, twoFA: account.totp_secret || '' },
        { headless: false, timeout: 90000 }
      );
      loginQueue.delete(email);
      if (result && result.success) {
        if (result.browser) try { await result.browser.close(); } catch (_) {}
        return res.json({ success: true, result: result.result });
      }
      if (result && result.browser) try { await result.browser.close(); } catch (_) {}
      return res.json({ success: false, reason: result ? result.result : 'UNKNOWN_ERROR' });
    } catch (e) {
      loginQueue.delete(email);
      return res.status(500).json({ success: false, reason: 'LOGIN_EXCEPTION', error: e.message });
    }
  });

  const YT_TOKENS_FILE = path.join(DATA_DIR, 'youtube_tokens.json');

  function readYtTokens() {
    try { return JSON.parse(fs.readFileSync(YT_TOKENS_FILE, 'utf8')); } catch { return {}; }
  }
  function writeYtTokens(data) {
    const tmp = YT_TOKENS_FILE + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, YT_TOKENS_FILE);
  }

  app.get('/api/youtube/client-id', (req, res) => {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID || '';
    res.json({ client_id: clientId });
  });

  app.post('/api/youtube/save-token', (req, res) => {
    try {
      const { email, access_token, expires_at } = req.body || {};
      if (!email || !access_token) return res.status(400).json({ ok: false, error: 'email and access_token required' });
      const tokens = readYtTokens();
      tokens[normalizeEmail(email)] = { access_token, expires_at: expires_at || (Date.now() + 3600000), saved_at: Date.now() };
      writeYtTokens(tokens);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/youtube/token-status/:email', (req, res) => {
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(req.params.email)];
    if (!t) return res.json({ connected: false });
    res.json({ connected: true, expires_at: t.expires_at, expired: Date.now() > t.expires_at });
  });

  app.post('/api/youtube/chat-message', (req, res) => {
    const { email, liveChatId, message } = req.body || {};
    if (!email || !liveChatId || !message) return res.status(400).json({ ok: false, error: 'email, liveChatId, message required' });
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const https = require('https');
    const body = JSON.stringify({ snippet: { liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: message } } });
    const r = https.request({
      hostname: 'www.googleapis.com', path: '/youtube/v3/liveChat/messages?part=snippet',
      method: 'POST', headers: { 'Authorization': 'Bearer ' + t.access_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try { const j = JSON.parse(d); res.json({ ok: !j.error, data: j }); } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('error', e => res.status(500).json({ ok: false, error: e.message }));
    r.write(body); r.end();
  });

  app.get('/api/youtube/live-chat-id/:email', (req, res) => {
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(req.params.email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const https = require('https');
    const r = https.request({
      hostname: 'www.googleapis.com', path: '/youtube/v3/liveBroadcasts?part=snippet,contentDetails&broadcastStatus=active&broadcastType=all',
      method: 'GET', headers: { 'Authorization': 'Bearer ' + t.access_token }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try {
          const j = JSON.parse(d);
          const items = (j.items || []).map(it => ({ title: it.snippet.title, liveChatId: it.snippet.liveChatId, videoId: it.contentDetails ? it.contentDetails.boundStreamId : '' }));
          res.json({ ok: true, broadcasts: items });
        } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('error', e => res.status(500).json({ ok: false, error: e.message }));
    r.end();
  });

  app.get('/api/youtube/chat-list/:email', (req, res) => {
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(req.params.email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const liveChatId = req.query.liveChatId;
    if (!liveChatId) return res.status(400).json({ ok: false, error: 'liveChatId required' });
    const https = require('https');
    const r = https.request({
      hostname: 'www.googleapis.com', path: `/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=snippet,authorDetails&maxResults=200`,
      method: 'GET', headers: { 'Authorization': 'Bearer ' + t.access_token }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try {
          const j = JSON.parse(d);
          const msgs = (j.items || []).map(it => ({
            displayName: it.authorDetails.displayName,
            channelId: it.authorDetails.channelId,
            message: it.snippet.textMessageDetails ? it.snippet.textMessageDetails.messageText : '',
            publishedAt: it.snippet.publishedAt
          }));
          res.json({ ok: true, messages: msgs, pollingIntervalMillis: j.pollingIntervalMillis || 5000 });
        } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('error', e => res.status(500).json({ ok: false, error: e.message }));
    r.end();
  });

  app.post('/api/youtube/add-moderator', (req, res) => {
    const { email, liveChatId, channelId } = req.body || {};
    if (!email || !liveChatId || !channelId) return res.status(400).json({ ok: false, error: 'email, liveChatId, channelId required' });
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const https = require('https');
    const body = JSON.stringify({ snippet: { liveChatId, moderatorDetails: { channelId } } });
    const r = https.request({
      hostname: 'www.googleapis.com', path: '/youtube/v3/liveChat/moderators?part=snippet',
      method: 'POST', headers: { 'Authorization': 'Bearer ' + t.access_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try { const j = JSON.parse(d); res.json({ ok: !j.error, data: j }); } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('error', e => res.status(500).json({ ok: false, error: e.message }));
    r.write(body); r.end();
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 🎯 Batch YouTube Connect — N개 계정 무작위 선택 → 자동 로그인 → OAuth → DB 등록
   * 절대 제외: vin7899, videowatch.show, rhkdrh999 계정
   * 절대 제외: gauth 리스트 최신(상위) 30개
   * ref: https://developers.google.com/identity/protocols/oauth2/web-server
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const FORBIDDEN_ACCOUNTS = ['vin7899', 'videowatch.show', 'rhkdrh999'];
  const SKIP_TOP_N = 30;
  const batchQueue = { running: false, results: [], total: 0, done: 0, current: '' };

  function isForbidden(email) {
    const e = normalizeEmail(email);
    for (const f of FORBIDDEN_ACCOUNTS) {
      if (e.includes(f)) return true;
    }
    return false;
  }

  app.get('/api/batch-connect/status', (req, res) => {
    res.json({ ...batchQueue });
  });

  function batchAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
      || (req.query && req.query.token) || '';
    const mlPw = process.env.ML_PASSWORD || '1147';
    const apiToken = process.env.GAUTH_API_TOKEN || '';
    if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (token === mlPw) return next();
    if (apiToken) {
      const hmac = (s) => crypto.createHmac('sha256', 'gauth').update(s).digest();
      try { if (crypto.timingSafeEqual(hmac(token), hmac(apiToken))) return next(); } catch {}
    }
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  app.post('/api/batch-connect/stop', batchAuth, (req, res) => {
    batchQueue.running = false;
    res.json({ ok: true, msg: 'stopped' });
  });

  app.post('/api/batch-connect/start', batchAuth, async (req, res) => {
    if (batchQueue.running) {
      return res.status(409).json({ ok: false, error: 'ALREADY_RUNNING' });
    }

    const count = Math.min(Math.max(parseInt(req.body.count) || 10, 1), 30);
    const delayMinutes = Math.max(parseFloat(req.body.delay_minutes) || 1, 0.5);
    const oauthProject = parseInt(req.body.oauth_project) || 4;

    /* OAuth client 정보 — 환경변수 또는 요청에서 */
    const oauthConfig = {
      client_id: req.body.client_id || process.env.YOUTUBE_OAUTH_CLIENT_ID || '',
      client_secret: req.body.client_secret || process.env.YOUTUBE_OAUTH_CLIENT_SECRET || '',
      redirect_uri: req.body.redirect_uri || process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'https://xn--9d0bw2fjtyymch7de9d.info/admin/youtube/',
      scopes: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl'
    };

    if (!oauthConfig.client_id || !oauthConfig.client_secret) {
      return res.status(400).json({ ok: false, error: 'client_id and client_secret required' });
    }

    /* 계정 목록 로드 + 필터링 */
    const allAccounts = safeReadJSON(DATA_FILE);
    const eligible = allAccounts
      .slice(SKIP_TOP_N)
      .filter(a => a.email && a.password && a.totp_secret && !isForbidden(a.email));

    if (eligible.length === 0) {
      return res.status(400).json({ ok: false, error: 'NO_ELIGIBLE_ACCOUNTS' });
    }

    /* Fisher-Yates 셔플 후 count개 선택
     * ref: https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle */
    const shuffled = [...eligible];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, count);

    batchQueue.running = true;
    batchQueue.results = [];
    batchQueue.total = selected.length;
    batchQueue.done = 0;
    batchQueue.current = '';

    res.json({ ok: true, msg: `${selected.length}개 계정 batch connect 시작`, accounts: selected.map(a => a.email) });

    /* 비동기 처리 (응답 후 백그라운드 실행) */
    (async () => {
      let loginGoogle, oauthModule, getSharedBrowser, sessionStore;
      try {
        loginGoogle = require(path.join(__dirname, 'lib/login/google')).loginGoogle;
        oauthModule = require(path.join(__dirname, 'youtube-oauth-auto.js'));
        const main = require.cache[require.resolve(path.join(__dirname, 'rebrowser-login.js'))];
        if (main && main.exports) {
          getSharedBrowser = main.exports.getSharedBrowser;
          sessionStore = main.exports.sessionStore;
        }
        if (!getSharedBrowser) {
          getSharedBrowser = require(path.join(__dirname, 'rebrowser-login.js')).getSharedBrowser;
        }
        if (!sessionStore) {
          sessionStore = require(path.join(__dirname, 'session_store'));
        }
      } catch (e) {
        console.error('[batch-connect] module load error:', e.message);
        batchQueue.running = false;
        return;
      }

      for (let i = 0; i < selected.length; i++) {
        if (!batchQueue.running) {
          console.log('[batch-connect] 중지됨');
          break;
        }

        const account = selected[i];
        batchQueue.current = account.email;
        console.log(`\n[batch-connect] ${i + 1}/${selected.length}: ${account.email}`);

        let result = { email: account.email, success: false, error: '' };

        try {
          /* 1단계: Google 로그인 (lib/login/google.js — 공유 브라우저) */
          const browser = await getSharedBrowser();
          const broadcast = (data) => {
            if (data.type === 'log') console.log(`  [batch] ${data.message}`);
          };
          const loginResult = await loginGoogle(
            { email: account.email, password: account.password, twoFA: account.totp_secret || '' },
            { browser, sessionStore, broadcast }
          );

          if (!loginResult || !loginResult.success) {
            result.error = 'LOGIN_FAILED: ' + (loginResult ? loginResult.reason : 'null');
            console.log(`  [batch] 로그인 실패: ${result.error}`);
          } else {
            console.log(`  [batch] 로그인 성공, OAuth consent 시작...`);

            /* 2단계: OAuth consent 자동화 */
            const oauthResult = await oauthModule.autoOAuthConsent(browser, oauthConfig);

            if (oauthResult.success && oauthResult.refresh_token) {
              result.success = true;
              result.channel_id = oauthResult.channel_id;
              result.channel_title = oauthResult.channel_title;
              result.refresh_token = oauthResult.refresh_token ? '***' : '';
              console.log(`  [batch] OAuth 성공! 채널: ${oauthResult.channel_title} (${oauthResult.channel_id})`);

              /* 3단계: 참교육 DB에 등록 */
              try {
                await registerToChagyoDB(oauthResult, oauthProject);
                result.db_registered = true;
                console.log(`  [batch] DB 등록 완료`);
              } catch (dbErr) {
                result.db_error = dbErr.message;
                console.log(`  [batch] DB 등록 실패: ${dbErr.message}`);
              }
            } else {
              result.error = 'OAUTH_FAILED: ' + (oauthResult.error || 'unknown');
              console.log(`  [batch] OAuth 실패: ${result.error}`);
            }

            /* 공유 브라우저 사용 — 닫지 않음 (loginGoogle이 context를 자체 정리) */
          }
        } catch (e) {
          result.error = 'EXCEPTION: ' + e.message;
          console.log(`  [batch] 예외: ${e.message}`);
        }

        batchQueue.results.push(result);
        batchQueue.done = i + 1;

        /* 다음 계정 전 딜레이 (분 단위) */
        if (i < selected.length - 1 && batchQueue.running) {
          const delayMs = delayMinutes * 60000;
          console.log(`  [batch] 다음 계정까지 ${delayMinutes}분 대기...`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }

      batchQueue.running = false;
      batchQueue.current = '';
      console.log(`\n[batch-connect] 완료: ${batchQueue.results.filter(r => r.success).length}/${batchQueue.total} 성공`);
    })();
  });

  /* 참교육 DB 등록 — 서버 내부 HTTP 호출 또는 직접 MySQL */
  async function registerToChagyoDB(oauthResult, oauthProject) {
    const mysql = (() => { try { return require('mysql2/promise'); } catch { return null; } })();
    if (!mysql) {
      /* mysql2 없으면 참교육 서버 API로 등록 */
      return registerViaAPI(oauthResult, oauthProject);
    }

    const dbPw = (() => { try { return fs.readFileSync('/var/www/sites/chamgyo/.dbpw', 'utf8').trim(); } catch { return ''; } })();
    if (!dbPw) return registerViaAPI(oauthResult, oauthProject);

    const conn = await mysql.createConnection({ host: '127.0.0.1', user: 'u_chamgyo', password: dbPw, database: 'db_chamgyo' });
    try {
      await conn.execute(
        `INSERT INTO gucci_yt_channels (channel_id, title, refresh_token, status, live_enabled, oauth_project, connected_at)
         VALUES (?, ?, ?, 'active', 1, ?, NOW())
         ON DUPLICATE KEY UPDATE title=VALUES(title), refresh_token=IF(VALUES(refresh_token)<>'', VALUES(refresh_token), refresh_token),
           status='active', live_enabled=1, oauth_project=VALUES(oauth_project)`,
        [oauthResult.channel_id, oauthResult.channel_title, oauthResult.refresh_token, String(oauthProject)]
      );
      await conn.execute(
        `INSERT INTO gucci_yt_channel_tokens (channel_id, oauth_project, refresh_token)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE refresh_token=VALUES(refresh_token), last_error='', updated_at=NOW()`,
        [oauthResult.channel_id, oauthProject, oauthResult.refresh_token]
      );
    } finally {
      await conn.end();
    }
  }

  function registerViaAPI(oauthResult, oauthProject) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        channel_id: oauthResult.channel_id,
        channel_title: oauthResult.channel_title,
        refresh_token: oauthResult.refresh_token,
        oauth_project: oauthProject
      });
      const req = https.request({
        hostname: '127.0.0.1', port: 443,
        path: '/admin/api/register-channel.php',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { const j = JSON.parse(d); j.ok ? resolve(j) : reject(new Error(d)); } catch { reject(new Error(d)); } });
      });
      req.on('error', reject);
      req.write(body); req.end();
    });
  }

  console.log('[auto_deploy] routes registered: /api/accounts, /api/normalized-accounts, /api/profiles, /api/failed-accounts, /api/deploy, /api/update-secret, /api/lookup/:email, /api/search-account, /api/deploy-status, /api/login-one, /api/youtube/*, /api/batch-connect/*');
};
