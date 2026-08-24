/**
 * second sub-site server v2.2
 * Google OAuth + YouTube channel lookup
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3023;
const DATA_DIR = __dirname;
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

app.use(express.json());
/* CORS for gauth aggregator (login-issues page)
   ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
   ref: https://fetch.spec.whatwg.org/#http-cors-protocol */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function readAccounts() {
  try {
    const d = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    return d.accounts || [];
  } catch { return []; }
}

function writeAccounts(accounts) {
  const tmp = ACCOUNTS_FILE + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify({ accounts }, null, 2));
  fs.renameSync(tmp, ACCOUNTS_FILE);
}

app.get('/api/second/client-id', (req, res) => {
  res.json({ client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID || '' });
});

app.get('/api/second/accounts', (req, res) => {
  res.json({ accounts: readAccounts() });
});

app.post('/api/second/accounts', (req, res) => {
  const { email, name, picture, channel_id, channel_title, subscriber_count, access_token } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'email required' });

  const accounts = readAccounts();
  const key = email.toLowerCase();
  const now = new Date().toISOString();
  const existing = accounts.find(a => (a.email || '').toLowerCase() === key);

  const accountData = {
    email,
    name: name || '',
    picture: picture || '',
    channel_id: channel_id || '',
    channel_title: channel_title || '',
    subscriber_count: subscriber_count || '0',
    status: 'active',
    logged_in_at: now,
    allocated_date: now.slice(0, 10),
  };

  if (existing) {
    Object.assign(existing, accountData);
  } else {
    accounts.unshift(accountData);
  }

  accounts.sort((a, b) => {
    const da = a.logged_in_at || '';
    const db = b.logged_in_at || '';
    return da > db ? -1 : da < db ? 1 : 0;
  });

  writeAccounts(accounts);
  res.json({ ok: true, total: accounts.length });
});

// LOGIN_ISSUE_PATCH_START — supports both POST and PATCH styles
app.post('/api/second/login-issue', (req, res) => {
  const { email, type, note } = req.body || {};
  if (!email || !type) return res.status(400).json({ ok: false, error: 'email and type required' });
  const validTypes = ['phone', 'robot', 'password', 'other'];
  if (!validTypes.includes(type)) return res.status(400).json({ ok: false, error: 'invalid type' });
  const accounts = readAccounts();
  const account = accounts.find(a => (a.email || '').toLowerCase() === email.toLowerCase());
  if (!account) return res.status(404).json({ ok: false, error: 'account not found' });
  account.login_issue = { type, note: (note || '').toString().slice(0, 200), marked_at: new Date().toISOString() };
  writeAccounts(accounts);
  res.json({ ok: true, login_issue: account.login_issue });
});

app.patch('/api/second/accounts/:email/login-issue', (req, res) => {
  const { type, note } = req.body || {};
  const validTypes = ['phone', 'robot', 'password', 'other', null];
  if (!validTypes.includes(type)) return res.status(400).json({ ok: false, error: 'invalid type' });
  const accounts = readAccounts();
  const acct = accounts.find(a => (a.email || '').toLowerCase() === req.params.email.toLowerCase());
  if (!acct) return res.status(404).json({ ok: false, error: 'not found' });
  if (type === null) delete acct.login_issue;
  else acct.login_issue = { type, note: (note || '').toString().slice(0, 200), marked_at: new Date().toISOString() };
  writeAccounts(accounts);
  res.json({ ok: true, login_issue: acct.login_issue || null });
});

app.delete('/api/second/login-issue/:email', (req, res) => {
  const accounts = readAccounts();
  const account = accounts.find(a => (a.email || '').toLowerCase() === req.params.email.toLowerCase());
  if (!account) return res.status(404).json({ ok: false, error: 'account not found' });
  delete account.login_issue;
  writeAccounts(accounts);
  res.json({ ok: true });
});

app.get('/api/second/login-issues', (req, res) => {
  const issues = readAccounts()
    .filter(a => a.login_issue && a.login_issue.type)
    .map(a => ({ email: a.email, name: a.name, picture: a.picture, channel_title: a.channel_title, login_issue: a.login_issue, site: 'second' }));
  res.json({ site: 'second', count: issues.length, issues });
});
// LOGIN_ISSUE_PATCH_END

app.delete('/api/second/accounts/:email', (req, res) => {
  const accounts = readAccounts();
  const key = req.params.email.toLowerCase();
  const filtered = accounts.filter(a => (a.email || '').toLowerCase() !== key);
  if (filtered.length === accounts.length) return res.status(404).json({ ok: false, error: 'not found' });
  writeAccounts(filtered);
  res.json({ ok: true, remaining: filtered.length });
});

app.listen(PORT, () => {
  console.log(`[second] listening on port ${PORT}`);
});
