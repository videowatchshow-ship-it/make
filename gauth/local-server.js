/* 로컬 실행용 gauth 서버
 * 실행: node local-server.js
 * ref: https://github.com/expressjs/express */
'use strict';

const path = require('path');
const fs = require('fs');

// 로컬 데이터 경로 설정
const LOCAL_DATA_DIR = path.join(__dirname, 'local-data');
const LOCAL_FRONTEND_DIR = __dirname;

process.env.GAUTH_DATA_DIR = LOCAL_DATA_DIR;
process.env.GAUTH_FRONTEND_DIR = LOCAL_FRONTEND_DIR;

// .env 파일 로드 (dotenv 없이 수동 파싱)
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  });
}

const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 엑셀 업로드용 multer
const upload = multer({
  dest: path.join(LOCAL_DATA_DIR, 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }
});
app.set('multerUpload', upload);

// gauth API 라우트 등록
require('./auto_deploy.js')(app);

// 프론트엔드 정적 파일 서빙
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  gauth 로컬 서버 실행 중`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  API 토큰: ${process.env.GAUTH_API_TOKEN || '(미설정 — .env.local 확인)'}`);
  console.log(`  데이터: ${LOCAL_DATA_DIR}\n`);
});
