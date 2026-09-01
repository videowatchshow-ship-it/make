'use strict'
/**
 * 프록시 사전 검증 — SOCKS5 핸드셰이크로 YouTube 도달 가능 여부 확인
 * 사용: node verify_proxies.js [입력파일] [출력파일]
 *       입력 없으면 proxy_pool.json 읽고 덮어씀
 *
 * 검증 방식: SOCKS5 handshake → youtube.com:443 CONNECT → TCP 수립 확인
 * 외부 라이브러리 불필요 (순수 Node.js net)
 */

const net = require('net')
const fs = require('fs')
const path = require('path')
const { fetchAll } = require('./fetch_free')

const CONCURRENCY = 150
const TIMEOUT_MS = 6000
const TARGET_HOST = 'www.youtube.com'
const TARGET_PORT = 443

function verifySocks5(host, port) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    let done = false
    const finish = ok => {
      if (done) return
      done = true
      sock.destroy()
      resolve(ok)
    }

    const timer = setTimeout(() => finish(false), TIMEOUT_MS)

    sock.once('error', () => { clearTimeout(timer); finish(false) })
    sock.once('timeout', () => { clearTimeout(timer); finish(false) })
    sock.setTimeout(TIMEOUT_MS)

    sock.connect(port, host, () => {
      // Step 1: 인증 없는 SOCKS5 협상
      sock.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    let step = 0
    sock.on('data', chunk => {
      if (step === 0) {
        // Expect: 05 00 (no auth accepted)
        if (chunk[0] !== 0x05 || chunk[1] !== 0x00) { clearTimeout(timer); finish(false); return }
        step = 1
        // Step 2: CONNECT to youtube.com:443
        const hostBuf = Buffer.from(TARGET_HOST)
        const req = Buffer.alloc(7 + hostBuf.length)
        req[0] = 0x05 // SOCKS5
        req[1] = 0x01 // CONNECT
        req[2] = 0x00 // reserved
        req[3] = 0x03 // domain name
        req[4] = hostBuf.length
        hostBuf.copy(req, 5)
        req.writeUInt16BE(TARGET_PORT, 5 + hostBuf.length)
        sock.write(req)
      } else if (step === 1) {
        // Expect: 05 00 (success)
        clearTimeout(timer)
        finish(chunk[0] === 0x05 && chunk[1] === 0x00)
      }
    })
  })
}

async function runBatch(proxies, concurrency) {
  const good = []
  let idx = 0
  let tested = 0

  async function worker() {
    while (idx < proxies.length) {
      const p = proxies[idx++]
      const ok = await verifySocks5(p.host, p.port)
      tested++
      if (ok) good.push(p)
      if (tested % 100 === 0 || tested === proxies.length) {
        process.stdout.write(`\r검증 중... ${tested}/${proxies.length} 완료, 통과: ${good.length}`)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, proxies.length) }, worker)
  await Promise.all(workers)
  process.stdout.write('\n')
  return good
}

async function main() {
  const poolPath = path.join(__dirname, '..', '..', '..', 'proxy_pool.json')
  const outPath = process.argv[3] || poolPath

  let proxies
  if (process.argv[2] && fs.existsSync(process.argv[2])) {
    // txt 파일에서 읽기 (ip:port 형식)
    const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n')
    proxies = lines
      .map(l => l.trim())
      .filter(l => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l))
      .map(l => { const [host, p] = l.split(':'); return { host, port: +p, server: `socks5://${host}:${p}`, type: 'socks5', source: 'file' } })
  } else {
    // 새로 수집 후 검증
    console.log('프록시 리스트 수집 중...')
    proxies = await fetchAll({ save: false })
  }

  console.log(`총 ${proxies.length}개 수집, YouTube 도달 검증 시작 (concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms)`)
  const good = await runBatch(proxies, CONCURRENCY)
  console.log(`검증 완료: ${good.length}/${proxies.length} 통과 (${(good.length/proxies.length*100).toFixed(1)}%)`)

  // 최대 500개 저장 (많을수록 좋음)
  const selected = good.sort(() => Math.random() - 0.5).slice(0, 500)
  fs.writeFileSync(outPath, JSON.stringify({
    updated_at: new Date().toISOString(),
    total: selected.length,
    verified: true,
    proxies: selected,
  }, null, 2))
  console.log(`저장 완료: ${outPath} (${selected.length}개)`)
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}

module.exports = { verifySocks5, runBatch }
