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

  // no header → analyze column data
  if (!mapping) {
    // skip non-data first row if present
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

module.exports = { parseExcelFile, parseMultipleFiles, extractAccountsFromSheet, normalizeTotp, isTotpLike, isEmail, analyzeColumns };
