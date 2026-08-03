/**
 * Excel parser for gauth accounts.
 *
 * 각 엑셀 파일마다 컬럼 순서가 다르고, 헤더가 없을 수도 있음.
 * 개인마다 다르게 정리하므로 공식 포맷이 없음.
 *
 * 전략:
 * 1) 헤더 행이 있으면 → 헤더로 매핑
 * 2) 헤더 없으면 → 컬럼 전체 데이터를 샘플링해서 각 컬럼의 타입을 판별
 *    - 이메일 컬럼: @가 포함된 xxx@xxx.xxx 패턴이 10%+ → email
 *    - TOTP 컬럼: Base32(A-Z2-7, 공백/하이픈 구분) 16~128자가 10%+ → totp
 *    - 복구이메일 컬럼: 이메일 패턴이지만 메인 이메일 컬럼이 아닌 것 → recovery
 *    - URL 컬럼: http/youtube 포함 20%+ → youtube
 *    - 나머지 → password (가장 먼저 발견된 미할당 컬럼)
 *
 * Deploy: copy to /opt/gauth-full/upload_excels.js on gucci-yanolza
 *
 * Refs:
 * - SheetJS sheet_to_json: https://github.com/SheetJS/sheetjs (raw:false returns formatted text, preserves leading zeros)
 * - SheetJS merged cells: worksheet['!merges'] array (https://github.com/SheetJS/sheetjs)
 * - Node.js fs: https://github.com/nodejs/node/blob/main/doc/api/fs.md
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ── helpers ──

function normalizeTotp(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[\s\-_=]/g, '').replace(/[^A-Z2-7]/g, '');
}

function isEmail(s) {
  return /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(String(s || '').trim());
}

function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase();
}

function isTotpLike(s) {
  if (!s) return false;
  s = String(s).trim();
  if (s.includes('@')) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (/[\/\\:;!#$%^&*()+=\[\]{}|<>?]/.test(s) && !/^[A-Z2-7]+=*$/i.test(s)) return false;
  const n = normalizeTotp(s);
  if (n.length < 16) return false;
  if (n.length > 128) return false;
  const raw = String(s).replace(/[\s\-_=]/g, '');
  if (raw.length > 0 && n.length / raw.length < 0.8) return false;
  return true;
}

function extractTotpFromUrl(s) {
  s = String(s || '').trim();
  const m = s.match(/[?&]secret=([A-Z2-7]+)/i);
  if (m) return m[1].toUpperCase();
  return null;
}

function isUrlLike(s) {
  s = String(s || '').trim();
  return /^https?:\/\//i.test(s) || /youtube\.com|youtu\.be/i.test(s);
}

function isOtpauthUrl(s) {
  return /^otpauth:\/\//i.test(String(s || '').trim());
}

// ── header detection ──

const HEADER_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|user|gmail|아이디|계정|이메일|메일)/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증|코드|시크릿)/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구|보조)/i,
  youtube:  /^(youtube|yt|url|link|channel|채널|주소)/i,
};

function detectHeaderMapping(row) {
  if (!Array.isArray(row)) return null;
  const mapping = {};
  let matched = 0;
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (!cell) continue;
    for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
      if (!mapping[field] && pattern.test(cell)) {
        if (field === 'email' && /^id$/i.test(cell)) continue;
        mapping[field] = i;
        matched++;
        break;
      }
    }
  }
  if (matched >= 2 && mapping.email !== undefined) return mapping;
  return null;
}

// ── merged cells expansion ──

function expandMergedCells(sheet) {
  const merges = sheet['!merges'];
  if (!merges || !merges.length) return;
  for (const merge of merges) {
    const startCell = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const val = sheet[startCell];
    if (!val) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!sheet[addr]) {
          sheet[addr] = { t: val.t, v: val.v, w: val.w };
        }
      }
    }
  }
}

// ── column-level type analysis (no header) ──

function analyzeColumns(rows) {
  if (!rows.length) return {};

  const maxCols = rows.reduce((mx, r) => Math.max(mx, (r && r.length) || 0), 0);
  if (maxCols === 0) return {};

  const stats = [];
  for (let c = 0; c < maxCols; c++) {
    const values = [];
    let emails = 0, totps = 0, urls = 0, nonEmpty = 0;
    for (let r = 0; r < rows.length; r++) {
      const v = String((rows[r] && rows[r][c]) || '').trim();
      if (!v) continue;
      nonEmpty++;
      values.push(v);
      if (isEmail(v)) emails++;
      if (isTotpLike(v) || isOtpauthUrl(v)) totps++;
      if (isUrlLike(v) && !isOtpauthUrl(v)) urls++;
    }
    stats.push({ col: c, nonEmpty, emails, totps, urls, values });
  }

  const mapping = {};
  const used = new Set();

  const emailCols = stats
    .filter(s => s.nonEmpty > 0 && s.emails / s.nonEmpty > 0.1)
    .sort((a, b) => {
      const rd = (b.emails / b.nonEmpty) - (a.emails / a.nonEmpty);
      return rd !== 0 ? rd : a.col - b.col;
    });

  if (!emailCols.length) return {};

  mapping.email = emailCols[0].col;
  used.add(emailCols[0].col);

  if (emailCols.length > 1) {
    mapping.recovery = emailCols[1].col;
    used.add(emailCols[1].col);
  }

  let bestTotp = null, bestTotpRatio = 0;
  for (const s of stats) {
    if (used.has(s.col) || s.nonEmpty === 0) continue;
    const ratio = s.totps / s.nonEmpty;
    if (ratio > bestTotpRatio && ratio > 0.1) {
      bestTotpRatio = ratio;
      bestTotp = s.col;
    }
  }
  if (bestTotp !== null) {
    mapping.totp = bestTotp;
    used.add(bestTotp);
  }

  let bestUrl = null, bestUrlRatio = 0;
  for (const s of stats) {
    if (used.has(s.col) || s.nonEmpty === 0) continue;
    const ratio = s.urls / s.nonEmpty;
    if (ratio > bestUrlRatio && ratio > 0.2) {
      bestUrlRatio = ratio;
      bestUrl = s.col;
    }
  }
  if (bestUrl !== null) {
    mapping.youtube = bestUrl;
    used.add(bestUrl);
  }

  // password: first unassigned column with data, but skip if it looks like a row-number/index column
  for (const s of stats) {
    if (used.has(s.col)) continue;
    if (s.nonEmpty > 0) {
      const allNumbers = s.values.every(v => /^\d+$/.test(v));
      const isSequential = allNumbers && s.values.length > 2 &&
        s.values.every((v, i) => i === 0 || parseInt(v) === parseInt(s.values[i-1]) + 1);
      if (isSequential) continue;
      mapping.password = s.col;
      used.add(s.col);
      break;
    }
  }

  return mapping;
}

// ── label-value pair detection ──

const LABEL_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|user|gmail|아이디|계정|이메일|메일)\s*[:：=]/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)\s*[:：=]/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증|코드|시크릿)\s*[:：=]/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구|보조)\s*[:：=]/i,
  youtube:  /^(youtube|yt|url|link|channel|채널|주소)\s*[:：=]/i,
};

function extractLabelValue(cell) {
  const s = String(cell || '').trim();
  for (const [field, pattern] of Object.entries(LABEL_PATTERNS)) {
    const m = s.match(pattern);
    if (m) return { field, value: s.slice(m[0].length).trim() };
  }
  return null;
}

function classifyValue(s) {
  s = String(s || '').trim();
  if (!s) return null;
  if (isEmail(s)) return 'email';
  if (isTotpLike(s)) return 'totp';
  if (isUrlLike(s)) return 'url';
  return 'unknown';
}

// ── vertical/stacked layout detection ──

function tryVerticalExtract(rows, sourceFile) {
  const maxCols = rows.reduce((mx, r) => Math.max(mx, (r && r.length) || 0), 0);

  const lvAccounts = tryLabelValueExtract(rows, maxCols, sourceFile);
  if (lvAccounts && lvAccounts.length) return lvAccounts;

  if (maxCols <= 4) {
    const stackedAccounts = tryStackedExtract(rows, maxCols, sourceFile);
    if (stackedAccounts && stackedAccounts.length) return stackedAccounts;
  }

  return null;
}

function tryLabelValueExtract(rows, maxCols, sourceFile) {
  let labelCount = 0;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const c0 = String((row[0]) || '').trim();
    if (extractLabelValue(c0)) { labelCount++; continue; }
    if (maxCols <= 2) {
      let found = false;
      for (let c = 0; c < (row.length || 0); c++) {
        if (extractLabelValue(String(row[c] || '').trim())) { labelCount++; found = true; break; }
      }
      if (found) continue;
    }
    if (maxCols === 2 && row.length >= 2) {
      const label = String((row[0]) || '').trim();
      for (const [, pattern] of Object.entries(HEADER_PATTERNS)) {
        if (pattern.test(label)) { labelCount++; break; }
      }
    }
  }
  if (labelCount < 2) return null;

  const accounts = [];
  let cur = {};

  function flushCur() {
    if (cur.email && isEmail(cur.email)) {
      let totpVal = cur.totp || '';
      if (isOtpauthUrl(totpVal)) {
        totpVal = extractTotpFromUrl(totpVal) || totpVal;
      }
      accounts.push({
        email: cur.email,
        password: cur.password || '',
        totp_secret: isTotpLike(totpVal) ? normalizeTotp(totpVal) : totpVal,
        recovery_email: cur.recovery || '',
        youtube_url: cur.youtube || '',
        extra: [],
        source_file: sourceFile || 'unknown',
      });
    }
    cur = {};
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) { flushCur(); continue; }

    const allEmpty = row.every(c => !String(c || '').trim());
    if (allEmpty) { flushCur(); continue; }

    let found = false;
    for (let c = 0; c < (row.length || 0); c++) {
      const cell = String(row[c] || '').trim();
      const lv = extractLabelValue(cell);
      if (lv) {
        let val = lv.value;
        if (!val && c + 1 < row.length) val = String(row[c + 1] || '').trim();
        if (lv.field === 'email' && cur.email && isEmail(cur.email)) flushCur();
        cur[lv.field] = val;
        found = true;
        break;
      }
    }

    if (!found && maxCols === 2) {
      const label = String((row[0]) || '').trim();
      const value = String((row[1]) || '').trim();
      for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
        if (pattern.test(label)) {
          if (field === 'email' && cur.email && isEmail(cur.email)) flushCur();
          cur[field] = value;
          found = true;
          break;
        }
      }
    }
  }
  flushCur();
  return accounts.length ? accounts : null;
}

function tryStackedExtract(rows, maxCols, sourceFile) {
  if (maxCols > 4) return null;

  const values = [];
  for (const row of rows) {
    if (!row) { values.push(null); continue; }
    const allEmpty = row.every(c => !String(c || '').trim());
    if (allEmpty) { values.push(null); continue; }
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (v) values.push(v);
    }
  }

  const accounts = [];
  let cur = null;
  let afterBlank = false;

  for (const v of values) {
    if (v === null) {
      if (cur && cur.email) accounts.push(cur);
      cur = null;
      afterBlank = true;
      continue;
    }
    if (isEmail(v)) {
      if (cur && cur.email && !cur.recovery && (cur.password || cur.totp) && cur._hasBlankBefore) {
        cur.recovery = v;
        continue;
      }
      if (cur && cur.email) accounts.push(cur);
      cur = { email: v, password: '', totp: '', recovery: '', youtube: '', extra: [], _hasBlankBefore: afterBlank, source_file: sourceFile || 'unknown' };
      afterBlank = false;
      continue;
    }

    if (!cur) continue;

    if ((isTotpLike(v) || isOtpauthUrl(v)) && !cur.totp) {
      cur.totp = isOtpauthUrl(v) ? (extractTotpFromUrl(v) || v) : v;
    }
    else if (isUrlLike(v) && !cur.youtube) { cur.youtube = v; }
    else if (isEmail(v) && !cur.recovery) { cur.recovery = v; }
    else if (!cur.password) { cur.password = v; }
    else { cur.extra.push(v); }
  }
  if (cur && cur.email) accounts.push(cur);

  if (accounts.length < 1) return null;

  return accounts.map(a => ({
    email: a.email,
    password: a.password || '',
    totp_secret: a.totp && isTotpLike(a.totp) ? normalizeTotp(a.totp) : (a.totp || ''),
    recovery_email: a.recovery || '',
    youtube_url: a.youtube || '',
    extra: a.extra || [],
    source_file: a.source_file,
  }));
}

// ── brute-force fallback: scan every cell for emails ──

function bruteForceExtract(rows, sourceFile) {
  const seen = new Set();
  const accounts = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (!isEmail(v)) continue;
      const key = normalizeEmail(v);
      if (seen.has(key)) continue;
      seen.add(key);
      const rest = [];
      for (let c2 = 0; c2 < row.length; c2++) {
        if (c2 === c) continue;
        const rv = String(row[c2] || '').trim();
        if (rv) rest.push(rv);
      }
      let password = '', totp_secret = '', recovery = '', youtube = '';
      const passwordCandidates = [];
      for (const rv of rest) {
        if (!totp_secret && isOtpauthUrl(rv)) { totp_secret = extractTotpFromUrl(rv) || normalizeTotp(rv); }
        else if (!totp_secret && isTotpLike(rv)) { totp_secret = normalizeTotp(rv); }
        else if (!youtube && isUrlLike(rv)) { youtube = rv; }
        else if (!recovery && isEmail(rv)) { recovery = rv; }
        else { passwordCandidates.push(rv); }
      }
      if (passwordCandidates.length > 0) {
        const real = passwordCandidates.find(p => !/^\d{1,4}$/.test(p));
        password = real || passwordCandidates[passwordCandidates.length - 1];
      }
      accounts.push({ email: v, password, totp_secret, recovery_email: recovery, youtube_url: youtube, extra: [], source_file: sourceFile || 'unknown' });
    }
  }
  return accounts;
}

// ── main extraction ──

function extractAccountsFromSheet(sheet, sourceFile) {
  expandMergedCells(sheet);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) return [];

  let mapping = null;
  let startRow = 0;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const m = detectHeaderMapping(rows[i]);
    if (m) {
      mapping = m;
      startRow = i + 1;
      break;
    }
  }

  if (!mapping) {
    const vertAccounts = tryVerticalExtract(rows, sourceFile);
    if (vertAccounts && vertAccounts.length) return vertAccounts;
  }

  if (!mapping) {
    let sampleStart = 0;
    if (rows.length > 1) {
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const firstCell = String((rows[i] && rows[i][0]) || '').trim();
        if (firstCell && !isEmail(firstCell) && !Object.values(HEADER_PATTERNS).some(p => p.test(firstCell))) {
          sampleStart = i + 1;
        } else {
          break;
        }
      }
    }

    const sampleRows = rows.slice(sampleStart);
    mapping = analyzeColumns(sampleRows);
    startRow = sampleStart;

    if (!mapping || mapping.email === undefined) {
      return bruteForceExtract(rows, sourceFile);
    }
  }

  const accounts = [];
  const usedCols = new Set(Object.values(mapping));

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;

    const email = String(row[mapping.email] || '').trim();
    if (!isEmail(email)) continue;

    const password = mapping.password !== undefined ? String(row[mapping.password] || '').trim() : '';
    let totpRaw = mapping.totp !== undefined ? String(row[mapping.totp] || '').trim() : '';
    const recovery = mapping.recovery !== undefined ? String(row[mapping.recovery] || '').trim() : '';
    const youtube = mapping.youtube !== undefined ? String(row[mapping.youtube] || '').trim() : '';

    if (isOtpauthUrl(totpRaw)) {
      totpRaw = extractTotpFromUrl(totpRaw) || totpRaw;
    }

    const extra = [];
    for (let c = 0; c < row.length; c++) {
      if (usedCols.has(c)) continue;
      const v = String(row[c] || '').trim();
      if (v) extra.push(v);
    }

    accounts.push({
      email,
      password,
      totp_secret: isTotpLike(totpRaw) ? normalizeTotp(totpRaw) : totpRaw,
      recovery_email: recovery,
      youtube_url: youtube,
      extra,
      source_file: sourceFile || 'unknown',
    });
  }
  return accounts;
}

function parseExcelFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const allAccounts = [];
  const baseName = path.basename(filePath);

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    for (const k of Object.keys(sheet)) {
      if (k[0] === '!') continue;
      const c = sheet[k];
      if (c && c.l && c.l.Target && /^mailto:/i.test(String(c.l.Target))) {
        const t = String(c.l.Target).replace(/^mailto:/i, '').replace(/\?.*$/, '');
        const cv = String(c.v || '').trim();
        if (t.includes('@') && (!cv || cv === t.split('@')[0] || cv.toLowerCase() === t.toLowerCase())) {
          c.v = t; c.w = t;
        }
      }
    }
    const accounts = extractAccountsFromSheet(sheet, baseName);
    allAccounts.push(...accounts);
  }

  return allAccounts;
}

function parseMultipleFiles(filePaths) {
  const allAccounts = [];
  const report = { files: [], total_parsed: 0, errors: [] };

  for (const fp of filePaths) {
    try {
      const accounts = parseExcelFile(fp);
      allAccounts.push(...accounts);
      report.files.push({ file: path.basename(fp), count: accounts.length });
      report.total_parsed += accounts.length;
    } catch (e) {
      report.errors.push({ file: path.basename(fp), error: e.message });
    }
  }

  return { accounts: allAccounts, report };
}

function mountRoutes(app) {
  if (!app || typeof app.post !== 'function') return;

  const multer = (() => { try { return require('multer'); } catch(e) { return null; } })();
  if (!multer) { console.log('upload_excels: multer not installed, upload routes skipped'); return; }

  const uploadDir = path.join(__dirname, 'uploads') + '/';
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch(e) { console.error('[upload_excels] mkdirSync failed:', e.message); }
  const upload = multer({ dest: uploadDir, limits: { fileSize: 200 * 1024 * 1024 } });

  let _fileLock = Promise.resolve();
  function withFileLock(fn) {
    _fileLock = _fileLock.then(fn, fn);
    return _fileLock;
  }

  const crypto = require('crypto');
  function uploadAuthMiddleware(req, res, next) {
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

  app.post('/api/upload-excels', (req, res, next) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    upload.array('files', 50)(req, res, (err) => {
      if (err) {
        console.error('[upload-excels] multer error:', err);
        return res.status(500).json({ ok: false, error: 'upload failed: ' + err.message });
      }
      next();
    });
  }, (req, res) => {
    if (!req.files || !req.files.length) return res.status(400).json({ ok: false, error: 'no files' });

    const parsedFiles = [];
    for (const f of req.files) {
      try {
        const accounts = parseExcelFile(f.path);
        parsedFiles.push({ name: f.originalname, accounts });
      } catch(e) {
        parsedFiles.push({ name: f.originalname, accounts: [], error: e.message });
      }
      try { fs.unlinkSync(f.path); } catch(e) { console.warn('[upload_excels] temp file cleanup failed:', f.path, e.message); }
      if (global.gc) global.gc();
    }

    withFileLock(() => {
      try {
        const dataFile = '/opt/gauth-full/accounts_normalized.json';
        let existing = [];
        try { const d = JSON.parse(fs.readFileSync(dataFile, 'utf8')); existing = Array.isArray(d) ? d : (d.accounts || []); } catch(e) {}
        const byEmail = {};
        for (const a of existing) {
          if (a && a.email) byEmail[normalizeEmail(a.email)] = a;
        }

        const files = [];
        let totalParsed = 0, totalAdded = 0, totalUpdated = 0;
        for (const pf of parsedFiles) {
          if (pf.error) { files.push({ name: pf.name, accounts: 0, error: pf.error }); continue; }
          let added = 0, updated = 0;
          for (const a of pf.accounts) {
            if (!a.email) continue;
            const key = normalizeEmail(a.email);
            if (byEmail[key]) {
              const e = byEmail[key];
              if (a.password) e.password = a.password;
              if (a.totp_secret && isTotpLike(a.totp_secret)) e.totp_secret = normalizeTotp(a.totp_secret);
              if (a.recovery_email) e.recovery_email = a.recovery_email;
              if (a.youtube_url) e.youtube_url = a.youtube_url;
              updated++;
            } else {
              byEmail[key] = a;
              added++;
            }
          }
          totalParsed += pf.accounts.length;
          totalAdded += added;
          totalUpdated += updated;
          files.push({ name: pf.name, accounts: pf.accounts.length, added, updated });
        }

        const allAccounts = Object.values(byEmail);
        const tmpFile = dataFile + '.tmp.' + process.pid;
        fs.writeFileSync(tmpFile, JSON.stringify(allAccounts, null, 2));
        fs.renameSync(tmpFile, dataFile);
        res.json({ ok: true, total_master: allAccounts.length, total_parsed: totalParsed, added: totalAdded, updated: totalUpdated, files, conflicts_count: 0, conflicts: [] });
      } catch(e) {
        console.error('[upload-excels] error:', e);
        if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
      }
    });
  });
}

const _exports = mountRoutes;
_exports.parseExcelFile = parseExcelFile;
_exports.parseMultipleFiles = parseMultipleFiles;
_exports.extractAccountsFromSheet = extractAccountsFromSheet;
_exports.normalizeTotp = normalizeTotp;
_exports.isTotpLike = isTotpLike;
_exports.isEmail = isEmail;
_exports.normalizeEmail = normalizeEmail;
_exports.analyzeColumns = analyzeColumns;
_exports.classifyValue = classifyValue;
_exports.extractLabelValue = extractLabelValue;
_exports.tryVerticalExtract = tryVerticalExtract;
_exports.tryStackedExtract = tryStackedExtract;
_exports.tryLabelValueExtract = tryLabelValueExtract;
_exports.bruteForceExtract = bruteForceExtract;
_exports.expandMergedCells = expandMergedCells;
_exports.extractTotpFromUrl = extractTotpFromUrl;
module.exports = _exports;
