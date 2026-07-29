/**
 * Auto-deploy endpoint for gauth server.
 * Add this to rebrowser-login.js:
 *   require('./auto_deploy.js')(app);
 *
 * Then hit POST /api/deploy to pull latest code and restart.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = function(app) {
  app.post('/api/deploy', (req, res) => {
    try {
      const repoDir = '/tmp/gauth-deploy-repo';
      const gauthDir = '/opt/gauth-full';
      const frontendDir = '/var/www/sites/gauth/public';

      if (fs.existsSync(repoDir)) {
        execSync(`rm -rf ${repoDir}`);
      }

      execSync(`git clone --depth 1 https://github.com/videowatchshow-ship-it/make ${repoDir}`, { timeout: 30000 });

      const parserSrc = path.join(repoDir, 'gauth/upload_excels.js');
      const frontendSrc = path.join(repoDir, 'gauth/index.html');
      const deployed = [];

      if (fs.existsSync(parserSrc)) {
        fs.copyFileSync(parserSrc, path.join(gauthDir, 'upload_excels.js'));
        deployed.push('upload_excels.js');
      }

      if (fs.existsSync(frontendSrc)) {
        fs.copyFileSync(frontendSrc, path.join(frontendDir, 'index.html'));
        deployed.push('index.html');
      }

      execSync('rm -rf ' + repoDir);

      res.json({ ok: true, deployed, message: 'Deploy complete. Restart service to apply parser changes.' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
};
