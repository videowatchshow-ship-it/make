/**
 * Excel parser for gauth accounts.
 *
 * 각 엑셀 파일마다 컬럼 순서가 다르고, 헤더가 없을 수도 있음.
 * 개인마다 다르게 정리하므로 공식 포맷이 없음.
 *
 * 전략:
 * 1) 헤더 행이 있으면 → 헤더로 매핑
 * 2) 헤더 없으면 → 컬럼 전체 데이터를 샘플링해서 각 컬럼의 타입을 판별
 *    - 이메일 컬럼: @가 포함된 xxx@xxx.xxx 패턴이 70%+ → email
 *    - TOTP 컬럼: Base32(A-Z2-7, 공백/하이픈 구분) 16~128자가 60%+ → totp
 *    - 복구이메일 컬럼: 이메일 패턴이지만 메인 이메일 컬럼이 아닌 것 → recovery
 *    - URL 컬럼: http/youtube 포함 50%+ → youtube
 *    - 나머지 → password (가장 먼저 발견된 미할당 컬럼)
 *
 * Deploy: copy to /opt/gauth-full/upload_excels.js on gucci-yanolza
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ── helpers ──

function normalizeTotp(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[\s\-_]/g, '').replace(/[^A-Z2-7]/g, '');
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function isTotpLike(s) {
  if (!s) return false;
  s = String(s).trim();
  if (s.includes('@')) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (/[\/\\:;!#$%^&*()=+\[\]{}|<>?]/.test(s)) return false;
  const n = normalizeTotp(s);
  return n.length >= 16 && n.length <= 128;
}

function isUrlLike(s) {
  s = String(s || '').trim();
  return /^https?:\/\//i.test(s) || /youtube\.com|youtu\.be/i.test(s);
}

// ── header detection ──

const HEADER_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|user|gmail|id|아이디|계정|메일)/i,
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
        mapping[field] = i;
        matched++;
        break;
      }
    }
  }
  if (matched >= 2 && mapping.email !== undefined) return mapping;
  return null;
}

// ── column-level type analysis (no header) ──

function analyzeColumns(rows) {
  if (!rows.length) return {};

  const maxCols = Math.max(...rows.map(r => (r && r.length) || 0));
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
      if (isTotpLike(v)) totps++;
      if (isUrlLike(v)) urls++;
    }
    stats.push({ col: c, nonEmpty, emails, totps, urls, values });
  }

  const mapping = {};
  const used = new Set();

  // 1. find ALL email-like columns (>50% email pattern)
  const emailCols = stats
    .filter(s => s.nonEmpty > 0 && s.emails / s.nonEmpty > 0.5)
    .sort((a, b) => {
      const rd = (b.emails / b.nonEmpty) - (a.emails / a.nonEmpty);
      return rd !== 0 ? rd : a.col - b.col;
    });

  if (!emailCols.length) return {};

  // first email column = main email (by ratio, then by position)
  mapping.email = emailCols[0].col;
  used.add(emailCols[0].col);

  // second email column = recovery
  if (emailCols.length > 1) {
    mapping.recovery = emailCols[1].col;
    used.add(emailCols[1].col);
  }

  // 3. totp column: highest totp ratio, >40%
  let bestTotp = null, bestTotpRatio = 0;
  for (const s of stats) {
    if (used.has(s.col) || s.nonEmpty === 0) continue;
    const ratio = s.totps / s.nonEmpty;
    if (ratio > bestTotpRatio && ratio > 0.4) {
      bestTotpRatio = ratio;
      bestTotp = s.col;
    }
  }
  if (bestTotp !== null) {
    mapping.totp = bestTotp;
    used.add(bestTotp);
  }

  // 4. youtube/url column: >30%
  let bestUrl = null, bestUrlRatio = 0;
  for (const s of stats) {
    if (used.has(s.col) || s.nonEmpty === 0) continue;
    const ratio = s.urls / s.nonEmpty;
    if (ratio > bestUrlRatio && ratio > 0.3) {
      bestUrlRatio = ratio;
      bestUrl = s.col;
    }
  }
  if (bestUrl !== null) {
    mapping.youtube = bestUrl;
    used.add(bestUrl);
  }

  // 5. password: first unassigned column with data
  for (const s of stats) {
    if (used.has(s.col)) continue;
    if (s.nonEmpty > 0) {
      mapping.password = s.col;
      used.add(s.col);
      break;
    }
  }

  return mapping;
}

// ── label-value pair detection ──

const LABEL_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|user|gmail|id|아이디|계정|메일)\s*[:：]/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)\s*[:：]/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증|코드|시크릿)\s*[:：]/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구|보조)\s*[:：]/i,
  youtube:  /^(youtube|yt|url|link|channel|채널|주소)\s*[:：]/i,
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
  const maxCols = Math.max(...rows.map(r => (r && r.length) || 0));
  if (maxCols > 3) return null;

  // Case 1: label-value pairs in 2 columns (label in col 0, value in col 1)
  // Case 2: label:value in single column
  // Case 3: stacked single column (email, password, totp in consecutive rows)

  const accounts = [];

  // try label-value pair extraction first
  const lvAccounts = tryLabelValueExtract(rows, maxCols, sourceFile);
  if (lvAccounts && lvAccounts.length) return lvAccounts;

  // try stacked single/dual column (consecutive rows grouped by blank-line or by email detection)
  const stackedAccounts = tryStackedExtract(rows, maxCols, sourceFile);
  if (stackedAccounts && stackedAccounts.length) return stackedAccounts;

  return null;
}

function tryLabelValueExtract(rows, maxCols, sourceFile) {
  let labelCount = 0;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    // check col 0 for "label: value" pattern
    const c0 = String((row[0]) || '').trim();
    if (extractLabelValue(c0)) { labelCount++; continue; }
    // check if single-cell has "label: value"
    if (maxCols <= 2) {
      let found = false;
      for (let c = 0; c < (row.length || 0); c++) {
        if (extractLabelValue(String(row[c] || '').trim())) { labelCount++; found = true; break; }
      }
      if (found) continue;
    }
    // 2-col: col0 matches HEADER_PATTERNS (no colon), col1 = value
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
      accounts.push({
        email: cur.email,
        password: cur.password || '',
        totp_secret: cur.totp && isTotpLike(cur.totp) ? normalizeTotp(cur.totp) : (cur.totp || ''),
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
        // value might be in next column
        let val = lv.value;
        if (!val && c + 1 < row.length) val = String(row[c + 1] || '').trim();
        if (lv.field === 'email' && cur.email && isEmail(cur.email)) flushCur();
        cur[lv.field] = val;
        found = true;
        break;
      }
    }

    // 2-col label-value: col0=label text (no colon), col1=value — matched by HEADER_PATTERNS
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
  if (maxCols > 3) return null;

  // collect all non-empty values in reading order
  const values = [];
  for (const row of rows) {
    if (!row) { values.push(null); continue; } // blank row = separator
    const allEmpty = row.every(c => !String(c || '').trim());
    if (allEmpty) { values.push(null); continue; }
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (v) values.push(v);
    }
  }

  // group by: start new account on each email found
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

    // classify and assign to first empty matching slot
    if (isTotpLike(v) && !cur.totp) { cur.totp = v; }
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

// ── main extraction ──

function extractAccountsFromSheet(sheet, sourceFile) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return [];

  let mapping = null;
  let startRow = 0;

  // try header detection in first 5 rows
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const m = detectHeaderMapping(rows[i]);
    if (m) {
      mapping = m;
      startRow = i + 1;
      break;
    }
  }

  // no header → try vertical/stacked layout (1~2 columns, label-value pairs, etc.)
  if (!mapping) {
    const maxCols = Math.max(...rows.map(r => (r && r.length) || 0));
    if (maxCols <= 3) {
      const vertAccounts = tryVerticalExtract(rows, sourceFile);
      if (vertAccounts && vertAccounts.length) return vertAccounts;
    }
  }

  // no header → analyze column data (standard horizontal layout)
  if (!mapping) {
    let sampleStart = 0;
    if (rows.length > 1) {
      const firstCell = String((rows[0] && rows[0][0]) || '').trim();
      if (firstCell && !isEmail(firstCell)) {
        sampleStart = 1;
      }
    }

    const sampleRows = rows.slice(sampleStart, sampleStart + Math.min(100, rows.length));
    mapping = analyzeColumns(sampleRows);
    startRow = sampleStart;

    if (!mapping || mapping.email === undefined) {
      return [];
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
    const totpRaw = mapping.totp !== undefined ? String(row[mapping.totp] || '').trim() : '';
    const recovery = mapping.recovery !== undefined ? String(row[mapping.recovery] || '').trim() : '';
    const youtube = mapping.youtube !== undefined ? String(row[mapping.youtube] || '').trim() : '';

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
    // Restore hyperlink emails (mailto:xxx@gmail.com) that SheetJS strips to display text only
    for (const k of Object.keys(sheet)) {
      if (k[0] === '!') continue;
      const c = sheet[k];
      if (c && c.l && c.l.Target) {
        const t = String(c.l.Target).replace(/^mailto:/i, '');
        if (t.includes('@') && !String(c.v || '').includes('@')) {
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

module.exports = { parseExcelFile, parseMultipleFiles, extractAccountsFromSheet, normalizeTotp, isTotpLike, isEmail, analyzeColumns, classifyValue, extractLabelValue, tryVerticalExtract, tryStackedExtract, tryLabelValueExtract };
