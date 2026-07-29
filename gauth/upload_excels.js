/**
 * Excel parser for gauth accounts.
 * Improved: header-detection first, positional fallback second.
 * Replaces type-detection approach that caused TOTP/password/recovery misassignment.
 *
 * Deploy: copy to /opt/gauth-full/upload_excels.js on gucci-yanolza
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const HEADER_PATTERNS = {
  email:    /^(e[-_]?mail|login|account|user|gmail|id)/i,
  password: /^(pass(word)?|pw|pwd|비밀번호|비번)/i,
  totp:     /^(totp|2fa|secret|otp|mfa|인증)/i,
  recovery: /^(recover|backup|alt.*mail|second.*mail|복구)/i,
  youtube:  /^(youtube|yt|url|link|channel|채널)/i,
};

const POSITIONAL_FALLBACK = { email: 0, password: 1, totp: 2, recovery: 3, youtube: 4 };

function normalizeTotp(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[\s\-_]/g, '').replace(/[^A-Z2-7]/g, '');
}

function isTotpSecret(s) {
  if (!s) return false;
  s = String(s);
  if (s.includes('@')) return false;
  const n = normalizeTotp(s);
  return n.length >= 16 && n.length <= 128;
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

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

function extractAccountsFromSheet(sheet, sourceFile) {
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
    mapping = { ...POSITIONAL_FALLBACK };
    startRow = 0;
    if (rows.length > 0 && rows[0].length > 0) {
      const firstCell = String(rows[0][0] || '').trim();
      if (firstCell && !isEmail(firstCell)) {
        startRow = 1;
      }
    }
  }

  const accounts = [];
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
      const usedCols = Object.values(mapping);
      if (!usedCols.includes(c)) {
        const v = String(row[c] || '').trim();
        if (v) extra.push(v);
      }
    }

    accounts.push({
      email,
      password,
      totp_secret: isTotpSecret(totpRaw) ? normalizeTotp(totpRaw) : totpRaw,
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

module.exports = { parseExcelFile, parseMultipleFiles, extractAccountsFromSheet, normalizeTotp, isTotpSecret, isEmail };
