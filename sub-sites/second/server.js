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
