/**
 * lib/login/google.js — Google 로그인 실행 함수
 *
 * 원본 로직 조합 (모두 검증된 실전 코드):
 *   1. the-type-founders/continue-with-google (Promise.any 레이스, 2026-06)
 *      https://github.com/the-type-founders/continue-with-google/blob/main/src/index.ts
 *   2. hasanbasri1993/puppeteer_admin_google (waitForSelector visible, evaluate value='', 재시도)
 *      https://github.com/hasanbasri1993/puppeteer_admin_google/blob/main/services/authService.js
 *   3. AfterDawn1130/Gmail_tools (다국어 body 감지, URL 우선판정)
 *      https://github.com/AfterDawn1130/Gmail_tools/blob/main/oauth-login/src/google-login.js
 *   4. Puppeteer 공식 cookies API (세션 저장)
 *      https://pptr.dev/guides/cookies
 */

'use strict'

const https = require('https')
const { classify } = require('./urls')
const S = require('./selectors')
const { configurePage } = require('../launcher')
const { generateTOTP: generateTotpLocal } = require('../totp_local')
const { solveRecaptchaV2 } = require('../captcha')
const captchaManager = require('../providers/captcha')
const { solveTextCaptcha } = require('../providers/captcha/gemini_text')

const wait = ms => new Promise(r => setTimeout(r, ms))

// ── 2fa.cn 공식 API를 이용한 TOTP 생성 ──────────────────────────────────────
// 원본 API: GET https://2fa.cn/codes/{secret}
// 응답: {"code":"123456","ostring":"SECRET"}
// (2fa.cn/js/main.js 소스에서 확인, 공식 페이지 방식 그대로 카피)
function generateTotpVia2faCn(secret) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '2fa.cn',
      path: '/codes/' + encodeURIComponent(secret),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://2fa.cn/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      timeout: 10000,
    }
    const req = https.request(opts, res => {
      let buf = ''
      res.on('data', d => (buf += d))
      res.on('end', () => {
        try {
          const j = JSON.parse(buf)
          if (j && /^\d{6,8}$/.test(String(j.code || ''))) resolve(String(j.code))
          else reject(new Error('2fa.cn 응답 이상: ' + buf.slice(0, 100)))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('2fa.cn timeout')) })
    req.end()
  })
}

// ── 유틸: body 텍스트 안전 조회 ─────────────────────────────────────────────
async function readBody(page) {
  try {
    return (await page.evaluate(() => (document.body?.innerText || document.body?.textContent || ''))).toLowerCase()
  } catch { return '' }
}

async function bodyIncludesAny(page, keywords) {
  const t = await readBody(page)
  for (const k of keywords) if (t.includes(k.toLowerCase())) return k
  return null
}

// ── 유틸: URL 안정화까지 대기 (network idle 대신 URL 폴링) ─────────────────
// puppeteer_admin_google 카피
async function waitForUrlChange(page, currentUrl, maxMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (page.url() !== currentUrl) return page.url()
    await wait(300)
  }
  return page.url()
}

// ── 이메일 입력 ────────────────────────────────────────────────────────────
async function fillEmail(page, email, log) {
  log(`이메일 입력 대기: ${email}`)
  await page.waitForSelector(S.EMAIL_INPUT, { visible: true, timeout: 20000 })
  // evaluate로 필드 초기화 (원본: puppeteer_admin_google)
  await page.evaluate(sel => {
    const el = document.querySelector(sel)
    if (el) el.value = ''
  }, S.EMAIL_INPUT)
  await page.type(S.EMAIL_INPUT, email, { delay: 60 })
  await wait(500)
  // #identifierNext 버튼 클릭 우선, 없으면 Enter fallback
  const nextBtn = await page.$('#identifierNext').catch(() => null)
  if (nextBtn) {
    log('identifierNext 버튼 클릭')
    await nextBtn.click()
  } else {
    log('버튼 없음 → Enter 키')
    await page.keyboard.press('Enter')
  }
}

// ── 비번 필드 우선 대기, 도착 못하면 CAPTCHA/기타 판정 ────────────────────
// continue-with-google 방식 개선 (iframe은 백그라운드 리소스일 수 있으므로 오탐 방지)
async function awaitPasswordOrCaptcha(page, log) {
  log('비밀번호 필드 대기')
  const pwFound = await page.waitForSelector(S.PASSWORD_INPUT, { visible: true, timeout: 20000 })
    .then(() => true).catch(() => false)
  if (pwFound) return false  // 정상 비번 화면

  // 비번 필드 못 찾음 → 왜 그런지 조사
  // 1) 텍스트형 CAPTCHA (input#ca) 있으면 → text-captcha
  const textCaptcha = await page.$(S.CAPTCHA_INPUT).catch(() => null)
  if (textCaptcha) { log('텍스트형 CAPTCHA 감지'); return 'text' }

  // 2) reCAPTCHA iframe이 실제로 visible/interactable 인지 확인
  const iframeVisible = await page.evaluate(sel => {
    const el = document.querySelector(sel)
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 50 && r.height > 50 && el.offsetParent !== null
  }, S.CAPTCHA_IFRAME).catch(() => false)
  if (iframeVisible) { log('reCAPTCHA iframe visible 감지'); return 'recaptcha' }

  // 3) 그 외에는 URL 기반으로 상위에서 판정
  return null
}

// ── CAPTCHA 자동 해결 (통합 매니저: page-based 무료 → sitekey 유료) ─────────
// 원본:
//   - Gemini vision (page-based, 무료): https://ai.google.dev
//   - wit.ai audio  (page-based, 무료): https://wit.ai
//   - 2captcha/anticaptcha/... (sitekey, 유료): https://2captcha.com/2captcha-api
async function trySolveCaptcha(page, log) {
  const pageAvail = captchaManager.availablePageAdapters()
  const skAvail = captchaManager.availableSitekeyAdapters()
  if (pageAvail.length === 0 && skAvail.length === 0) {
    log('CAPTCHA 어댑터 키 없음 (GEMINI_API_KEY / WIT_AI_KEYS / TWOCAPTCHA_API_KEY 등)')
    return false
  }
  try {
    // sitekey 추출 (sitekey 어댑터용)
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]')
      if (el) return { sitekey: el.getAttribute('data-sitekey'), invisible: el.getAttribute('data-size') === 'invisible' }
      const iframe = document.querySelector('iframe[src*="recaptcha"]')
      if (iframe) {
        const m = iframe.src.match(/[?&]k=([^&]+)/)
        if (m) return { sitekey: m[1], invisible: iframe.src.includes('invisible') }
      }
      return null
    })
    const pageurl = page.url()
    const frameUrls = page.frames().map(f => f.url().slice(0, 120))
    log(`CAPTCHA 매니저 호출: page=${pageAvail.length}개, sitekey=${skAvail.length}개, sitekey값=${info?.sitekey?.slice(0,15)||'없음'}`)
    log(`frames (${frameUrls.length}): ${frameUrls.join(' | ')}`)

    const result = await captchaManager.solveAny({
      page,
      sitekey: info?.sitekey,
      pageurl,
      invisible: info?.invisible,
      log: msg => log(msg),
    })
    const token = result.token
    log(`CAPTCHA ✅ (${result.provider}): 토큰 ${token.slice(0, 30)}...`)

    // 페이지에 token 주입
    await page.evaluate(t => {
      const ta = document.getElementById('g-recaptcha-response')
      if (ta) { ta.style.display = 'block'; ta.value = t }
      // 콜백 트리거 시도
      if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
        try {
          const clients = window.___grecaptcha_cfg.clients
          for (const cid in clients) {
            const cli = clients[cid]
            for (const k in cli) {
              const obj = cli[k]
              if (obj && obj.callback && typeof obj.callback === 'function') {
                obj.callback(t)
              }
            }
          }
        } catch (e) { /* 무시 */ }
      }
    }, token)
    return true
  } catch (err) {
    log(`2captcha 실패: ${err.message}`)
    return false
  }
}

// ── 로그인 마무리 페이지에서 "확인/계속/Not now" 버튼 자동 클릭 ────────────
// Google이 로그인 후 띄우는 여러 확인 페이지 처리:
//   - 약관/개인정보 동의 (speedbump/gaplustos, consent)
//   - Passkey 등록 유도 → "Not now"
//   - 복구 전화 추가 → "Skip"
//   - Anywhere Sign-in → "Yes, it's me"
//   - 저장 유도 → "Never"
// 원본 참고:
//   - hasanbasri1993/puppeteer_admin_google (submit 버튼 fallback 패턴)
//   - AfterDawn1130/Gmail_tools (다국어 버튼 텍스트)
async function autoConfirm(page, log) {
  // 원본 카피(2026-07 확인):
  //   - hasanbasri1993/puppeteer_admin_google/services/authService.js
  //   - AfterDawn1130/Gmail_tools/oauth-login/src/{google-login,profile-nurture}.js
  const KEYWORDS_PRIMARY = [
    // English (Google/AfterDawn 원본 관측)
    'Continue', 'Confirm', 'Next', 'Done', 'OK', 'Accept', 'I agree', 'I understand',
    "Yes, it's me", 'Allow', 'Got it', 'Verify', 'Send', 'Turn on sync',
    'Sign in with Google', 'Sign in with',
    // Korean
    '계속', '확인', '다음', '완료', '동의', '이해했습니다', '네', '허용', '인증', '전송',
    // Chinese
    '继续', '确认', '下一步', '完成', '同意', '允许', '验证',
  ]
  const KEYWORDS_SKIP = [
    // English
    'Not now', 'Skip', 'No thanks', 'Cancel', 'Never', 'Later', 'Maybe later',
    'No, switch account', 'Try another way', 'Choose another way', 'Choose a way',
    // Korean
    '나중에', '건너뛰기', '취소', '사용 안 함', '아니요', '다른 방법 사용', '다른 방법', '다른 방법 선택',
    // Chinese
    '暂时不', '跳过', '取消', '选择另一种方式',
  ]
  // 실패 감지 키워드 (원본: AfterDawn google-login.js) — 페이지에 뜨면 즉시 종료
  const FAIL_TEXTS = ["couldn't sign you in", "couldn't verify", "Wrong password", "확인할 수 없", "로그인할 수 없"]
  try {
    const failText = await page.evaluate(list => {
      const body = (document.body?.innerText || '').toLowerCase()
      return list.find(t => body.includes(t.toLowerCase())) || null
    }, FAIL_TEXTS).catch(() => null)
    if (failText) { log(`autoConfirm: 실패 텍스트 감지 "${failText}"`); return false }
  } catch {}

  // 1) primary action-label + 관측된 ID 셀렉터 (원본 리포에서 실제 사용)
  const primarySelectors = [
    '[data-primary-action-label]',
    '[data-primary-action-label="Next"]',
    '[data-primary-action-label="Verify"]',
    '[data-primary-action-label="Confirm"]',
    '[data-primary-action-label="Continue"]',
    'button[jsname="LgbsSe"]',
    'button[jsname="XIvz0b"]',
    'button[type="submit"]',
    '#confirm',
    '#submit_approve_access',
    '#submitBtn',
    '#identifierNext',
    '#passwordNext',
    '#totpNext',
    '#idvanyphonecollectNext',
    '#signin-promo-ok-button',
    '#signin-promo-close-button',
  ]
  for (const sel of primarySelectors) {
    const btn = await page.$(sel).catch(() => null)
    if (!btn) continue
    const visible = await page.evaluate(el => el && el.offsetParent !== null, btn).catch(() => false)
    if (visible) {
      const label = await page.evaluate(el => el.innerText || el.textContent || '', btn).catch(() => '')
      log(`autoConfirm: primary "${sel}" (${label.trim().slice(0, 30)}) 클릭`)
      await btn.click().catch(() => {})
      return true
    }
  }

  // 2) 텍스트 기반 (button/span/div role=button)
  for (const kws of [KEYWORDS_SKIP, KEYWORDS_PRIMARY]) {
    for (const kw of kws) {
      const clicked = await page.evaluate(text => {
        const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
        const t = norm(text)
        const nodes = document.querySelectorAll('button, [role="button"], span[jsname], a[role="button"]')
        for (const n of nodes) {
          const label = norm(n.innerText || n.textContent)
          if (label === t || label.includes(t)) {
            if (n.offsetParent === null) continue
            n.click()
            return label
          }
        }
        return null
      }, kw).catch(() => null)
      if (clicked) { log(`autoConfirm: text "${kw}" → 클릭됨 (${clicked})`); return true }
    }
  }
  return false
}

// ── 비밀번호 입력 ──────────────────────────────────────────────────────────
async function fillPassword(page, password, log) {
  log('비밀번호 입력')
  await page.waitForSelector(S.PASSWORD_INPUT, { visible: true, timeout: 15000 })
  await page.evaluate(sel => {
    const el = document.querySelector(sel)
    if (el) el.value = ''
  }, S.PASSWORD_INPUT)
  await page.type(S.PASSWORD_INPUT, password, { delay: 60 })
  await wait(500)

  // ⭐ passwordNext 버튼 클릭 우선 (원본: hasanbasri1993/puppeteer_admin_google)
  //   https://github.com/hasanbasri1993/puppeteer_admin_google/blob/main/services/authService.js
  const pwBtn = await page.$('#passwordNext').catch(() => null)
  if (pwBtn) {
    log('passwordNext 버튼 클릭')
    await pwBtn.click()
  } else {
    log('passwordNext 없음 → Enter fallback')
    await page.keyboard.press('Enter')
  }
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {})
  await wait(1500)
}

// ── TOTP 코드 입력 (최대 5회 재시도) ──────────────────────────────────────
// 원본: puppeteer_admin_google (Google이 두 번 요구할 수 있음)
async function submit2FA(page, totpSecret, log, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const cls = classify(page.url())
    log(`2FA 시도 ${attempt}/${maxAttempts} [${cls.kind}]`)

    // 선택 페이지면 TOTP 옵션 클릭
    if (cls.kind === 'CHALLENGE_SELECTION') {
      const totpBtn = await page.$(S.CHALLENGE_TYPE.TOTP).catch(() => null)
                     || await page.$(S.CHALLENGE_TYPE.TOTP_ALT).catch(() => null)
      if (totpBtn) {
        log('선택 페이지에서 Authenticator 옵션 클릭')
        await totpBtn.click()
        await wait(2500)
        continue
      } else {
        return { ok: false, reason: 'CHALLENGE_SELECTION_NO_TOTP_OPTION' }
      }
    }

    // TOTP 입력 필드 대기
    const totpEl = await page.waitForSelector(S.TOTP_INPUT, { visible: true, timeout: 8000 }).catch(() => null)
    if (!totpEl) {
      // TOTP 화면이 아닐 수도 있음 → 상위에서 재판정
      return { ok: false, reason: 'TOTP_FIELD_NOT_FOUND' }
    }

    let code
    try {
      // 1차: 로컬 RFC 6238 (2fa.cn과 동일 로직, 오프라인, 즉시)
      code = generateTotpLocal(totpSecret)
      log(`TOTP 생성 (로컬 RFC 6238): ${code}`)
    } catch (e) {
      // 2차 fallback: 2fa.cn API
      try {
        code = await generateTotpVia2faCn(totpSecret)
        log(`TOTP 생성 (2fa.cn fallback): ${code}`)
      } catch (e2) {
        log(`❌ TOTP 생성 실패 (로컬+2fa.cn 둘 다): ${e.message} / ${e2.message}`)
        return { ok: false, reason: 'TOTP_GEN_FAILED' }
      }
    }
    await page.evaluate(sel => {
      const els = document.querySelectorAll(sel)
      els.forEach(el => { if (el.offsetParent !== null) el.value = '' })
    }, S.TOTP_INPUT)
    await totpEl.focus()
    await page.keyboard.type(code, { delay: 60 })
    await wait(500)

    // submit — 원본 카피: hasanbasri1993/puppeteer_admin_google
    //   https://github.com/hasanbasri1993/puppeteer_admin_google/blob/main/services/authService.js
    //   submitSelectors 개별 순회 + visibility 확인 후 클릭
    const submitSelectors = [
      '#totpNext',
      'button[type="submit"]',
      '[data-primary-action-label="Next"]',
      '[data-primary-action-label="Verify"]',
      'div[role="button"][data-primary-action-label]',
      'button[jsname="LgbsSe"]',
    ]
    let submitted = false
    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel)
        if (btn) {
          const isVisible = await page.evaluate(el => el && el.offsetParent !== null, btn).catch(() => false)
          if (isVisible) {
            log(`submit 클릭: ${sel}`)
            await btn.click()
            submitted = true
            break
          }
        }
      } catch { /* 다음 selector */ }
    }
    if (!submitted) {
      log('submit 버튼 없음 → Enter 키 fallback')
      await page.keyboard.press('Enter')
    }
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {})
    await wait(2500)

    // 결과 확인
    const after = classify(page.url())
    if (after.kind === 'SUCCESS') return { ok: true }
    if (after.kind === 'TOTP') { log('TOTP 다시 요구됨, 새 코드 재시도'); continue }
    if (after.kind === 'CHALLENGE_SELECTION') continue
    // 인터스티셜/사후 페이지 → 상위 autoConfirm 루프에서 처리 (성공 취급)
    if (['INTERSTITIAL', 'SIGNIN_IN_PROGRESS', 'OAUTH_CONSENT'].includes(after.kind)) {
      log(`TOTP 통과, 확인 페이지 도달 [${after.kind}] → 상위 autoConfirm 진행`)
      return { ok: true }
    }
    // 다른 challenge로 이동 → 상위에서 처리
    return { ok: false, reason: `AFTER_TOTP_${after.kind}` }
  }
  return { ok: false, reason: 'TOTP_MAX_ATTEMPTS' }
}

// ── 메인 로그인 함수 ───────────────────────────────────────────────────────
// account = { email, password, twoFA | totp_secret, recovery_email }
// deps = { browser, sessionStore, broadcast }
async function loginGoogle(account, { browser, sessionStore, broadcast }) {
  const log = msg => broadcast && broadcast({ type: 'log', message: `${account.email} - ${msg}` })
  const email = account.email
  const password = account.password
  const rawSecret = account.twoFA || account.totp_secret || null
  const totpSecret = rawSecret ? String(rawSecret).replace(/[\s-]/g, '').toUpperCase() : null
  const recoveryEmail = account.recovery_email || null

  if (!email || !password) return { success: false, reason: 'MISSING_CREDENTIALS' }

  let context = null
  try {
    // 프록시 비활성화 — 무료 프록시 불안정, 직접 연결 사용
    context = await browser.createBrowserContext()
    let page = await context.newPage()
    await configurePage(page)

    // 1. 저장된 쿠키가 있으면 재사용 시도
    if (sessionStore && sessionStore.hasSession(email)) {
      const load = await sessionStore.loadSession(browser, email)
      if (load.loaded) {
        log(`쿠키 ${load.count}개 로드`)
        await page.goto('https://myaccount.google.com/', { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
        await wait(1500)
        const cls = classify(page.url())
        if (cls.kind === 'SUCCESS') {
          log('쿠키 재사용 성공')
          await sessionStore.saveSession(page, email)
          broadcast && broadcast({ type: 'success', email, viaSession: true })
          return { success: true, viaSession: true }
        }
        log('쿠키 만료됨, 재로그인')
      }
    }

    // 2. 이메일 페이지로 이동
    log('signin 페이지 이동')
    await page.goto('https://accounts.google.com/signin/v2/identifier?service=accountsettings&hl=ko', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })
    await wait(1000)

    // 3. 이메일 입력
    await fillEmail(page, email, log)

    // 4. 비번 화면 or CAPTCHA (레이스)
    // 반환값: 'text'=텍스트이미지CAPTCHA, 'recaptcha'=reCAPTCHA, false=비번화면, null=미확인
    let captchaHit = await awaitPasswordOrCaptcha(page, log)
    // Google이 여러 CAPTCHA를 순차로 띄울 수 있음 (텍스트 → reCAPTCHA → 다시 텍스트 등)
    // 최대 5회까지 반복해서 해결
    for (let capRound = 1; capRound <= 5; capRound++) {
      if (captchaHit === false || captchaHit === null) break  // 통과 or 판정불가
      log(`CAPTCHA 라운드 ${capRound}: type=${captchaHit}`)

      let solved = false
      if (captchaHit === 'text') {
        try {
          await solveTextCaptcha({
            page,
            apiKey: process.env.GEMINI_API_KEY,
            log: msg => log(`[gemini-text] ${msg}`),
          })
          solved = true
        } catch (e) { log(`text CAPTCHA 실패: ${e.message}`) }
      } else if (captchaHit === 'recaptcha' || captchaHit === true) {
        solved = await trySolveCaptcha(page, log)
      }

      if (!solved) {
        broadcast && broadcast({ type: 'failed', email, reason: capRound === 1 ? 'CAPTCHA' : 'CAPTCHA_UNSOLVED' })
        return { success: false, reason: `CAPTCHA_ROUND_${capRound}_FAILED` }
      }

      // 다시 상태 확인
      await wait(2000)
      captchaHit = await awaitPasswordOrCaptcha(page, log)
    }
    if (captchaHit === null) {
      // 둘 다 못 찾음 → 실패 순간 스크린샷·URL·body 스니펫 캡처
      try {
        const fs = require('fs'); const path = require('path')
        const dir = '/tmp/gauth-debug'; if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true})
        const stamp = Date.now()
        await page.screenshot({ path: path.join(dir, `fail-${stamp}.png`), fullPage: true })
        const html = await page.content()
        const text = await page.evaluate(() => document.body.innerText.slice(0, 2000)).catch(() => '')
        fs.writeFileSync(path.join(dir, `fail-${stamp}.txt`), `URL: ${page.url()}\nEMAIL: ${email}\n---BODY TEXT---\n${text}\n---HTML(head 3000)---\n${html.slice(0,3000)}`)
        log(`[debug] 실패 캡처: /tmp/gauth-debug/fail-${stamp}.png + .txt`)
      } catch (e) { log(`[debug] 캡처 실패: ${e.message}`) }
      const cls = classify(page.url())
      const bodyKW = await bodyIncludesAny(page, S.BODY_KEYWORDS.ACCOUNT_NOT_FOUND)
      if (bodyKW) { broadcast && broadcast({ type: 'failed', email, reason: 'ACCOUNT_NOT_FOUND' }); return { success: false, reason: 'ACCOUNT_NOT_FOUND' } }
      if (cls.kind === 'BROWSER_UNSAFE' || cls.kind === 'REJECTED') {
        const r = cls.kind === 'BROWSER_UNSAFE' ? 'BROWSER_UNSAFE' : 'REJECTED';
        const msg = cls.friendly || '';
        broadcast && broadcast({ type: 'failed', email, reason: r, message: msg });
        return { success: false, reason: r, message: msg, url: page.url() }
      }
      log(`비번 화면 도달 못함 [${cls.kind}] ${page.url()}`)
      broadcast && broadcast({ type: 'failed', email, reason: cls.kind })
      return { success: false, reason: cls.kind }
    }

    // 5. 비번 입력 (password_alts 포함 시도)
    const allPasswords = [password, ...(account.password_alts || [])]
    let pwSuccess = false
    for (let pi = 0; pi < allPasswords.length; pi++) {
      const pw = allPasswords[pi]
      if (pi > 0) log(`대체 비밀번호 ${pi} 시도`)
      await fillPassword(page, pw, log)
      await wait(1500)
      const pwErrKW = await bodyIncludesAny(page, S.BODY_KEYWORDS.WRONG_PASSWORD)
      if (!pwErrKW) { pwSuccess = true; break }
      log(`비번 오류 (${pi + 1}/${allPasswords.length}): ${pwErrKW}`)
      if (pi < allPasswords.length - 1) {
        // 비번 필드 초기화 후 재시도
        const pwInput = await page.$(S.PASSWORD_INPUT)
        if (pwInput) {
          await pwInput.click({ clickCount: 3 })
          await wait(200)
        }
      }
    }
    if (!pwSuccess) {
      broadcast && broadcast({ type: 'failed', email, reason: 'WRONG_PASSWORD' })
      return { success: false, reason: 'WRONG_PASSWORD' }
    }

    // 7. 사후 URL 분류
    let cls = classify(page.url())
    log(`비번 제출 후 [${cls.kind}] ${page.url().slice(0, 80)}`)

    // 8. TOTP 필요?
    if (cls.kind === 'TOTP' || cls.kind === 'CHALLENGE_SELECTION') {
      if (!totpSecret) {
        broadcast && broadcast({ type: 'failed', email, reason: '2FA_NO_SECRET' })
        return { success: false, reason: '2FA_NO_SECRET' }
      }
      const r = await submit2FA(page, totpSecret, log)
      if (!r.ok) {
        broadcast && broadcast({ type: 'failed', email, reason: r.reason })
        return { success: false, reason: r.reason }
      }
      cls = classify(page.url())
    }

    // 8.5. 복구 이메일 challenge (/challenge/ipe)
    // ref: https://support.google.com/a/answer/6002699 (Identity Proof Email)
    // ref: https://github.com/crawlspec/google-login (recovery input handling)
    if (cls.kind === 'RECOVERY_EMAIL_CHALLENGE') {
      if (recoveryEmail) {
        log(`복구 이메일 challenge — ${recoveryEmail.slice(0, 4)}***`)
        // Google ipe 페이지: input[type="email"], input[name="knowledgePreregisteredEmailResponse"]
        const recInput = await page.$([
          'input[name="knowledgePreregisteredEmailResponse"]',
          'input[type="email"]',
          'input[autocomplete="email"]',
          'input[aria-label*="recovery" i]',
          'input[aria-label*="복구" i]',
          'input[aria-label*="email" i]',
        ].join(', ')).catch(() => null)
        if (recInput) {
          await recInput.click({ clickCount: 3 }).catch(() => {})
          await recInput.type(recoveryEmail, { delay: 50 })
          await wait(500)
          const nextBtn = await page.$([
            '#next', 'button[jsname="LgbsSe"]', 'button[type="submit"]',
            '#idvPreregisteredEmailNext', '[data-primary-action-label]',
          ].join(', ')).catch(() => null)
          if (nextBtn) await nextBtn.click()
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
          cls = classify(page.url())
          log(`복구 이메일 제출 후 [${cls.kind}]`)
        } else {
          log('복구 이메일 입력 필드 못 찾음')
        }
      } else {
        log('복구 이메일 challenge인데 recovery_email 없음 → challenge selection 전환 시도')
        const selUrl = page.url().replace(/\/challenge\/[a-z]+/, '/challenge/selection')
        await page.goto(selUrl, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
        cls = classify(page.url())
      }
    }

    // 9. 전화/기기/보안키 요구 — TOTP 또는 복구이메일로 전환 시도
    if (['PHONE_REQUIRED', 'DEVICE_PROMPT', 'SECURITY_KEY', 'PASSKEY_REQUIRED', 'BACKUP_CODE'].includes(cls.kind)) {
      // challenge selection으로 이동
      log(`${cls.kind} → challenge selection 전환 시도`)
      const tryAnother = await page.$([
        'a[href*="challenge/selection"]',
        'button[jsname="LgbsSe"]',
        'a[data-challengeid]',
      ].join(', ')).catch(() => null)
      if (tryAnother) {
        await tryAnother.click()
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {})
      } else {
        const selUrl = page.url().replace(/\/challenge\/[a-z]+/, '/challenge/selection')
        await page.goto(selUrl, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      }
      const newCls = classify(page.url())

      if (newCls.kind === 'CHALLENGE_SELECTION') {
        // TOTP 옵션 우선
        if (totpSecret) {
          const totpOpt = await page.$(S.CHALLENGE_TYPE.TOTP).catch(() => null)
                        || await page.$(S.CHALLENGE_TYPE.TOTP_ALT).catch(() => null)
          if (totpOpt) {
            await totpOpt.click()
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {})
            const r2 = await submit2FA(page, totpSecret, log)
            if (r2.ok) { cls = classify(page.url()) }
            else { broadcast && broadcast({ type: 'failed', email, reason: r2.reason }); return { success: false, reason: r2.reason } }
          }
        }
        // 복구 이메일 옵션 (TOTP 없거나 실패 시)
        // ref: selectors.js CHALLENGE_TYPE.BACKUP_EMAIL = '[data-challengetype="7"]'
        if (cls.kind !== 'SUCCESS' && recoveryEmail) {
          const recOpt = await page.$(S.CHALLENGE_TYPE.BACKUP_EMAIL).catch(() => null)
          if (recOpt) {
            log('challenge selection에서 복구 이메일 옵션 선택')
            await recOpt.click()
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {})
            cls = classify(page.url())
            if (cls.kind === 'RECOVERY_EMAIL_CHALLENGE') {
              const recInput = await page.$([
                'input[name="knowledgePreregisteredEmailResponse"]',
                'input[type="email"]', 'input[autocomplete="email"]',
              ].join(', ')).catch(() => null)
              if (recInput) {
                await recInput.click({ clickCount: 3 }).catch(() => {})
                await recInput.type(recoveryEmail, { delay: 50 })
                await wait(500)
                const nextBtn = await page.$('#next, button[jsname="LgbsSe"], button[type="submit"]').catch(() => null)
                if (nextBtn) await nextBtn.click()
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                cls = classify(page.url())
                log(`복구 이메일 제출 후 [${cls.kind}]`)
              }
            }
          }
        }
        if (cls.kind !== 'SUCCESS' && !['INTERSTITIAL', 'SIGNIN_IN_PROGRESS', 'OAUTH_CONSENT'].includes(cls.kind)) {
          broadcast && broadcast({ type: 'failed', email, reason: cls.kind })
          return { success: false, reason: cls.kind }
        }
      } else if (newCls.kind === 'TOTP' && totpSecret) {
        const r2 = await submit2FA(page, totpSecret, log)
        if (r2.ok) { cls = classify(page.url()) }
        else { broadcast && broadcast({ type: 'failed', email, reason: r2.reason }); return { success: false, reason: r2.reason } }
      } else {
        log(`challenge selection 전환 실패: ${newCls.kind}`)
        broadcast && broadcast({ type: 'failed', email, reason: cls.kind })
        return { success: false, reason: cls.kind }
      }
    }

    // 10. 인터스티셜/중간 확인 페이지 → "확인/계속/Not now" 버튼 자동 클릭 (최대 6회)
    //   Google 로그인 마무리에 뜨는 페이지들:
    //     - speedbump/gaplustos (약관) → "동의/I agree"
    //     - speedbump/consent (정보공유) → "Continue/계속"
    //     - Add recovery phone → "Skip/나중에"
    //     - Passkey enrollment → "Not now/나중에"
    //     - Anywhere Sign-in → "Yes, it's me"
    //     - Save password → "Never/사용 안 함"
    for (let step = 1; step <= 12; step++) {
      if (cls.kind === 'SUCCESS') break
      if (['INTERSTITIAL', 'SIGNIN_IN_PROGRESS', 'OAUTH_CONSENT'].includes(cls.kind)) {
        log(`중간 페이지 ${step}/6 [${cls.kind}] — 자동 확인 버튼 클릭`)
        const clicked = await autoConfirm(page, log)
        if (!clicked) { log('확인 버튼 못 찾음, 3초 대기 후 URL 재분류'); await wait(3000) }
        else { await wait(2500) }
        cls = classify(page.url())
      } else {
        break
      }
    }

    // 11. 최종 확인
    if (cls.kind === 'SUCCESS') {
      const saved = await sessionStore.saveSession(page, email)
      log(`✅ 성공! 쿠키 ${saved}개 저장`)
      await page.close({ runBeforeUnload: false }).catch(() => {})
      broadcast && broadcast({ type: 'success', email })
      // context를 반환 — OAuth consent에서 재사용 (caller가 close 책임)
      const returnCtx = context
      context = null  // finally에서 close 방지
      return { success: true, context: returnCtx }
    }

    // 12. 다국어 감지 fallback
    const disabledKW = await bodyIncludesAny(page, S.BODY_KEYWORDS.ACCOUNT_DISABLED)
    if (disabledKW) { broadcast && broadcast({ type: 'failed', email, reason: 'ACCOUNT_DISABLED' }); return { success: false, reason: 'ACCOUNT_DISABLED' } }
    const identKW = await bodyIncludesAny(page, S.BODY_KEYWORDS.IDENTITY_UNVERIFIED)
    if (identKW) { broadcast && broadcast({ type: 'failed', email, reason: 'IDENTITY_UNVERIFIED' }); return { success: false, reason: 'IDENTITY_UNVERIFIED' } }

    log(`❌ 결과 미분류 [${cls.kind}] ${page.url()}`)
    broadcast && broadcast({ type: 'failed', email, reason: `UNKNOWN_${cls.kind}` })
    return { success: false, reason: `UNKNOWN_${cls.kind}`, url: page.url() }

  } catch (err) {
    log(`❌ 예외: ${err.message}`)
    broadcast && broadcast({ type: 'failed', email, reason: err.message })
    return { success: false, reason: err.message }
  } finally {
    if (context) {
      await context.close().catch(() => {})
      // Chrome이 페이지/렌더러 완전 해제할 시간 (메모리 회복)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}

module.exports = { loginGoogle }
