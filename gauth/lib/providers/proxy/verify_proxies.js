'use strict'
/**
 * 프록시 사전 검증
 * 참조: https://github.com/JoshGlazebrook/socks (v2.8.3)
 *
 * 사용:
 *   node verify_proxies.js                   → 새로 수집 + 검증
 *   node verify_proxies.js proxies.txt       → txt(ip:port 줄) 읽어서 검증
 */

const { SocksClient } = require('socks');
const fs = require('fs');
const path = require('path');
const { fetchAll } = require('./fetch_free');

const CONCURRENCY = 150;
const TIMEOUT_MS = 6000;
const MAX_SAVE = 500;

// 검증 대상: YouTube TCP 연결
const DEST_HOST = 'www.youtube.com';
const DEST_PORT = 443;

// 공식 예제 구조 그대로 (README: SocksClient.createConnection)
async function verifySocks5(host, port) {
  const options = {
    proxy: {
      host: host,       // ipv4, ipv6, or hostname
      port: Number(port),
      type: 5           // SOCKS5
    },

    command: 'connect',

    destination: {
      host: DEST_HOST,
      port: DEST_PORT
    },

    timeout: TIMEOUT_MS
  };

  try {
    const info = await SocksClient.createConnection(options);
    info.socket.destroy();
    return true;
  } catch (err) {
    return false;
  }
}

async function runBatch(proxies) {
  const good = [];
  let idx = 0;
  let tested = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= proxies.length) break;
      const p = proxies[i];
      const ok = await verifySocks5(p.host, p.port);
      tested++;
      if (ok) good.push(p);
      if (tested % 100 === 0 || tested === proxies.length) {
        process.stdout.write(`\r검증 ${tested}/${proxies.length}  통과: ${good.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, proxies.length) }, worker));
  process.stdout.write('\n');
  return good;
}

async function main() {
  const poolPath = path.join(__dirname, '..', '..', '..', 'proxy_pool.json');
  const outPath = process.argv[3] || poolPath;

  let proxies;
  const inputFile = process.argv[2];
  if (inputFile && fs.existsSync(inputFile)) {
    const lines = fs.readFileSync(inputFile, 'utf8').split('\n');
    proxies = lines
      .map(l => l.trim())
      .filter(l => /^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$/.test(l))
      .map(l => {
        const [h, p] = l.split(':');
        return { host: h, port: Number(p), server: `socks5://${h}:${p}`, type: 'socks5', source: 'file' };
      });
    console.log(`파일에서 ${proxies.length}개 로드: ${inputFile}`);
  } else {
    console.log('프록시 수집 중...');
    proxies = await fetchAll({ save: false });
    console.log(`수집: ${proxies.length}개`);
  }

  console.log(`YouTube(${DEST_HOST}:${DEST_PORT}) TCP 연결 검증 시작 (동시=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms)`);
  const good = await runBatch(proxies);
  const pct = proxies.length ? (good.length / proxies.length * 100).toFixed(1) : '0.0';
  console.log(`완료: ${good.length}/${proxies.length} 통과 (${pct}%)`);

  const selected = good.sort(() => Math.random() - 0.5).slice(0, MAX_SAVE);
  fs.writeFileSync(outPath, JSON.stringify({
    updated_at: new Date().toISOString(),
    total: selected.length,
    verified: true,
    target: `${DEST_HOST}:${DEST_PORT}`,
    proxies: selected,
  }, null, 2));
  console.log(`저장: ${outPath} (${selected.length}개)`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { verifySocks5, runBatch };
