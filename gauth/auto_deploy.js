const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || (req.query && req.query.token) || '';
  const expected = process.env.GAUTH_API_TOKEN || '';
  if (!expected) return res.status(503).json({ ok: false, error: 'GAUTH_API_TOKEN not configured' });
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (!token || tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
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
  app.post('/api/deploy', authMiddleware, (req, res) => {
    try {
      const rawBranch = req.body && req.body.branch || 'claude/gauth-frontend-backend-fixes-cg2icv';
      const branch = rawBranch.replace(/[^a-zA-Z0-9\/_\-\.]/g, '');
      const repoDir = '/tmp/gauth-deploy-repo';
      const gauthDir = '/opt/gauth-full';
      const frontendDir = '/var/www/sites/gauth/public';

      if (fs.existsSync(repoDir)) {
        execFileSync('rm', ['-rf', repoDir]);
      }

      execFileSync('git', ['clone', '--depth', '1', '--branch', branch,
        'https://github.com/videowatchshow-ship-it/make', repoDir],
        { timeout: 60000 }
      );

      const fileMappings = [
        { src: 'gauth/upload_excels.js', dst: path.join(gauthDir, 'upload_excels.js') },
        { src: 'gauth/auto_deploy.js', dst: path.join(gauthDir, 'auto_deploy.js') },
        { src: 'gauth/index.html', dst: path.join(frontendDir, 'index.html') },
        { src: 'gauth/xlsx.core.min.js', dst: path.join(frontendDir, 'xlsx.core.min.js') },
        { src: 'advanced-google-login-v2.js', dst: path.join(gauthDir, 'advanced-google-login-v2.js') },
        { src: 'package.json', dst: path.join(gauthDir, 'package.json') },
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
          execSync('cd /opt/gauth-full && npm install --production', { timeout: 120000 });
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
      const normalized = String(totp_secret).toUpperCase().replace(/[\s\-_=]/g, '').replace(/[^A-Z2-7]/g, '');
      if (normalized.length < 16) return res.status(400).json({ ok: false, error: 'secret too short (min 16 Base32 chars)' });
      if (normalized.length !== 16 && normalized.length !== 32 && normalized.length !== 52 && normalized.length !== 64) {
        console.log(`Warning: secret length ${normalized.length} is non-standard (expected 16 or 32)`);
      }
      const dataFile = '/opt/gauth-full/accounts_normalized.json';
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

  app.get('/api/search-account', authMiddleware, (req, res) => {
    try {
      const q = (req.query.q || '').trim().toLowerCase();
      if (!q || q.length < 3) return res.status(400).json({ ok: false, error: 'query too short (min 3 chars)' });
      const dataFile = '/opt/gauth-full/accounts_normalized.json';
      const accounts = safeReadJSON(dataFile);
      const results = [];
      for (const a of accounts) {
        const email = (a.email || '').toLowerCase();
        const extra = JSON.stringify(a.extra || []).toLowerCase();
        if (email.includes(q) || extra.includes(q)) {
          results.push({ email: a.email, password: a.password ? '***' : '', totp_secret: a.totp_secret || '', source_file: a.source_file || '', extra: a.extra || [] });
        }
      }
      res.json({ ok: true, query: q, total_accounts: accounts.length, found: results.length, results: results.slice(0, 50) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/deploy-status', authMiddleware, (req, res) => {
    const checks = {};
    try { checks.chrome = execSync('which google-chrome-stable 2>/dev/null || which chromium 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (e) { checks.chrome = 'not-found'; }
    try { checks.xvfb = execSync('pgrep -f "Xvfb :99" >/dev/null 2>&1 && echo running || echo stopped', { encoding: 'utf8' }).trim(); } catch (e) { checks.xvfb = 'unknown'; }
    try { checks.node = execSync('node -v', { encoding: 'utf8' }).trim(); } catch (e) { checks.node = 'not-found'; }
    try { checks.display = process.env.DISPLAY || 'not-set'; } catch (e) { checks.display = 'error'; }
    res.json(checks);
  });

  const loginQueue = new Map();
  const LOGIN_TIMEOUT = 120000;
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

    const dataFile = '/opt/gauth-full/accounts_normalized.json';
    let account;
    try {
      const accounts = safeReadJSON(dataFile);
      account = accounts.find(a => a.email === email);
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

  console.log('[auto_deploy] 5 routes registered: /api/deploy, /api/update-secret, /api/search-account, /api/deploy-status, /api/login-one');
};
