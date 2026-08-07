/**
 * Excel parser for gauth accounts.
 *
 * ref: https://docs.sheetjs.com/ (xlsx)
 * ref: https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3.1.3 (email 254 char limit)
 * ref: https://github.com/nickvdyck/totp-generator (Base32 TOTP)
 * ref: https://github.com/nickvdyck/totp-generator#totp-uri (otpauth:// URI)
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ── helpers ──

function normalizeTotp(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[\s\-_]/g, '').replace(/[^A-Z2-7]/g, '');
}

function normalizeEmail(s) {
  if (!s) return '';
  s = String(s).trim().toLowerCase();
  // mailto: 링크 제거
  s = s.replace(/^mailto:/i, '');
  // 다중 @ 처리 — 유효 이메일은 @ 1개만
  const atCount = (s.match(/@/g) || []).length;
  if (atCount !== 1) return '';
  return s;
}

function isEmail(s) {
  s = String(s || '').trim();
  // ref: RFC 5321 §4.5.3.1.3 — 전체 주소 254자 이하
  if (s.length > 254) return false;
  // mailto: 제거 후 체크
  s = s.replace(/^mailto:/i, '');
  if ((s.match(/@/g) || []).length !== 1) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function isPhoneNumber(s) {
  if (!s) return false;
  s = String(s).trim();
  // +82-10-1234-5678, 010-1234-5678, (02) 123-4567 등
  const digits = s.replace(/[\s\-().+]/g, '');
  if (!/^\d{7,15}$/.test(digits)) return false;
  // 반복 숫자 제거 (0000000000 등은 비밀번호일 수 있음)
  if (/^(\d)\1{6,}$/.test(digits)) return false;
  // 전화번호 패턴: +로 시작하거나 0으로 시작하거나 국가코드(1~3자리)
  if (/^\+?\d[\d\s\-().]{5,}$/.test(s)) return true;
  // 010, 011, 016, 017, 018, 019 (한국 휴대폰)
  if (/^01[016789]/.test(digits)) return true;
  return false;
}

function isSixDigitOtp(s) {
  if (!s) return false;
  s = String(s).trim();
  return /^\d{6}$/.test(s);
}

function isTotpLike(s) {
  if (!s) return false;
  s = String(s).trim();
  if (s.includes('@')) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (/[\/\\:;!#$%^&*()=+\[\]{}|<>?]/.test(s)) return false;
  const n = normalizeTotp(s);
  if (n.length < 16 || n.length > 128) return false;
  // 대소문자 혼합 + 0/8/9 포함 시 Base32 아님
  const raw = String(s).replace(/[\s\-_]/g, '');
  if (/[a-z]/.test(raw) && /[A-Z]/.test(raw)) return false;
  if (/[089]/.test(raw)) return false;
  return true;
}

function isUrlLike(s) {
  s = String(s || '').trim();
  if (/^https?:\/\//i.test(s)) return true;
  // youtube.com 임베디드 매칭 차단 — 단독 도메인일 때만
  if (/^(www\.)?(youtube\.com|youtu\.be)\//i.test(s)) return true;
  return false;
}

function extractTotpFromUrl(s) {
  s = String(s || '').trim();
  const m = s.match(/[?&]secret=([A-Za-z2-7]+)/i);
  if (!m) return '';
  const secret = m[1].toUpperCase();
  // 시크릿 길이 검증 — 최소 16자 (80비트)
  if (secret.length < 16 || secret.length > 128) return '';
  return secret;
}

// ── header detection ──

const HEADER_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|gmail|id|아이디|계정|메일)/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증|시크릿)/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구|보조)/i,
  youtube:  /^(youtube|yt|url|link|channel|채널|주소)/i,
};
// "코드" → TOTP 오인 제거 (코드는 OTP 6자리 코드이지 시크릿 아님)
// "user" → 이메일 오인 제거 (user는 사용자명이지 이메일 아님)

function detectHeaderMapping(row) {
  if (!Array.isArray(row)) return null;
  const mapping = {};
  let matched = 0;

  // 데이터 행 오인 방지 — 행에 이메일 값이 있으면 헤더가 아님
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (isEmail(cell)) return null;
  }

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
    let emails = 0, gmails = 0, totps = 0, urls = 0, phones = 0, sixDigits = 0, nonEmpty = 0;
    for (let r = 0; r < rows.length; r++) {
      const v = String((rows[r] && rows[r][c]) || '').trim();
      if (!v) continue;
      nonEmpty++;
      values.push(v);
      if (isEmail(v)) {
        emails++;
        if (/@gmail\.com$/i.test(v)) gmails++;
      }
      if (isTotpLike(v)) totps++;
      if (isUrlLike(v)) urls++;
      if (isPhoneNumber(v)) phones++;
      if (isSixDigitOtp(v)) sixDigits++;
    }
    stats.push({ col: c, nonEmpty, emails, gmails, totps, urls, phones, sixDigits, values });
  }

  const mapping = {};
  const used = new Set();

  // 1. find ALL email-like columns (>50% email pattern)
  const emailCols = stats
    .filter(s => s.nonEmpty > 0 && s.emails / s.nonEmpty > 0.5)
    .sort((a, b) => {
      // Gmail 컬럼 우선
      const gRatioDiff = (b.gmails / b.nonEmpty) - (a.gmails / a.nonEmpty);
      if (Math.abs(gRatioDiff) > 0.1) return gRatioDiff;
      const rd = (b.emails / b.nonEmpty) - (a.emails / a.nonEmpty);
      return rd !== 0 ? rd : a.col - b.col;
    });

  if (!emailCols.length) return {};

  mapping.email = emailCols[0].col;
  used.add(emailCols[0].col);

  // 2번째 이메일 컬럼: 비율 검증 — 이메일 비율 50%+ 이어야 복구이메일
  if (emailCols.length > 1 && emailCols[1].emails / emailCols[1].nonEmpty > 0.5) {
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
  //    단, 6자리 OTP/전화번호 비율 높은 컬럼은 건너뜀
  for (const s of stats) {
    if (used.has(s.col)) continue;
    if (s.nonEmpty === 0) continue;
    // 6자리 OTP 코드 컬럼 스킵 (80%+ 가 6자리 숫자)
    if (s.sixDigits / s.nonEmpty > 0.8) continue;
    // 전화번호 컬럼 스킵 (60%+ 가 전화번호)
    if (s.phones / s.nonEmpty > 0.6) continue;
    mapping.password = s.col;
    used.add(s.col);
    break;
  }

  return mapping;
}

// ── label-value pair detection ──

const LABEL_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|gmail|id|아이디|계정|메일)\s*[:：]/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)\s*[:：]/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증|시크릿)\s*[:：]/i,
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

// ── vertical/stacked layout detection ──

function tryVerticalExtract(rows, sourceFile, sourceMtime) {
  const maxCols = Math.max(...rows.map(r => (r && r.length) || 0));
  if (maxCols > 3) return null;

  const lvAccounts = tryLabelValueExtract(rows, maxCols, sourceFile, sourceMtime);
  if (lvAccounts && lvAccounts.length) return lvAccounts;

  const stackedAccounts = tryStackedExtract(rows, maxCols, sourceFile, sourceMtime);
  if (stackedAccounts && stackedAccounts.length) return stackedAccounts;

  return null;
}

function tryLabelValueExtract(rows, maxCols, sourceFile, sourceMtime) {
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
      const pw = sanitizePassword(cur.password || '', cur.email);
      const rec = sanitizeRecovery(cur.recovery || '', cur.email);
      accounts.push({
        email: normalizeEmail(cur.email),
        password: pw,
        totp_secret: cur.totp && isTotpLike(cur.totp) ? normalizeTotp(cur.totp) : (cur.totp || ''),
        recovery_email: rec,
        youtube_url: cur.youtube || '',
        extra: cur.extra || [],
        source_file: sourceFile || 'unknown',
        source_mtime: sourceMtime || '',
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

function tryStackedExtract(rows, maxCols, sourceFile, sourceMtime) {
  if (maxCols > 3) return null;

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
      cur = { email: v, password: '', totp: '', recovery: '', youtube: '', extra: [], _hasBlankBefore: afterBlank, source_file: sourceFile || 'unknown', source_mtime: sourceMtime || '' };
      afterBlank = false;
      continue;
    }

    if (!cur) continue;

    if (isTotpLike(v) && !cur.totp) { cur.totp = v; }
    else if (isUrlLike(v) && !cur.youtube) { cur.youtube = v; }
    else if (isEmail(v) && !cur.recovery) { cur.recovery = v; }
    else if (!cur.password && !isPhoneNumber(v) && !isSixDigitOtp(v)) { cur.password = v; }
    else { cur.extra.push(v); }
  }
  if (cur && cur.email) accounts.push(cur);

  if (accounts.length < 1) return null;

  return accounts.map(a => {
    const pw = sanitizePassword(a.password || '', a.email);
    const rec = sanitizeRecovery(a.recovery || '', a.email);
    return {
      email: normalizeEmail(a.email),
      password: pw,
      totp_secret: a.totp && isTotpLike(a.totp) ? normalizeTotp(a.totp) : (a.totp || ''),
      recovery_email: rec,
      youtube_url: a.youtube || '',
      extra: a.extra || [],
      source_file: a.source_file,
      source_mtime: a.source_mtime || '',
    };
  });
}

// ── post-extraction sanitizers ──

function sanitizePassword(pw, mainEmail) {
  if (!pw) return '';
  // 비밀번호가 TOTP → 빈값 (totp_secret에 이미 있거나 별도 재분류)
  if (isTotpLike(pw)) return '';
  // 비밀번호가 이메일 → 빈값 (복구이메일로 재분류는 caller에서)
  if (isEmail(pw)) return '';
  // 비밀번호가 URL → 제거
  if (isUrlLike(pw)) return '';
  // 비밀번호가 전화번호 → 제거
  if (isPhoneNumber(pw)) return '';
  // 비밀번호가 6자리 OTP 코드 → 제거
  if (isSixDigitOtp(pw)) return '';
  return pw;
}

function sanitizeRecovery(recovery, mainEmail) {
  if (!recovery) return '';
  // TOTP가 recovery에 잘못 들어온 경우 제거
  if (isTotpLike(recovery)) return '';
  // URL이 recovery에 들어온 경우 제거
  if (isUrlLike(recovery)) return '';
  // 복구이메일이 이메일이 아닌 값 → 제거
  if (!isEmail(recovery)) return '';
  // 복구이메일이 메인 이메일과 동일 → 제거
  if (normalizeEmail(recovery) === normalizeEmail(mainEmail)) return '';
  return normalizeEmail(recovery);
}

function reclassifyPassword(account) {
  const pw = account.password || '';
  if (!pw) return;
  // 비밀번호가 TOTP → totp_secret으로 재분류
  if (isTotpLike(pw) && !account.totp_secret) {
    account.totp_secret = normalizeTotp(pw);
    account.password = '';
    return;
  }
  // 비밀번호가 이메일 → 복구이메일로 재분류
  if (isEmail(pw) && !account.recovery_email) {
    account.recovery_email = sanitizeRecovery(pw, account.email);
    account.password = '';
    return;
  }
}

// ── main extraction ──

function extractAccountsFromSheet(sheet, sourceFile, sourceMtime) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return [];

  let mapping = null;
  let startRow = 0;

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const m = detectHeaderMapping(rows[i]);
    if (m) {
      mapping = m;
      startRow = i + 1;
      break;
    }
  }

  if (!mapping) {
    const maxCols = Math.max(...rows.map(r => (r && r.length) || 0));
    if (maxCols <= 3) {
      const vertAccounts = tryVerticalExtract(rows, sourceFile, sourceMtime);
      if (vertAccounts && vertAccounts.length) return vertAccounts;
    }
  }

  if (!mapping) {
    let sampleStart = 0;
    if (rows.length > 1) {
      const firstRow = rows[0];
      // 헤더 감지 — 첫 행이 데이터(이메일 포함)면 헤더 아님
      const hasEmailInFirst = firstRow && firstRow.some(c => isEmail(String(c || '').trim()));
      if (!hasEmailInFirst) {
        const firstCell = String((firstRow && firstRow[0]) || '').trim();
        if (firstCell && !isEmail(firstCell)) {
          sampleStart = 1;
        }
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

    let password = mapping.password !== undefined ? String(row[mapping.password] || '').trim() : '';
    const totpRaw = mapping.totp !== undefined ? String(row[mapping.totp] || '').trim() : '';
    let recovery = mapping.recovery !== undefined ? String(row[mapping.recovery] || '').trim() : '';
    const youtube = mapping.youtube !== undefined ? String(row[mapping.youtube] || '').trim() : '';

    // 인접 행 패스워드 탐색 — 패스워드 컬럼이 없고 미할당 컬럼에 값 있으면
    if (!password && mapping.password === undefined) {
      for (let c = 0; c < row.length; c++) {
        if (usedCols.has(c)) continue;
        const v = String(row[c] || '').trim();
        if (v && !isEmail(v) && !isTotpLike(v) && !isUrlLike(v) && !isPhoneNumber(v) && !isSixDigitOtp(v)) {
          password = v;
          break;
        }
      }
    }

    const extra = [];
    for (let c = 0; c < row.length; c++) {
      if (usedCols.has(c)) continue;
      const v = String(row[c] || '').trim();
      if (v) extra.push(v);
    }

    password = sanitizePassword(password, email);
    recovery = sanitizeRecovery(recovery, email);

    const account = {
      email: normalizeEmail(email),
      password,
      totp_secret: isTotpLike(totpRaw) ? normalizeTotp(totpRaw) : (totpRaw.startsWith('otpauth://') ? extractTotpFromUrl(totpRaw) : totpRaw),
      recovery_email: recovery,
      youtube_url: youtube,
      extra,
      source_file: sourceFile || 'unknown',
      source_mtime: sourceMtime || '',
    };

    reclassifyPassword(account);
    accounts.push(account);
  }
  return accounts;
}

function parseExcelFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const allAccounts = [];
  const baseName = path.basename(filePath);
  // fileMtime 실제 mtime 사용
  let mtime = '';
  try { mtime = fs.statSync(filePath).mtime.toISOString(); } catch (_) {}

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const accounts = extractAccountsFromSheet(sheet, baseName, mtime);
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
      // 에러 메시지 내부정보 노출 차단
      report.errors.push({ file: path.basename(fp), error: 'parse failed' });
    }
  }

  return { accounts: allAccounts, report };
}

// ref: https://www.npmjs.com/package/multer (multipart/form-data handling)
const multer = require('multer');

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 50 },
});

let mergeAccount;
try { mergeAccount = require('./merge_strategy').mergeAccount; } catch { mergeAccount = null; }

module.exports = function attachUpload(app) {
  app.post('/api/upload-excels', function (req, res, next) {
    uploadMiddleware.array('files', 50)(req, res, function (err) {
      if (err) return res.status(400).json({ ok: false, error: 'upload failed' });
      next();
    });
  }, (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ ok: false, error: 'no files' });

      const perFile = [];
      const allAccounts = [];

      for (const f of files) {
        try {
          const wb = XLSX.read(f.buffer, { type: 'buffer' });
          let cnt = 0;
          for (const sn of wb.SheetNames) {
            const accs = extractAccountsFromSheet(wb.Sheets[sn], f.originalname);
            accs.forEach(a => { a.source_sheet = sn; a.source_mtime = Date.now(); });
            allAccounts.push(...accs);
            cnt += accs.length;
          }
          perFile.push({ name: f.originalname, size: f.size, accounts: cnt, sheets: wb.SheetNames.length });
        } catch {
          perFile.push({ name: f.originalname, error: 'parse failed' });
        }
      }

      const uniq = {};
      for (const a of allAccounts) {
        const k = a.email;
        if (!uniq[k]) { uniq[k] = a; continue; }
        if (!uniq[k].password && a.password) uniq[k].password = a.password;
        if (!uniq[k].totp_secret && a.totp_secret) uniq[k].totp_secret = a.totp_secret;
        if (!uniq[k].recovery_email && a.recovery_email) uniq[k].recovery_email = a.recovery_email;
      }
      const finalList = Object.values(uniq);

      const dateGrouped = {};
      finalList.forEach(a => {
        const m = (a.source_file || '').match(/(\d{4})[-_/]?(\d{2})[-_/]?(\d{2})|(\d{1,2})월\s*(\d{1,2})일/);
        let key = '기타';
        if (m) {
          if (m[1]) key = `${m[1]}-${m[2]}-${m[3]}`;
          else if (m[4]) key = `${new Date().getFullYear()}-${String(m[4]).padStart(2, '0')}-${String(m[5]).padStart(2, '0')}`;
        }
        (dateGrouped[key] = dateGrouped[key] || []).push(a);
      });

      const normPath = path.join(__dirname, 'accounts_normalized.json');
      let existing = { accounts: [] };
      try { if (fs.existsSync(normPath)) existing = JSON.parse(fs.readFileSync(normPath, 'utf8')); } catch {}
      const existMap = {};
      (existing.accounts || []).forEach(a => { existMap[normalizeEmail(a.email)] = a; });

      let added = 0, updated = 0;
      const conflicts = [];
      for (const a of finalList) {
        if (!existMap[a.email]) { existMap[a.email] = a; added++; }
        else if (mergeAccount) {
          const cur = existMap[a.email];
          const before = JSON.stringify(cur);
          mergeAccount(cur, a, conflicts);
          if (JSON.stringify(cur) !== before) updated++;
        }
      }

      const merged = { accounts: Object.values(existMap), updated_at: new Date().toISOString() };
      try { fs.writeFileSync(normPath, JSON.stringify(merged, null, 2)); } catch {}

      res.json({
        ok: true,
        files: perFile,
        total_parsed: allAccounts.length,
        unique: finalList.length,
        added, updated,
        total_master: merged.accounts.length,
        conflicts, conflicts_count: conflicts.length,
        by_date: Object.fromEntries(Object.entries(dateGrouped).sort().map(([k, v]) => [k, v.length])),
      });
    } catch {
      res.status(500).json({ ok: false, error: 'upload processing failed' });
    }
  });
};

module.exports.parseExcelFile = parseExcelFile;
module.exports.parseMultipleFiles = parseMultipleFiles;
module.exports.extractAccountsFromSheet = extractAccountsFromSheet;
module.exports.normalizeTotp = normalizeTotp;
module.exports.normalizeEmail = normalizeEmail;
module.exports.isTotpLike = isTotpLike;
module.exports.isEmail = isEmail;
module.exports.isPhoneNumber = isPhoneNumber;
module.exports.isSixDigitOtp = isSixDigitOtp;
module.exports.isUrlLike = isUrlLike;
module.exports.extractTotpFromUrl = extractTotpFromUrl;
module.exports.analyzeColumns = analyzeColumns;
module.exports.sanitizePassword = sanitizePassword;
module.exports.sanitizeRecovery = sanitizeRecovery;
