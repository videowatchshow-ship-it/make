/* gauth API routes — Express 모듈
 * ref: https://github.com/expressjs/express/blob/master/lib/router/index.js
 * ref: https://github.com/nodejs/node/blob/main/doc/api/child_process.md#child_processexecfilesyncfile-args-options
 * ref: https://github.com/nodejs/node/blob/main/doc/api/fs.md
 * ref: https://github.com/nodejs/node/blob/main/doc/api/crypto.md */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

  app.post('/api/deploy', authMiddleware, (req, res) => {
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
      const account = accounts.find(a => (a.email || '').toLowerCase() === email.toLowerCase());
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
      const email = (req.params.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email required' });
      const dataFile = DATA_FILE;
      const accounts = safeReadJSON(dataFile);
      const account = accounts.find(a => (a.email || '').toLowerCase() === email);
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
      account = accounts.find(a => (a.email || '').toLowerCase() === email.toLowerCase());
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

  console.log('[auto_deploy] routes registered: /api/accounts, /api/normalized-accounts, /api/profiles, /api/failed-accounts, /api/deploy, /api/update-secret, /api/lookup/:email, /api/search-account, /api/deploy-status, /api/login-one');
};
