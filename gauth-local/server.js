'use strict';
const path = require('path');
const fs = require('fs');

// 경로 설정 (다른 모듈 require 전에 반드시 먼저 실행)
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const FRONTEND_DIR = path.join(ROOT, '..', 'gauth');

process.env.GAUTH_DATA_DIR = DATA_DIR;
process.env.GAUTH_PROFILES_DIR = PROFILES_DIR;
process.env.GAUTH_FRONTEND_DIR = FRONTEND_DIR;

// .env 로드
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch (_) {}

// 디렉토리 생성
[DATA_DIR, PROFILES_DIR, path.join(DATA_DIR, 'uploads')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// accounts 파일 초기화
const DATA_FILE = path.join(DATA_DIR, 'accounts_normalized.json');
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서비스 (gauth/ 폴더의 index.html 등)
app.use(express.static(FRONTEND_DIR));

// API 라우트 마운트
require('../gauth/auto_deploy')(app);
require('../gauth/upload_excels')(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  gauth 로컬 서버 실행 중');
  console.log('  브라우저: http://localhost:' + PORT);
  console.log('  데이터:   ' + DATA_DIR);
  console.log('');
  if (!process.env.GAUTH_API_TOKEN) {
    console.warn('  [경고] GAUTH_API_TOKEN 미설정 → .env 파일에 추가하세요');
  }
});
