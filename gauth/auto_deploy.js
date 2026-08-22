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
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(function(c) {
    const parts = c.trim().split('=');
    if (parts.length >= 2) cookies[parts[0]] = decodeURIComponent(parts.slice(1).join('='));
  });
  if (cookies.gauth_uid) {
    try {
      const users = JSON.parse(fs.readFileSync(path.join(path.dirname(DATA_FILE), 'google_users.json'), 'utf8'));
      if (users.some(function(u) { return u.sub === cookies.gauth_uid; })) return next();
    } catch (e) {}
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || (req.query && req.query.token) || '';
  const expected = process.env.GAUTH_API_TOKEN || '';
  if (!expected && !token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!expected) return res.status(503).json({ ok: false, error: 'service unavailable' });
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const hmacKey = process.env.GAUTH_HMAC_KEY || process.env.GAUTH_API_TOKEN || '';
  const hmac = (s) => crypto.createHmac('sha256', hmacKey).update(s).digest();
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

function fixSourceMtimes() {
  try {
    const accounts = safeReadJSON(DATA_FILE);
    if (!accounts.length) return;
    let fixed = 0;
    const uploadsDir = path.join(DATA_DIR, 'uploads');
    for (const a of accounts) {
      if (!a.source_mtime || a.source_mtime < 1000000000000) {
        const sf = a.source_file || '';
        const tsMatch = sf.match(/up_(\d{13})_/);
        if (tsMatch) {
          a.source_mtime = parseInt(tsMatch[1]);
          fixed++;
        } else if (sf && uploadsDir) {
          try {
            const fp = path.resolve(uploadsDir, path.basename(sf));
            if (fp.startsWith(path.resolve(uploadsDir) + path.sep) && fs.existsSync(fp)) { a.source_mtime = fs.statSync(fp).mtimeMs; fixed++; }
          } catch {}
        }
        if (!a.source_mtime || a.source_mtime < 1000000000000) {
          a.source_mtime = Date.now();
          fixed++;
        }
      }
    }
    if (fixed > 0) {
      const tmp = DATA_FILE + '.tmp.' + process.pid + '.' + Date.now();
      fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2));
      fs.renameSync(tmp, DATA_FILE);
      console.log('[auto_deploy] fixSourceMtimes: patched ' + fixed + ' accounts');
    }
  } catch (e) {
    console.error('[auto_deploy] fixSourceMtimes error:', e.message);
  }
}
fixSourceMtimes();

module.exports = function(app) {
  function safePath(base, name) {
    const resolved = path.resolve(base, name);
    if (!resolved.startsWith(path.resolve(base) + path.sep)) return null;
    return resolved;
  }

  function emailToFolder(email) {
    if (!email) return null;
    const at = email.indexOf('@');
    if (at < 0) return null;
    return email.slice(0, at) + '_' + email.slice(at + 1).replace(/\./g, '_');
  }

  app.get('/api/accounts', authMiddleware, (req, res) => {
    try {
      const accounts = safeReadJSON(DATA_FILE);
      const profilesDir = PROFILES_DIR;
      let sessCount = 0;
      const mapped = accounts.map(a => {
        const has2FA = !!(a.totp_secret && a.totp_secret.trim());
        const folder = emailToFolder(a.email);
        const sessPath = folder ? safePath(profilesDir, folder) : null;
        const hasSess = sessPath ? fs.existsSync(sessPath) : false;
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

  let _deployInProgress = false;
  app.post('/api/deploy', authMiddleware, async (req, res) => {
    if (_deployInProgress) return res.status(409).json({ ok: false, error: 'deploy already in progress' });
    try {
      const rawBranch = req.body && req.body.branch || 'main';
      /* git-check-ref-format: 금지 문자 제거 — https://git-scm.com/docs/git-check-ref-format */
      const branch = rawBranch.replace(/[\x00-\x1f\x7f ~^:?*\[\\]/g, '').replace(/\.{2,}/g, '.').replace(/\.lock$/i, '').replace(/^\/|\/$/g, '').replace(/^-/, '');
      if (!branch) return res.status(400).json({ ok: false, error: 'invalid branch name' });
      _deployInProgress = true;
      const repoDir = '/tmp/gauth-deploy-repo';

      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
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

      fs.rmSync(repoDir, { recursive: true, force: true });

      if (deployed.includes('package.json')) {
        try {
          fs.rmSync(path.join(DATA_DIR, 'node_modules', 'multer'), { recursive: true, force: true });
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
              timeout: 15000,
              headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(purgeData) }
            }, (res) => {
              let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
            });
            req.on('timeout', () => { req.destroy(); resolve('error:timeout'); });
            req.on('error', (e) => resolve('error:' + e.message));
            req.write(purgeData); req.end();
          });
          try { cfResult = JSON.parse(purgeResult).success ? 'purged' : 'failed'; } catch (_) { cfResult = 'parse-error'; }
        } else {
          cfResult = 'no-tokens';
        }
      } catch (e) { cfResult = 'error:' + e.message.slice(0, 50); }
      deployed.push('cf-cache:' + cfResult);

      _deployInProgress = false;
      res.json({ ok: true, deployed });
    } catch (e) {
      _deployInProgress = false;
      console.error('[deploy] error:', e.message);
      res.status(500).json({ ok: false, error: 'deploy failed' });
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
      const tmpFile = dataFile + '.tmp.' + process.pid + '.' + Date.now();
      fs.writeFileSync(tmpFile, JSON.stringify(accounts, null, 2));
      fs.renameSync(tmpFile, dataFile);
      res.json({ ok: true, email, secret_length: normalized.length });
    } catch (e) {
      console.error('[gauth-api] error:', e.message); res.status(500).json({ ok: false, error: 'internal error' });
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
          const fullPath = safePath(profilesDir, folder);
          if (!fullPath) continue;
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

  app.delete('/api/failed-accounts/:email', authMiddleware, (req, res) => {
    try {
      const email = (req.params.email || '').trim().toLowerCase();
      const failFile = path.join(DATA_DIR, 'failed_accounts.json');
      if (!fs.existsSync(failFile)) return res.json({ ok: true });
      const data = JSON.parse(fs.readFileSync(failFile, 'utf8'));
      const key = Object.keys(data).find(k => k.toLowerCase() === email);
      if (key) {
        delete data[key];
        const tmpFail = failFile + '.tmp.' + process.pid + '.' + Date.now();
        fs.writeFileSync(tmpFail, JSON.stringify(data, null, 2));
        fs.renameSync(tmpFail, failFile);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[gauth-api] error:', e.message); res.status(500).json({ ok: false, error: 'internal error' });
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
      const folder = emailToFolder(account.email);
      const profileDir = folder ? safePath(PROFILES_DIR, folder) : null;
      const hasSession = profileDir ? fs.existsSync(profileDir) : false;
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
      console.error('[gauth-api] error:', e.message); res.status(500).json({ error: 'internal error' });
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
          results.push({ email: a.email, password: a.password ? '***' : '', totp_secret: a.totp_secret ? '***' : '', recovery_email: a.recovery_email || '', source_file: a.source_file || '', source_mtime: a.source_mtime || 0, extra: a.extra || [], password_alts: (a.password_alts || []).length ? ['***'] : [] });
        }
      }
      res.json({ ok: true, query: q, total_accounts: accounts.length, found: results.length, results: results.slice(0, 50) });
    } catch (e) {
      console.error('[gauth-api] error:', e.message); res.status(500).json({ ok: false, error: 'internal error' });
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
    const emailKey = normalizeEmail(email);

    if (loginQueue.has(emailKey)) {
      const elapsed = Date.now() - loginQueue.get(emailKey);
      if (elapsed < LOGIN_TIMEOUT) {
        return res.status(409).json({ success: false, reason: 'LOGIN_IN_PROGRESS' });
      }
      loginQueue.delete(emailKey);
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

    loginQueue.set(emailKey, Date.now());
    let loginModule;
    try {
      loginModule = require(path.join(__dirname, 'advanced-google-login-v2.js'));
    } catch (e) {
      loginQueue.delete(emailKey);
      return res.status(500).json({ success: false, reason: 'LOGIN_MODULE_ERROR', error: e.message });
    }

    try {
      const result = await loginModule.advancedGoogleLogin(
        { email: account.email, password: account.password, twoFA: account.totp_secret || '' },
        { headless: false, timeout: 90000 }
      );
      loginQueue.delete(emailKey);
      if (result && result.success) {
        if (result.browser) try { await result.browser.close(); } catch (_) {}
        return res.json({ success: true, result: result.result });
      }
      if (result && result.browser) try { await result.browser.close(); } catch (_) {}
      return res.json({ success: false, reason: result ? result.result : 'UNKNOWN_ERROR' });
    } catch (e) {
      loginQueue.delete(emailKey);
      return res.status(500).json({ success: false, reason: 'LOGIN_EXCEPTION', error: e.message });
    }
  });

  const YT_TOKENS_FILE = path.join(DATA_DIR, 'youtube_tokens.json');

  function readYtTokens() {
    try { return JSON.parse(fs.readFileSync(YT_TOKENS_FILE, 'utf8')); } catch { return {}; }
  }
  function writeYtTokens(data) {
    const tmp = YT_TOKENS_FILE + '.tmp.' + process.pid + '.' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, YT_TOKENS_FILE);
  }

  app.get('/api/youtube/client-id', (req, res) => {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID || '';
    res.json({ client_id: clientId });
  });

  app.post('/api/youtube/save-token', authMiddleware, (req, res) => {
    try {
      const { email, access_token, expires_at } = req.body || {};
      if (!email || !access_token) return res.status(400).json({ ok: false, error: 'email and access_token required' });
      const tokens = readYtTokens();
      tokens[normalizeEmail(email)] = { access_token, expires_at: expires_at || (Date.now() + 3600000), saved_at: Date.now() };
      writeYtTokens(tokens);
      res.json({ ok: true });
    } catch (e) {
      console.error('[gauth-api] error:', e.message); res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  app.get('/api/youtube/token-status/:email', authMiddleware, (req, res) => {
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(req.params.email)];
    if (!t) return res.json({ connected: false });
    res.json({ connected: true, expires_at: t.expires_at, expired: Date.now() > t.expires_at });
  });

  app.post('/api/youtube/chat-message', authMiddleware, (req, res) => {
    const { email, liveChatId, message } = req.body || {};
    if (!email || !liveChatId || !message) return res.status(400).json({ ok: false, error: 'email, liveChatId, message required' });
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const https = require('https');
    const body = JSON.stringify({ snippet: { liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: message } } });
    const r = https.request({
      hostname: 'www.googleapis.com', path: '/youtube/v3/liveChat/messages?part=snippet',
      method: 'POST', timeout: 30000, headers: { 'Authorization': 'Bearer ' + t.access_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try { const j = JSON.parse(d); res.json({ ok: !j.error, data: j }); } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('timeout', () => { r.destroy(); if (!res.headersSent) res.status(504).json({ ok: false, error: 'upstream timeout' }); });
    r.on('error', e => { if (!res.headersSent) res.status(500).json({ ok: false, error: e.message }); });
    r.write(body); r.end();
  });

  app.get('/api/youtube/live-chat-id/:email', authMiddleware, (req, res) => {
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(req.params.email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const https = require('https');
    const r = https.request({
      hostname: 'www.googleapis.com', path: '/youtube/v3/liveBroadcasts?part=snippet,contentDetails,status&broadcastStatus=active&broadcastType=all',
      method: 'GET', timeout: 30000, headers: { 'Authorization': 'Bearer ' + t.access_token }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try {
          const j = JSON.parse(d);
          const items = (j.items || []).map(it => ({ title: (it.snippet || {}).title, liveChatId: (it.snippet || {}).liveChatId, videoId: it.id || '' }));
          res.json({ ok: true, broadcasts: items });
        } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('timeout', () => { r.destroy(); if (!res.headersSent) res.status(504).json({ ok: false, error: 'upstream timeout' }); });
    r.on('error', e => { if (!res.headersSent) res.status(500).json({ ok: false, error: e.message }); });
    r.end();
  });

  app.get('/api/youtube/chat-list/:email', authMiddleware, (req, res) => {
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(req.params.email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const liveChatId = req.query.liveChatId;
    if (!liveChatId) return res.status(400).json({ ok: false, error: 'liveChatId required' });
    const https = require('https');
    const r = https.request({
      hostname: 'www.googleapis.com', path: `/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=snippet,authorDetails&maxResults=200`,
      method: 'GET', timeout: 30000, headers: { 'Authorization': 'Bearer ' + t.access_token }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try {
          const j = JSON.parse(d);
          const msgs = (j.items || []).map(it => ({
            displayName: (it.authorDetails || {}).displayName,
            channelId: (it.authorDetails || {}).channelId,
            message: (it.snippet && it.snippet.textMessageDetails) ? it.snippet.textMessageDetails.messageText : '',
            publishedAt: (it.snippet || {}).publishedAt
          }));
          res.json({ ok: true, messages: msgs, pollingIntervalMillis: j.pollingIntervalMillis || 5000 });
        } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('timeout', () => { r.destroy(); if (!res.headersSent) res.status(504).json({ ok: false, error: 'upstream timeout' }); });
    r.on('error', e => { if (!res.headersSent) res.status(500).json({ ok: false, error: e.message }); });
    r.end();
  });

  app.post('/api/youtube/add-moderator', authMiddleware, (req, res) => {
    const { email, liveChatId, channelId } = req.body || {};
    if (!email || !liveChatId || !channelId) return res.status(400).json({ ok: false, error: 'email, liveChatId, channelId required' });
    const tokens = readYtTokens();
    const t = tokens[normalizeEmail(email)];
    if (!t || !t.access_token) return res.status(401).json({ ok: false, error: 'not connected' });
    const https = require('https');
    const body = JSON.stringify({ snippet: { liveChatId, moderatorDetails: { channelId } } });
    const r = https.request({
      hostname: 'www.googleapis.com', path: '/youtube/v3/liveChat/moderators?part=snippet',
      method: 'POST', timeout: 30000, headers: { 'Authorization': 'Bearer ' + t.access_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        try { const j = JSON.parse(d); res.json({ ok: !j.error, data: j }); } catch { res.json({ ok: false, raw: d }); }
      });
    });
    r.on('timeout', () => { r.destroy(); if (!res.headersSent) res.status(504).json({ ok: false, error: 'upstream timeout' }); });
    r.on('error', e => { if (!res.headersSent) res.status(500).json({ ok: false, error: e.message }); });
    r.write(body); r.end();
  });

  app.post('/api/fix-mtime', authMiddleware, (req, res) => {
    try {
      const accounts = safeReadJSON(DATA_FILE);
      let fixed = 0;
      for (const a of accounts) {
        if (!a.source_mtime || a.source_mtime < 1000000000000) {
          const sf = a.source_file || '';
          const tsMatch = sf.match(/up_(\d{13})_/);
          if (tsMatch) { a.source_mtime = parseInt(tsMatch[1]); }
          else { a.source_mtime = Date.now(); }
          fixed++;
        }
      }
      if (fixed > 0) {
        const tmp = DATA_FILE + '.tmp.' + process.pid + '.' + Date.now();
        fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2));
        fs.renameSync(tmp, DATA_FILE);
      }
      res.json({ ok: true, fixed, total: accounts.length });
    } catch (e) {
      console.error('[gauth-api] error:', e.message); res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  app.get('/api/parse-report', (req, res) => {
    try {
      const accounts = safeReadJSON(DATA_FILE);
      const fileCounts = {};
      for (const a of accounts) { const src = a.source_file || 'unknown'; fileCounts[src] = (fileCounts[src] || 0) + 1; }
      const byDate = {};
      for (const a of accounts) {
        if (!a.source_mtime || a.source_mtime < 1000000000000) continue;
        const d = new Date(a.source_mtime).toISOString().slice(0, 10);
        byDate[d] = (byDate[d] || 0) + 1;
      }
      const fileDetails = Object.entries(fileCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      res.json({ last_run: { files: Object.keys(fileCounts).length, total_master: accounts.length, by_date: byDate, file_details: fileDetails, updated_at: new Date().toISOString() } });
    } catch (e) { res.json({}); }
  });

  app.get('/codes/:secret', (req, res) => {
    try {
      let secret = String(req.params.secret || '').toUpperCase().replace(/[\s\-_=]/g, '').replace(/[^A-Z2-7]/g, '');
      if (secret.length < 16) return res.status(400).json({ error: 'invalid secret' });
      let authenticator;
      try { authenticator = require('otplib').authenticator; } catch (_) {}
      if (!authenticator) {
        try {
          const { generateSync } = require('otplib');
          return res.json({ code: generateSync(secret) });
        } catch (_) { return res.status(500).json({ error: 'otplib not available' }); }
      }
      const code = authenticator.generate(secret);
      const remaining = authenticator.timeRemaining();
      res.json({ code, remaining });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  const GOOGLE_USERS_FILE = path.join(DATA_DIR, 'google_users.json');

  function readGoogleUsers() {
    try { return JSON.parse(fs.readFileSync(GOOGLE_USERS_FILE, 'utf8')); } catch (_) { return []; }
  }
  function writeGoogleUsers(users) {
    const tmp = GOOGLE_USERS_FILE + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
    fs.renameSync(tmp, GOOGLE_USERS_FILE);
  }

  app.get('/api/auth/config', (_req, res) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    res.json({ client_id: clientId });
  });

  app.get('/api/auth/me', (req, res) => {
    const cookies = {};
    (req.headers.cookie || '').split(';').forEach(function(c) {
      const parts = c.trim().split('=');
      if (parts.length >= 2) cookies[parts[0]] = decodeURIComponent(parts.slice(1).join('='));
    });
    if (!cookies.gauth_uid) return res.json({ user: null });
    const users = readGoogleUsers();
    const u = users.find(function(x) { return x.sub === cookies.gauth_uid; });
    if (!u) return res.json({ user: null });
    res.json({ user: { email: u.email, name: u.name, sub: u.sub } });
  });

  app.post('/api/auth/google', (req, res) => {
    try {
      const { credential } = req.body || {};
      if (!credential) return res.status(400).json({ ok: false, error: 'missing credential' });
      const parts = credential.split('.');
      if (parts.length !== 3) return res.status(400).json({ ok: false, error: 'invalid token' });
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
      if (clientId && payload.aud !== clientId) return res.status(401).json({ ok: false, error: 'audience mismatch' });
      if (!payload.sub) return res.status(400).json({ ok: false, error: 'missing sub' });
      const users = readGoogleUsers();
      const existing = users.find(function(u) { return u.sub === payload.sub; });
      const userData = { sub: payload.sub, email: payload.email || '', name: payload.name || '', updated: new Date().toISOString() };
      if (existing) { Object.assign(existing, userData); } else { users.push(userData); }
      writeGoogleUsers(users);
      res.setHeader('Set-Cookie', 'gauth_uid=' + encodeURIComponent(payload.sub) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000');
      res.json({ ok: true, user: { email: userData.email, name: userData.name, sub: userData.sub } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[auto_deploy] routes registered: /api/accounts, /api/normalized-accounts, /api/profiles, /api/failed-accounts, /api/deploy, /api/update-secret, /api/lookup/:email, /api/search-account, /api/deploy-status, /api/login-one, /api/youtube/*, /api/fix-mtime, /api/parse-report, /codes/:secret, /api/auth/*');
};
