/**
 * 무료 SOCKS5 프록시 리스트 자동 갱신
 *
 * 원본 소스 (모두 GitHub, 무료, 자동 갱신):
 *   - proxifly/free-proxy-list (5분 갱신, 110개국, 2600+개)
 *     https://github.com/proxifly/free-proxy-list
 *   - TheSpeedX/PROXY-List (매일 갱신)
 *     https://github.com/TheSpeedX/PROXY-List
 *   - vakhov/fresh-proxy-list (5-20분 갱신)
 *     https://github.com/vakhov/fresh-proxy-list
 *
 * 사용법: node fetch_free.js → /opt/gauth-full/proxy_pool.json 에 저장
 * cron: every 30 min — cd /opt/gauth-full && node lib/providers/proxy/fetch_free.js
 */
'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')

const SOURCES = [
  {
    name: 'proxifly',
    url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt',
    type: 'socks5',
  },
  {
    name: 'TheSpeedX',
    url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
    type: 'socks5',
  },
  {
    name: 'vakhov',
    url: 'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt',
    type: 'socks5',
  },
]

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve, reject)
      }
      let buf = ''
      res.on('data', d => buf += d)
      res.on('end', () => resolve(buf))
    }).on('error', reject)
  })
}

function parseProxyList(text) {
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(line))
    .map(line => {
      const [host, port] = line.split(':')
      return { host, port: parseInt(port), server: `socks5://${host}:${port}` }
    })
}

async function fetchAll({ save = true } = {}) {
  const all = []
  for (const src of SOURCES) {
    try {
      const text = await fetchURL(src.url)
      const proxies = parseProxyList(text)
      proxies.forEach(p => { p.source = src.name; p.type = src.type })
      all.push(...proxies)
      console.log(`${src.name}: ${proxies.length} proxies`)
    } catch (e) {
      console.error(`${src.name} fetch failed: ${e.message}`)
    }
  }

  // 중복 제거 (host:port 기준)
  const seen = new Set()
  const unique = all.filter(p => {
    const key = `${p.host}:${p.port}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (!save) return unique

  const shuffled = unique.sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, 200)

  const outPath = path.join(__dirname, '..', '..', '..', 'proxy_pool.json')
  fs.writeFileSync(outPath, JSON.stringify({
    updated_at: new Date().toISOString(),
    total: selected.length,
    proxies: selected,
  }, null, 2))
  console.log(`saved ${selected.length} proxies to ${outPath}`)
  return selected
}

if (require.main === module) {
  fetchAll().catch(e => console.error(e))
}

module.exports = { fetchAll, fetchURL, parseProxyList }
