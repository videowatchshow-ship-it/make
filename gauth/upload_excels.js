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
  const n = String(s).toUpperCase().replace(/[\s\-_=]/g, '').replace(/[^A-Z2-7]/g, '');
  return n || '';
}

/* RFC 5322 Section 3.4.1 간소화 — IP 리터럴, 따옴표 로컬파트 등 미지원
 * ref: https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1
 * HTML5 email type도 유사한 간소화 사용: https://html.spec.whatwg.org/#valid-e-mail-address */
function isEmail(s) {
  s = String(s || '').trim();
  if (s.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(s);
}

/* Gmail 주소 정규화:
 * - 점(.) 무시: https://support.google.com/mail/answer/7436150
 * - 플러스(+) 태그 무시: https://support.google.com/mail/answer/22370
 * - googlemail.com = gmail.com: https://support.google.com/mail/answer/10313 */
function normalizeEmail(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s || !s.includes('@')) return s;
  const atIdx = s.lastIndexOf('@');
  let local = s.slice(0, atIdx);
  const domain = s.slice(atIdx + 1);
  if (!local || !domain) return s;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '').split('+')[0];
    return local + '@gmail.com';
  }
  return local + '@' + domain;
}

/* ITU-T E.164: 국제 전화번호는 최대 15자리, 국가코드 포함 최소 7자리
 * ref: https://www.itu.int/rec/T-REC-E.164-201011-I/en */
function isPhoneNumber(s) {
  s = String(s || '').trim();
  if (!/^[\+]?[\d\s\-()]{7,20}$/.test(s)) return false;
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return /[\s\-()]+/.test(s) || /^\+/.test(s) || (digits.length >= 10 && digits.length <= 15);
}

function isSixDigitCode(s) {
  return /^\d{6,8}$/.test(String(s || '').trim());
}

function isTotpLike(s) {
  if (!s) return false;
  s = String(s).trim();
  if (s.includes('@')) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (isPhoneNumber(s)) return false;
  if (/[\/\\:;!#$%^&*()+=\[\]{}|<>?]/.test(s) && !/^[A-Z2-7]+=*$/i.test(s)) return false;
  if (/\s/.test(s) && !/^[A-Z2-7\s]+$/i.test(s)) return false;
  const upper = s.toUpperCase().replace(/[\s\-_=]/g, '');
  /* Base32: A-Z, 2-7 only (RFC 4648 Section 6)
   * ref: https://datatracker.ietf.org/doc/html/rfc4648#section-6 */
  const b32only = upper.replace(/[^A-Z2-7]/g, '');
  if (b32only.length >= 16 && b32only.length <= 128) {
    if (upper.length > 0 && b32only.length / upper.length >= 0.7) return true;
  }
  const n = normalizeTotp(s);
  /* RFC 4226 Section 4: HMAC-SHA1 최소 128-bit = 20 Base32 문자
   * ref: https://datatracker.ietf.org/doc/html/rfc4226#section-4
   * 단, Google Authenticator는 80-bit(16자)도 허용하므로 16 유지 */
  if (n.length < 16) return false;
  if (n.length > 128) return false;
  const raw = String(s).replace(/[\s\-_=]/g, '');
  if (raw.length > 0 && n.length / raw.length < 0.6) return false;
  return true;
}

/* otpauth URI: https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 * secret 파라미터는 percent-encoding 가능 → decodeURIComponent 후 추출 */
function extractTotpFromUrl(s) {
  s = String(s || '').trim();
  if (!/^otpauth:\/\//i.test(s)) return null;
  try { s = decodeURIComponent(s); } catch (_) { return null; }
  const m = s.match(/[?&]secret=([A-Z2-7=]+)/i);
  if (m) {
    const secret = m[1].toUpperCase().replace(/=+$/, '');
    return secret.length >= 16 ? secret : null;
  }
  return null;
}

/* URL 판별: WHATWG URL Standard https://url.spec.whatwg.org/#urls
 * YouTube 단축 URL 포함: youtu.be는 YouTube 공식 단축 도메인 */
function isUrlLike(s) {
  s = String(s || '').trim();
  if (/^https?:\/\//i.test(s)) {
    try { new URL(s); return true; } catch (_) { return false; }
  }
  if (/^(www\.)?youtube\.com/i.test(s) || /^(www\.)?youtu\.be/i.test(s)) return true;
  return false;
}

function isOtpauthUrl(s) {
  return /^otpauth:\/\//i.test(String(s || '').trim());
}

// ── header detection ──

const HEADER_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|gmail|아이디|계정|이메일|메일)/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증코드|시크릿|인증\s*키)/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구|보조)/i,
  youtube:  /^(youtube|yt|url|link|channel|채널|주소)/i,
  date:     /^(date|created|생성|날짜|등록|가입|일자|작성)/i,
};

function detectHeaderMapping(row) {
  if (!Array.isArray(row)) return null;
  const mapping = {};
  let matched = 0;
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (!cell) continue;
    if (/^\d+$/.test(cell)) continue;
    for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
      if (!mapping[field] && pattern.test(cell)) {
        if (field === 'email' && /^(id|user)$/i.test(cell)) continue;
        mapping[field] = i;
        matched++;
        break;
      }
    }
  }
  if (matched >= 2 && mapping.email !== undefined) {
    const hasDataValues = row.some(c => { const v = String(c || '').trim(); return v && isEmail(v); });
    if (hasDataValues) return null;
    return mapping;
  }
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
    let emails = 0, totps = 0, urls = 0, phones = 0, codes = 0, dates = 0, nonEmpty = 0;
    for (let r = 0; r < rows.length; r++) {
      const v = String((rows[r] && rows[r][c]) || '').trim();
      if (!v) continue;
      nonEmpty++;
      values.push(v);
      if (isEmail(v)) emails++;
      if (isTotpLike(v) || isOtpauthUrl(v)) totps++;
      if (isUrlLike(v) && !isOtpauthUrl(v)) urls++;
      if (isPhoneNumber(v)) phones++;
      if (isSixDigitCode(v)) codes++;
      if (isDateLike(v)) dates++;
    }
    stats.push({ col: c, nonEmpty, emails, totps, urls, phones, codes, dates, values });
  }

  const mapping = {};
  const used = new Set();

  /* 이메일 열 판정: 10% 이상이 RFC 5322 이메일 형식이면 이메일 열로 간주 */
  const emailCols = stats
    .filter(s => s.nonEmpty > 0 && s.emails / s.nonEmpty > 0.1)
    .sort((a, b) => {
      const aGmail = a.values.filter(v => isEmail(v) && /@g(oogle)?mail\.com$/i.test(v)).length;
      const bGmail = b.values.filter(v => isEmail(v) && /@g(oogle)?mail\.com$/i.test(v)).length;
      if (aGmail !== bGmail) return bGmail - aGmail;
      const rd = (b.emails / b.nonEmpty) - (a.emails / a.nonEmpty);
      return rd !== 0 ? rd : a.col - b.col;
    });

  if (!emailCols.length) return {};

  mapping.email = emailCols[0].col;
  used.add(emailCols[0].col);

  if (emailCols.length > 1) {
    const mainRatio = emailCols[0].emails / emailCols[0].nonEmpty;
    const secRatio = emailCols[1].emails / emailCols[1].nonEmpty;
    if (secRatio > 0.05 && secRatio < mainRatio * 0.8) {
      mapping.recovery = emailCols[1].col;
      used.add(emailCols[1].col);
    } else if (secRatio >= mainRatio * 0.8) {
      used.add(emailCols[1].col);
    }
  }

  let bestTotp = null, bestTotpRatio = 0;
  for (const s of stats) {
    if (used.has(s.col) || s.nonEmpty === 0) continue;
    const ratio = s.totps / s.nonEmpty;
    /* 3% 임계값: TOTP 열 판정 — 일부 계정만 TOTP가 있는 경우도 감지 */
    if (ratio > bestTotpRatio && ratio > 0.03) {
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
    /* 20% 임계값: URL 열 판정 — 경험적 임계값, 공식 규격 없음 */
    if (ratio > bestUrlRatio && ratio > 0.2) {
      bestUrlRatio = ratio;
      bestUrl = s.col;
    }
  }
  if (bestUrl !== null) {
    mapping.youtube = bestUrl;
    used.add(bestUrl);
  }

  let bestDate = null, bestDateRatio = 0;
  for (const s of stats) {
    if (used.has(s.col) || s.nonEmpty === 0) continue;
    const ratio = s.dates / s.nonEmpty;
    if (ratio > bestDateRatio && ratio > 0.3) {
      bestDateRatio = ratio;
      bestDate = s.col;
    }
  }
  if (bestDate !== null) {
    mapping.date = bestDate;
    used.add(bestDate);
  }

  for (const s of stats) {
    if (used.has(s.col)) continue;
    if (s.nonEmpty > 0) {
      const allNumbers = s.values.every(v => /^\d+$/.test(v));
      const isSequential = allNumbers && s.values.length > 2 &&
        s.values.every((v, i) => i === 0 || parseInt(v) === parseInt(s.values[i-1]) + 1);
      if (isSequential) continue;
      if (s.phones > 0 && s.phones / s.nonEmpty > 0.5) continue;
      if (s.codes > 0 && s.codes / s.nonEmpty > 0.5) continue;
      mapping.password = s.col;
      used.add(s.col);
      break;
    }
  }

  return mapping;
}

// ── label-value pair detection ──

const LABEL_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|gmail|아이디|계정|이메일|메일)\s*[:：=]/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번|암호)\s*[:：=]/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증코드|시크릿|인증\s*키)\s*[:：=]/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구|보조)\s*[:：=]/i,
  youtube:  /^(youtube|yt|url|link|channel|채널|주소)\s*[:：=]/i,
  date:     /^(date|created|생성|날짜|등록|가입|일자|작성)\s*[:：=]/i,
};

function extractLabelValue(cell) {
  const s = String(cell || '').trim();
  for (const [field, pattern] of Object.entries(LABEL_PATTERNS)) {
    const m = s.match(pattern);
    if (m) return { field, value: s.slice(m[0].length).trim() };
  }
  return null;
}

/* Excel 시리얼 날짜: 1900-01-01 = 1, 범위 36526(2000-01-01)~54789(2050-01-01)
 * ref: https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487
 * ISO 8601 날짜: https://www.iso.org/iso-8601-date-and-time-format.html */
function isDateLike(s) {
  s = String(s || '').trim();
  if (/^\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}/.test(s)) return true;
  if (/^\d{5}$/.test(s)) {
    const n = parseInt(s);
    if (n >= 36526 && n <= 54789) return true;
  }
  if (/\d{4}년\s*\d{1,2}월\s*\d{1,2}일/.test(s)) return true;
  return false;
}

/* Excel 시리얼→Unix 변환: epoch 차이 = 25569일 (1900-01-01 ~ 1970-01-01)
 * ref: https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487 */
function parseDateValue(s) {
  s = String(s || '').trim();
  if (/^\d{5}$/.test(s)) {
    const n = parseInt(s);
    if (n >= 36526 && n <= 54789) {
      const d = new Date((n - 25569) * 86400000);
      return d.getTime();
    }
  }
  let m = s.match(/^(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])).getTime();
  m = s.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[1])-1, parseInt(m[2])).getTime();
  m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])).getTime();
  return null;
}

function parseDateFromFilename(name) {
  if (!name) return null;
  const str = String(name);
  let m = str.match(/(\d{4})[\.\-_](\d{1,2})[\.\-_](\d{1,2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])).getTime();
  m = str.match(/(\d{8})/);
  if (m) {
    const ds = m[1];
    const y = parseInt(ds.slice(0,4)), mo = parseInt(ds.slice(4,6)), d = parseInt(ds.slice(6,8));
    if (y >= 2020 && y <= 2030 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo-1, d).getTime();
  }
  return null;
}

function classifyValue(s) {
  s = String(s || '').trim();
  if (!s) return null;
  if (isEmail(s)) return 'email';
  if (isOtpauthUrl(s)) return 'totp';
  if (isTotpLike(s)) return 'totp';
  if (isUrlLike(s)) return 'url';
  if (isPhoneNumber(s)) return 'phone';
  if (isSixDigitCode(s)) return 'code';
  if (isDateLike(s)) return 'date';
  return 'unknown';
}

// ── vertical/stacked layout detection ──

function tryVerticalExtract(rows, sourceFile, sourceMtime) {
  const maxCols = rows.reduce((mx, r) => Math.max(mx, (r && r.length) || 0), 0);

  const lvAccounts = tryLabelValueExtract(rows, maxCols, sourceFile, sourceMtime);
  if (lvAccounts && lvAccounts.length) return lvAccounts;

  if (maxCols <= 4) {
    const stackedAccounts = tryStackedExtract(rows, maxCols, sourceFile, sourceMtime);
    if (stackedAccounts && stackedAccounts.length) return stackedAccounts;
  }

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
      let totpVal = cur.totp || '';
      let pw = cur.password || '';
      let rec = cur.recovery || '';
      if (isOtpauthUrl(totpVal)) {
        totpVal = extractTotpFromUrl(totpVal) || totpVal;
      }
      if (pw && !totpVal && isTotpLike(pw)) { totpVal = pw; pw = ''; }
      if (pw && isEmail(pw)) { if (!rec) rec = pw; pw = ''; }
      if (rec && !isEmail(rec)) rec = '';
      if (rec && normalizeEmail(rec) === normalizeEmail(cur.email)) rec = '';
      accounts.push({
        email: cur.email,
        password: pw,
        totp_secret: isTotpLike(totpVal) ? normalizeTotp(totpVal) : totpVal,
        recovery_email: rec,
        youtube_url: cur.youtube || '',
        account_date: (cur.date && parseDateValue(cur.date)) || null,
        extra: [],
        source_file: sourceFile || 'unknown',
        source_mtime: sourceMtime || Date.now(),
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
      if (cur && cur.email && !cur.recovery && (cur.password || cur.totp) && normalizeEmail(v) !== normalizeEmail(cur.email)) {
        cur.recovery = v;
        continue;
      }
      if (cur && cur.email) accounts.push(cur);
      cur = { email: v, password: '', totp: '', recovery: '', youtube: '', account_date: null, extra: [], source_file: sourceFile || 'unknown', source_mtime: sourceMtime || Date.now() };
      afterBlank = false;
      continue;
    }

    if (!cur) continue;

    if (isOtpauthUrl(v) && !cur.totp) {
      cur.totp = extractTotpFromUrl(v) || v;
    }
    else if (isTotpLike(v) && !cur.totp) { cur.totp = v; }
    else if (isUrlLike(v) && !cur.youtube) { cur.youtube = v; }
    else if (isDateLike(v) && !cur.account_date) { cur.account_date = parseDateValue(v); }
    else if (isPhoneNumber(v)) { cur.extra.push(v); }
    else if (isSixDigitCode(v)) { cur.extra.push(v); }
    else if (!cur.password) { cur.password = v; }
    else { cur.extra.push(v); }
  }
  if (cur && cur.email) accounts.push(cur);

  if (accounts.length < 1) return null;

  return accounts.map(a => {
    let pw = a.password || '';
    let totp = a.totp || '';
    let rec = a.recovery || '';
    if (pw && !totp && isTotpLike(pw)) { totp = pw; pw = ''; }
    if (pw && isEmail(pw)) { if (!rec) rec = pw; pw = ''; }
    if (rec && !isEmail(rec)) rec = '';
    if (rec && normalizeEmail(rec) === normalizeEmail(a.email)) rec = '';
    return {
      email: a.email,
      password: pw,
      totp_secret: totp && isTotpLike(totp) ? normalizeTotp(totp) : totp,
      recovery_email: rec,
      youtube_url: a.youtube || '',
      extra: a.extra || [],
      source_file: a.source_file,
      source_mtime: a.source_mtime || sourceMtime || Date.now(),
    };
  });
}

// ── brute-force fallback: scan every cell for emails ──

function bruteForceExtract(rows, sourceFile, sourceMtime) {
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
      if (rest.length === 0 && i + 1 < rows.length && rows[i + 1]) {
        for (let c2 = 0; c2 < rows[i + 1].length; c2++) {
          const rv = String(rows[i + 1][c2] || '').trim();
          if (rv && !isEmail(rv)) rest.push(rv);
        }
      }
      let password = '', totp_secret = '', recovery = '', youtube = '';
      const passwordCandidates = [];
      const extraValues = [];
      for (const rv of rest) {
        if (!totp_secret && isOtpauthUrl(rv)) { totp_secret = extractTotpFromUrl(rv) || normalizeTotp(rv); }
        else if (!totp_secret && isTotpLike(rv)) { totp_secret = normalizeTotp(rv); }
        else if (!youtube && isUrlLike(rv)) { youtube = rv; }
        else if (!recovery && isEmail(rv) && normalizeEmail(rv) !== key) { recovery = rv; }
        else if (isPhoneNumber(rv)) { extraValues.push(rv); }
        else if (isSixDigitCode(rv)) { extraValues.push(rv); }
        else { passwordCandidates.push(rv); }
      }
      if (passwordCandidates.length > 0) {
        const real = passwordCandidates.find(p => !/^\d{1,4}$/.test(p));
        password = real || passwordCandidates[passwordCandidates.length - 1];
      }
      let _dateVal = null;
      for (const _rv of rest) { if (isDateLike(_rv)) { _dateVal = parseDateValue(_rv); break; } }
      accounts.push({ email: v, password, totp_secret, recovery_email: recovery, youtube_url: youtube, account_date: _dateVal || null, extra: extraValues, source_file: sourceFile || 'unknown', source_mtime: sourceMtime || Date.now() });
    }
  }
  return accounts;
}

// ── main extraction ──

function extractAccountsFromSheet(sheet, sourceFile, sourceMtime) {
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
    const vertAccounts = tryVerticalExtract(rows, sourceFile, sourceMtime);
    if (vertAccounts && vertAccounts.length) return vertAccounts;
  }

  if (!mapping) {
    let sampleStart = 0;
    if (rows.length > 1) {
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const row = rows[i];
        if (!row) break;
        const firstCell = String((row[0]) || '').trim();
        if (!firstCell) break;
        const hasEmail = row.some(c => isEmail(String(c || '').trim()));
        if (hasEmail) break;
        if (!Object.values(HEADER_PATTERNS).some(p => p.test(firstCell))) {
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
      return bruteForceExtract(rows, sourceFile, sourceMtime);
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
    let totpRaw = mapping.totp !== undefined ? String(row[mapping.totp] || '').trim() : '';
    let recovery = mapping.recovery !== undefined ? String(row[mapping.recovery] || '').trim() : '';
    const youtube = mapping.youtube !== undefined ? String(row[mapping.youtube] || '').trim() : '';
    const dateRaw = mapping.date !== undefined ? String(row[mapping.date] || '').trim() : '';

    if (password && !totpRaw && isTotpLike(password)) { totpRaw = password; password = ''; }
    if (password && isEmail(password)) {
      if (!recovery) { recovery = password; }
      password = '';
    }
    if (password && isUrlLike(password)) { password = ''; }
    if (recovery && !isEmail(recovery)) recovery = '';
    if (recovery && normalizeEmail(recovery) === normalizeEmail(email)) recovery = '';

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
      account_date: (dateRaw && parseDateValue(dateRaw)) || null,
      extra,
      source_file: sourceFile || 'unknown',
      source_mtime: sourceMtime || Date.now(),
    });
  }
  return accounts;
}

/* 컬럼 매핑은 시트 전체 기준 고정 컬럼이라, 개별 행에 컬럼이 더 있거나
 * 값이 비어 예상 컬럼에서 못 찾은 password/totp/recovery가 extra로 밀려나는 경우가 있음.
 * extra에 남은 값 중 해당 필드 후보를 찾아 비어있는 필드로 승격 (필드당 1회만) */
function recoverMissingFieldsFromExtra(accounts) {
  for (const a of accounts) {
    if (!a.extra || !a.extra.length) continue;
    const remaining = [];
    for (const raw of a.extra) {
      const v = String(raw || '').trim();
      if (!v) continue;
      if (!a.totp_secret && isTotpLike(v)) { a.totp_secret = normalizeTotp(v); continue; }
      if (!a.recovery_email && isEmail(v) && normalizeEmail(v) !== normalizeEmail(a.email)) { a.recovery_email = v; continue; }
      if (!a.password && !isEmail(v) && !isTotpLike(v) && !isUrlLike(v) && !isSixDigitCode(v) && !isPhoneNumber(v) && !/^\d+$/.test(v)) {
        a.password = v;
        continue;
      }
      remaining.push(v);
    }
    a.extra = remaining;
  }
  return accounts;
}

/* account_date는 엑셀 셀에 적힌 날짜만 사용 — 같은 파일 내에서 배치 단위로
 * 한 행에만 날짜가 기입되는 경우가 있어(예: 문서 제목/작성일), 같은 파일의
 * 나머지 행에도 그 날짜를 적용 (다운로드 날짜·파일 수정일과는 무관, 셀에 실제로 적힌 값) */
function propagateBatchDateWithinFile(accounts) {
  const found = accounts.find(a => a.account_date);
  if (!found) return accounts;
  for (const a of accounts) { if (!a.account_date) a.account_date = found.account_date; }
  return accounts;
}

function parseExcelFile(filePath, originalName) {
  const wb = XLSX.readFile(filePath);
  const allAccounts = [];
  const baseName = originalName || path.basename(filePath);
  let fileMtime = Date.now();
  try { fileMtime = fs.statSync(filePath).mtimeMs; } catch (_) {}

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    for (const k of Object.keys(sheet)) {
      if (k[0] === '!') continue;
      const c = sheet[k];
      if (c && c.l && c.l.Target && /^mailto:/i.test(String(c.l.Target))) {
        const t = String(c.l.Target).replace(/^mailto:/i, '').replace(/\?.*$/, '');
        if (isEmail(t)) {
          c.v = t; c.w = t;
        }
      }
    }
    const accounts = extractAccountsFromSheet(sheet, baseName, fileMtime);
    allAccounts.push(...accounts);
  }

  recoverMissingFieldsFromExtra(allAccounts);
  propagateBatchDateWithinFile(allAccounts);

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

function parseMultipartManual(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    console.log('[upload-excels] content-type:', ct.slice(0, 120));
    console.log('[upload-excels] content-length:', req.headers['content-length'] || 'not set');
    if (!ct.includes('multipart')) {
      return reject(new Error('not multipart: ' + ct.slice(0, 80)));
    }
    const Busboy = (() => {
      try { return require('busboy'); } catch (_) {}
      try { require('multer'); return require('busboy'); } catch (_) {}
      return null;
    })();
    if (!Busboy) return reject(new Error('busboy not available'));
    console.log('[upload-excels] busboy loaded OK');
    const uploadDir = path.join(__dirname, 'uploads') + '/';
    try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}
    const files = [];
    const pending = [];
    let bbDone = false;
    let settled = false;
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 200 * 1024 * 1024, files: 200 } });
    bb.on('filesLimit', () => { console.warn('[upload-excels] file count limit reached (200)'); });
    bb.on('partsLimit', () => { console.warn('[upload-excels] parts limit reached'); });
    function tryResolve() {
      if (settled) return;
      if (bbDone && pending.every(p => p.done)) {
        settled = true;
        console.log('[upload-excels] busboy done, files:', files.length);
        resolve(files);
      }
    }
    bb.on('file', (fieldname, stream, info) => {
      const filename = (typeof info === 'string' ? info : (info && info.filename || 'unknown')).normalize('NFC');
      console.log('[upload-excels] file event:', fieldname, filename);
      const tmpPath = path.join(uploadDir, 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      const tracker = { done: false };
      pending.push(tracker);
      const ws = fs.createWriteStream(tmpPath);
      ws.on('error', (e) => {
        console.error('[upload-excels] write error:', filename, e.message);
        tracker.done = true;
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        tryResolve();
      });
      let truncated = false;
      stream.on('limit', () => { truncated = true; console.warn('[upload-excels] file truncated (exceeded fileSize limit):', filename); });
      stream.pipe(ws);
      ws.on('close', () => {
        if (truncated) { tracker.done = true; try { fs.unlinkSync(tmpPath); } catch (_) {} tryResolve(); return; }
        const sz = (() => { try { return fs.statSync(tmpPath).size; } catch (_) { return -1; } })();
        console.log('[upload-excels] file saved:', filename, sz, 'bytes');
        files.push({ fieldname, originalname: filename, path: tmpPath, size: sz });
        tracker.done = true;
        tryResolve();
      });
      stream.on('error', (e) => {
        console.error('[upload-excels] stream error:', filename, e.message);
        tracker.done = true;
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        tryResolve();
      });
    });
    bb.on('close', () => { console.log('[upload-excels] bb close'); bbDone = true; tryResolve(); });
    bb.on('finish', () => { console.log('[upload-excels] bb finish'); bbDone = true; tryResolve(); });
    bb.on('error', (err) => {
      console.error('[upload-excels] busboy error:', err.message);
      if (!settled) { settled = true; reject(err); }
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        const pendingCount = pending.filter(p => !p.done).length;
        console.error('[upload-excels] busboy timeout 5min, files so far:', files.length, 'pending:', pendingCount);
        if (pendingCount > 0) {
          reject(new Error('upload timeout with ' + pendingCount + ' pending files'));
        } else {
          resolve(files);
        }
      }
    }, 300000);
    req.on('error', (e) => {
      console.error('[upload-excels] req error:', e.message);
      if (!settled) { settled = true; clearTimeout(timeout); reject(e); }
    });
    req.on('aborted', () => {
      console.error('[upload-excels] req aborted');
      if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('request aborted')); }
    });
    req.pipe(bb);
    bb.on('close', () => clearTimeout(timeout));
    bb.on('finish', () => clearTimeout(timeout));
  });
}

function mountRoutes(app) {
  if (!app || typeof app.post !== 'function') return;

  let _fileLock = Promise.resolve();
  function withFileLock(fn) {
    _fileLock = _fileLock.then(fn, (err) => { console.error('[upload-excels] previous lock holder error:', err && err.message); return fn(); });
    return _fileLock;
  }

  app.post('/api/scan-folder', async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const targetDir = params.folder || '';
        if (!targetDir || !fs.existsSync(targetDir)) {
          return res.status(400).json({ ok: false, error: 'folder not found: ' + targetDir });
        }
        const exts = ['.xlsx', '.xls', '.csv'];
        function walkDir(dir) {
          let results = [];
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              const full = path.join(dir, e.name);
              if (e.isDirectory()) { results = results.concat(walkDir(full)); }
              else if (exts.includes(path.extname(e.name).toLowerCase())) { results.push(full); }
            }
          } catch (_) {}
          return results;
        }
        const files = walkDir(targetDir);
        if (!files.length) {
          return res.json({ ok: true, total_master: 0, total_parsed: 0, added: 0, updated: 0, files: [], message: 'no excel files found in ' + targetDir });
        }
        console.log('[scan-folder] found', files.length, 'excel files in', targetDir);
        const parsedFiles = [];
        for (const fp of files) {
          try {
            const st = fs.statSync(fp);
            const result = parseExcelFile(fp);
            for (const a of result.accounts) {
              a.source_file = path.basename(fp);
              if (!a.source_mtime) a.source_mtime = st.mtimeMs;
              /* account_date는 엑셀 셀에 적힌 날짜만 사용 — 파일명/다운로드 날짜 무관 */
            }
            parsedFiles.push({ name: path.basename(fp), accounts: result.accounts });
          } catch (e) {
            parsedFiles.push({ name: path.basename(fp), accounts: [], error: e.message });
          }
        }
        await withFileLock(() => {
          try {
            const dataFile = '/opt/gauth-full/accounts_normalized.json';
            let existing = [];
            try {
              const raw = fs.readFileSync(dataFile, 'utf8');
              if (!raw.trim()) throw new Error('empty file');
              const d = JSON.parse(raw);
              existing = Array.isArray(d) ? d : (d.accounts || []);
            } catch(e) {
              if (e.message !== 'empty file' && e.code !== 'ENOENT') {
                const backupPath = dataFile + '.corrupt.' + Date.now();
                try { fs.copyFileSync(dataFile, backupPath); } catch (_) {}
              }
            }
            const byEmail = {};
            for (const a of existing) { if (a && a.email) byEmail[normalizeEmail(a.email)] = a; }
            let totalParsed = 0, totalAdded = 0, totalUpdated = 0;
            const fileResults = [];
            for (const pf of parsedFiles) {
              if (pf.error) { fileResults.push({ name: pf.name, accounts: 0, error: pf.error }); continue; }
              let added = 0, updated = 0;
              for (const a of pf.accounts) {
                if (!a.email) continue;
                const key = normalizeEmail(a.email);
                if (byEmail[key]) {
                  const e = byEmail[key];
                  if (a.password && a.password !== e.password && !isTotpLike(a.password) && !isEmail(a.password) && !isUrlLike(a.password) && !isSixDigitCode(a.password) && !isPhoneNumber(a.password)) {
                    if (!e.password_alts) e.password_alts = [];
                    if (e.password && !e.password_alts.includes(e.password)) e.password_alts.push(e.password);
                    if (!e.password_alts.includes(a.password)) e.password_alts.push(a.password);
                    e.password = a.password;
                  }
                  if (a.totp_secret && isTotpLike(a.totp_secret)) e.totp_secret = normalizeTotp(a.totp_secret);
                  if (a.recovery_email && isEmail(a.recovery_email) && normalizeEmail(a.recovery_email) !== key) e.recovery_email = a.recovery_email;
                  if (a.youtube_url && isUrlLike(a.youtube_url)) e.youtube_url = a.youtube_url;
                  if (a.account_date) e.account_date = a.account_date;
                  e.source_mtime = a.source_mtime || Date.now();
                  e.source_file = a.source_file || e.source_file;
                  updated++;
                } else {
                  byEmail[key] = a;
                  added++;
                }
              }
              totalParsed += pf.accounts.length;
              totalAdded += added;
              totalUpdated += updated;
              fileResults.push({ name: pf.name, accounts: pf.accounts.length, added, updated });
            }
            const allAccounts = Object.values(byEmail);
            const tmpFile = dataFile + '.tmp.' + process.pid + '.' + Date.now();
            fs.writeFileSync(tmpFile, JSON.stringify(allAccounts, null, 2));
            fs.renameSync(tmpFile, dataFile);
            console.log('[scan-folder] merge done: total_master=' + allAccounts.length + ' parsed=' + totalParsed + ' added=' + totalAdded + ' updated=' + totalUpdated);
            res.json({ ok: true, total_master: allAccounts.length, total_parsed: totalParsed, added: totalAdded, updated: totalUpdated, files: fileResults });
          } catch(e) {
            console.error('[scan-folder] error:', e);
            if (!res.headersSent) res.status(500).json({ ok: false, error: 'internal error' });
          }
        });
      } catch(e) {
        console.error('[scan-folder] parse error:', e);
        if (!res.headersSent) res.status(400).json({ ok: false, error: e.message });
      }
    });
  });

  app.post('/api/upload-excels', async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    let files;
    try {
      files = await parseMultipartManual(req);
    } catch (err) {
      console.error('[upload-excels] parse error:', err.message);
      return res.status(500).json({ ok: false, error: 'upload failed' });
    }
    if (!files || !files.length) return res.status(400).json({ ok: false, error: 'no files' });

    const parsedFiles = [];
    for (const f of files) {
      try {
        const accounts = parseExcelFile(f.path, f.originalname);
        parsedFiles.push({ name: f.originalname, accounts });
      } catch(e) {
        parsedFiles.push({ name: f.originalname, accounts: [], error: e.message });
      }
      const archiveDir = path.join(__dirname, 'uploads', 'archive');
      try { fs.mkdirSync(archiveDir, { recursive: true }); } catch (_) {}
      const archiveName = (f.originalname || path.basename(f.path)).replace(/[^a-zA-Z0-9가-힣._\-]/g, '_');
      const archivePath = path.join(archiveDir, Date.now() + '_' + archiveName);
      try { fs.renameSync(f.path, archivePath); } catch (_) { try { fs.unlinkSync(f.path); } catch (_) {} }
      if (global.gc) global.gc();
    }

    console.log('[upload-excels] parsed files:', parsedFiles.map(pf => ({ name: pf.name, accounts: pf.accounts.length, error: pf.error || null })));

    await withFileLock(() => {
      try {
        const dataFile = '/opt/gauth-full/accounts_normalized.json';
        let existing = [];
        try {
          const raw = fs.readFileSync(dataFile, 'utf8');
          if (!raw.trim()) throw new Error('empty file');
          const d = JSON.parse(raw);
          existing = Array.isArray(d) ? d : (d.accounts || []);
        } catch(e) {
          if (e.message !== 'empty file' && e.code !== 'ENOENT') {
            const backupPath = dataFile + '.corrupt.' + Date.now();
            try { fs.copyFileSync(dataFile, backupPath); } catch (_) {}
            console.error('[upload-excels] corrupted JSON backed up to', backupPath, e.message);
          }
        }
        console.log('[upload-excels] existing accounts:', existing.length);
        const byEmail = {};
        for (const a of existing) {
          if (a && a.email) byEmail[normalizeEmail(a.email)] = a;
        }

        const fileResults = [];
        let totalParsed = 0, totalAdded = 0, totalUpdated = 0;
        for (const pf of parsedFiles) {
          if (pf.error) { fileResults.push({ name: pf.name, accounts: 0, error: pf.error }); continue; }
          let added = 0, updated = 0;
          for (const a of pf.accounts) {
            if (!a.email) continue;
            const key = normalizeEmail(a.email);
            if (byEmail[key]) {
              const e = byEmail[key];
              if (a.password && a.password !== e.password && !isTotpLike(a.password) && !isEmail(a.password) && !isUrlLike(a.password) && !isSixDigitCode(a.password) && !isPhoneNumber(a.password)) {
                if (!e.password_alts) e.password_alts = [];
                if (e.password && !e.password_alts.includes(e.password)) e.password_alts.push(e.password);
                if (!e.password_alts.includes(a.password)) e.password_alts.push(a.password);
                e.password = a.password;
              }
              if (a.totp_secret && isTotpLike(a.totp_secret)) e.totp_secret = normalizeTotp(a.totp_secret);
              if (a.recovery_email && isEmail(a.recovery_email) && normalizeEmail(a.recovery_email) !== key) e.recovery_email = a.recovery_email;
              if (a.youtube_url && isUrlLike(a.youtube_url)) e.youtube_url = a.youtube_url;
              if (a.extra && a.extra.length) {
                if (!e.extra) e.extra = [];
                for (const x of a.extra) { if (!e.extra.includes(x)) e.extra.push(x); }
              }
              e.source_mtime = a.source_mtime || Date.now();
              e.source_file = a.source_file || e.source_file;
              updated++;
            } else {
              byEmail[key] = a;
              added++;
            }
          }
          totalParsed += pf.accounts.length;
          totalAdded += added;
          totalUpdated += updated;
          fileResults.push({ name: pf.name, accounts: pf.accounts.length, added, updated });
        }

        const allAccounts = Object.values(byEmail);
        const tmpFile = dataFile + '.tmp.' + process.pid + '.' + Date.now();
        fs.writeFileSync(tmpFile, JSON.stringify(allAccounts, null, 2));
        fs.renameSync(tmpFile, dataFile);
        console.log('[upload-excels] merge done: total_master=' + allAccounts.length + ' parsed=' + totalParsed + ' added=' + totalAdded + ' updated=' + totalUpdated);
        res.json({ ok: true, total_master: allAccounts.length, total_parsed: totalParsed, added: totalAdded, updated: totalUpdated, files: fileResults, conflicts_count: 0, conflicts: [] });
      } catch(e) {
        console.error('[upload-excels] error:', e);
        if (!res.headersSent) res.status(500).json({ ok: false, error: 'internal error' });
      }
    });
  });

  app.post('/api/rescan-uploads', async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    const archiveDir = path.join(__dirname, 'uploads', 'archive');
    if (!fs.existsSync(archiveDir)) {
      return res.json({ ok: true, message: 'no archive directory', files: [] });
    }
    const exts = ['.xlsx', '.xls', '.csv'];
    const allFiles = [];
    try {
      for (const name of fs.readdirSync(archiveDir)) {
        const full = path.join(archiveDir, name);
        const ext = path.extname(name).toLowerCase();
        if (exts.includes(ext) || !ext) {
          allFiles.push(full);
        }
      }
    } catch (_) {}
    if (!allFiles.length) {
      return res.json({ ok: true, message: 'no archived files found', files: [] });
    }
    console.log('[rescan-uploads] found', allFiles.length, 'archived files');
    const parsedFiles = [];
    for (const fp of allFiles) {
      try {
        const accounts = parseExcelFile(fp, path.basename(fp));
        parsedFiles.push({ name: path.basename(fp), accounts });
      } catch (e) {
        parsedFiles.push({ name: path.basename(fp), accounts: [], error: e.message });
      }
    }
    await withFileLock(() => {
      try {
        const dataFile = '/opt/gauth-full/accounts_normalized.json';
        let existing = [];
        try {
          const raw = fs.readFileSync(dataFile, 'utf8');
          if (!raw.trim()) throw new Error('empty file');
          const d = JSON.parse(raw);
          existing = Array.isArray(d) ? d : (d.accounts || []);
        } catch (_) {}
        const byEmail = {};
        for (const a of existing) { if (a && a.email) byEmail[normalizeEmail(a.email)] = a; }
        let totalParsed = 0, totalUpdated = 0;
        const fileResults = [];
        for (const pf of parsedFiles) {
          if (pf.error) { fileResults.push({ name: pf.name, accounts: 0, error: pf.error }); continue; }
          let updated = 0;
          for (const a of pf.accounts) {
            if (!a.email) continue;
            const key = normalizeEmail(a.email);
            const e = byEmail[key];
            if (!e) continue;
            if (a.totp_secret && isTotpLike(a.totp_secret) && !e.totp_secret) { e.totp_secret = normalizeTotp(a.totp_secret); updated++; }
            if (a.recovery_email && isEmail(a.recovery_email) && !e.recovery_email && normalizeEmail(a.recovery_email) !== key) { e.recovery_email = a.recovery_email; updated++; }
            if (a.youtube_url && isUrlLike(a.youtube_url) && !e.youtube_url) { e.youtube_url = a.youtube_url; updated++; }
            if (a.password && !e.password) { e.password = a.password; updated++; }
          }
          totalParsed += pf.accounts.length;
          totalUpdated += updated;
          fileResults.push({ name: pf.name, accounts: pf.accounts.length, updated });
        }
        const allAccounts = Object.values(byEmail);
        const tmpFile = dataFile + '.tmp.' + process.pid + '.' + Date.now();
        fs.writeFileSync(tmpFile, JSON.stringify(allAccounts, null, 2));
        fs.renameSync(tmpFile, dataFile);
        res.json({ ok: true, total_master: allAccounts.length, total_parsed: totalParsed, updated: totalUpdated, files: fileResults });
      } catch (e) {
        console.error('[rescan-uploads] error:', e);
        if (!res.headersSent) res.status(500).json({ ok: false, error: 'internal error' });
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
_exports.isPhoneNumber = isPhoneNumber;
_exports.isSixDigitCode = isSixDigitCode;
module.exports = _exports;
