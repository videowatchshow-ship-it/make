const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = function(app) {
  app.post('/api/deploy', (req, res) => {
    try {
      const branch = req.body && req.body.branch || 'claude/gauth-frontend-backend-fixes-cg2icv';
      const repoDir = '/tmp/gauth-deploy-repo';
      const gauthDir = '/opt/gauth-full';
      const frontendDir = '/var/www/sites/gauth/public';

      if (fs.existsSync(repoDir)) {
        execSync('rm -rf ' + repoDir);
      }

      execSync(
        `git clone --depth 1 --branch "${branch}" https://github.com/videowatchshow-ship-it/make ${repoDir}`,
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

      execSync('rm -rf ' + repoDir);

      // npm install if package.json was updated
      if (deployed.includes('package.json')) {
        try {
          execSync('cd /opt/gauth-full && npm install --production', { timeout: 120000 });
          deployed.push('npm-install-ok');
        } catch (e) {
          deployed.push('npm-install-failed:' + e.message.slice(0, 100));
        }
      }

      // Restart gauth service
      try {
        execSync('sudo systemctl restart gauth', { timeout: 30000 });
        deployed.push('service-restarted');
      } catch (e) {
        deployed.push('restart-failed:' + e.message.slice(0, 100));
      }

      res.json({ ok: true, deployed });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/deploy-status', (req, res) => {
    const checks = {};
    try { checks.chrome = execSync('which google-chrome-stable 2>/dev/null || which chromium 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (e) { checks.chrome = 'not-found'; }
    try { checks.xvfb = execSync('pgrep -f "Xvfb :99" >/dev/null 2>&1 && echo running || echo stopped', { encoding: 'utf8' }).trim(); } catch (e) { checks.xvfb = 'unknown'; }
    try { checks.node = execSync('node -v', { encoding: 'utf8' }).trim(); } catch (e) { checks.node = 'not-found'; }
    try { checks.display = process.env.DISPLAY || 'not-set'; } catch (e) { checks.display = 'error'; }
    res.json(checks);
  });
};
