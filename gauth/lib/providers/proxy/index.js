/**
 * 프록시 회전 시스템
 *
 * 지원 프로바이더 (원본 문서):
 *   - Bright Data:  https://docs.brightdata.com/api-reference/proxy
 *   - Smartproxy:   https://help.smartproxy.com/docs/residential-proxies
 *   - Oxylabs:      https://developers.oxylabs.io/scraper-apis/getting-started
 *   - IPRoyal:      https://iproyal.com/blog/how-to-use-iproyal-residential-proxies/
 *   - SOAX:         https://helpcenter.soax.com/en/collections/2183440-proxies
 *
 * 무료 프록시 풀 (GitHub 자동 갱신):
 *   - proxifly/free-proxy-list  https://github.com/proxifly/free-proxy-list
 *   - TheSpeedX/PROXY-List      https://github.com/TheSpeedX/PROXY-List
 *   - vakhov/fresh-proxy-list   https://github.com/vakhov/fresh-proxy-list
 *
 * puppeteer.launch({ args: ['--proxy-server=$server'] })
 * page.authenticate({ username, password })
 */
'use strict'

const fs = require('fs')
const path = require('path')

function parseProxyURL(str) {
  try {
    const u = new URL(str)
    return {
      server: `${u.protocol}//${u.hostname}:${u.port}`,
      username: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      type: u.protocol.replace(':', ''),
    }
  } catch { return null }
}

function loadPool() {
  const pool = []

  // 1. 환경변수 프록시 (유료)
  const envs = {
    brightdata: process.env.BRIGHTDATA_PROXY,
    smartproxy: process.env.SMARTPROXY_PROXY,
    oxylabs: process.env.OXYLABS_PROXY,
    iproyal: process.env.IPROYAL_PROXY,
    soax: process.env.SOAX_PROXY,
  }
  for (const [name, raw] of Object.entries(envs)) {
    if (!raw) continue
    const p = parseProxyURL(raw)
    if (p) pool.push({ ...p, provider: name })
  }

  const custom = process.env.CUSTOM_PROXY_LIST
  if (custom) {
    for (const raw of custom.split(';').map(s => s.trim()).filter(Boolean)) {
      const p = parseProxyURL(raw)
      if (p) pool.push({ ...p, provider: 'custom' })
    }
  }

  // 2. proxy_pool.json (무료, fetch_free.js로 자동 갱신)
  const poolPath = path.join(__dirname, '..', '..', '..', 'proxy_pool.json')
  try {
    if (fs.existsSync(poolPath)) {
      const data = JSON.parse(fs.readFileSync(poolPath, 'utf8'))
      const proxies = data.proxies || []
      for (const p of proxies) {
        pool.push({
          server: p.server,
          username: '',
          password: '',
          type: p.type || 'socks5',
          provider: `free:${p.source || 'unknown'}`,
        })
      }
    }
  } catch {}

  return pool
}

let rotationIdx = 0
function nextProxy() {
  const pool = loadPool()
  if (pool.length === 0) return null
  const p = pool[rotationIdx % pool.length]
  rotationIdx++
  return p
}

function poolInfo() {
  const pool = loadPool()
  const providers = {}
  for (const p of pool) {
    providers[p.provider] = (providers[p.provider] || 0) + 1
  }
  return { count: pool.length, providers }
}

module.exports = { nextProxy, poolInfo, loadPool, parseProxyURL }
