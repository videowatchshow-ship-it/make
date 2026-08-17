/**
 * lib/login/urls.js — Google 로그인 URL 패턴 매처
 *
 * 원본 참고:
 *   - AfterDawn1130/Gmail_tools :: challenge/{ipp,dp,sk,skotp,totp,ootp,selection,pk,iap}
 *     https://github.com/AfterDawn1130/Gmail_tools/blob/main/oauth-login/src/google-login.js
 *   - hasanbasri1993/puppeteer_admin_google :: accounts.google.com/challenge 감지
 *     https://github.com/hasanbasri1993/puppeteer_admin_google/blob/main/services/authService.js
 *   - Google Workspace 공식: challenge 종류 (recovery email, recovery phone, device prompt, security key)
 *     https://support.google.com/a/answer/6002699
 *   - crawlspec/google-login :: recovery phone input[type="tel"] 처리
 *     https://github.com/crawlspec/google-login/blob/main/puppeteer.js
 *   - Community threads / URL 관찰:
 *     https://support.google.com/accounts/thread/67911099
 *     https://github.com/vladikoff/chromeos-apk/issues/270
 */

'use strict'

const SUCCESS_HOSTS = [
  'myaccount.google.com',
  'mail.google.com',
  'youtube.com',
  'one.google.com',
  'photos.google.com',
  'drive.google.com',
  'calendar.google.com',
  'meet.google.com',
]

function classify(url) {
  const u = String(url || '')
  const lower = u.toLowerCase()

  for (const host of SUCCESS_HOSTS) {
    if (lower.includes(host)) return { kind: 'SUCCESS', host }
  }

  if (/\/rejected/.test(lower)) {
    /* https://support.google.com/accounts/answer/7675428 */
    return { kind: 'BROWSER_UNSAFE', friendly: '브라우저/앱 안전하지 않음 (Google이 자동화 또는 데이터센터 IP 감지). 해결: residential proxy 사용.' }
  }
  if (/\/disabled/.test(lower)) return { kind: 'ACCOUNT_DISABLED' }
  if (/\/webreauth/.test(lower)) return { kind: 'REAUTH_REQUIRED' }

  if (/\/(signin\/v2\/identifier|v3\/signin\/identifier|accountchooser)/.test(lower)) {
    return { kind: 'EMAIL' }
  }

  if (/\/(signin\/v2\/sl\/pwd|signin\/challenge\/pwd|v3\/signin\/challenge\/pwd|challenge\/password)/.test(lower)) {
    return { kind: 'PASSWORD' }
  }

  if (/\/(signin\/v2\/challenge\/totp|signin\/challenge\/totp|challenge\/ootp)/.test(lower)) {
    return { kind: 'TOTP' }
  }

  if (/\/challenge\/selection/.test(lower)) return { kind: 'CHALLENGE_SELECTION' }

  if (/\/challenge\/(kpe|bc)/.test(lower)) return { kind: 'BACKUP_CODE' }

  // ref: https://support.google.com/a/answer/6002699
  // ipe = Identity Proof Email (복구 이메일 입력)
  if (/\/challenge\/ipe/.test(lower)) return { kind: 'RECOVERY_EMAIL_CHALLENGE' }

  // ipp = Identity Proof Phone (복구 전화번호 입력)
  if (/\/challenge\/ipp/.test(lower)) return { kind: 'PHONE_REQUIRED' }

  if (/\/challenge\/(dp|az|iap)/.test(lower)) return { kind: 'DEVICE_PROMPT' }

  if (/\/challenge\/(sk|skotp)/.test(lower)) return { kind: 'SECURITY_KEY' }

  if (/\/challenge\/pk/.test(lower)) return { kind: 'PASSKEY_REQUIRED' }

  if (/\/challenge\/recaptcha/.test(lower)) return { kind: 'CAPTCHA' }

  if (/\/challenge\/oaw|\/oauth\/|\/consent/.test(lower)) return { kind: 'OAUTH_CONSENT' }

  if (/\/interstitialpage|\/speedbump/.test(lower)) return { kind: 'INTERSTITIAL' }

  const m = lower.match(/\/challenge\/(\w+)/)
  if (m) return { kind: 'CHALLENGE_UNKNOWN', code: m[1] }

  if (lower.includes('accounts.google.com')) return { kind: 'SIGNIN_IN_PROGRESS' }

  return { kind: 'UNKNOWN' }
}

const isSuccess = url => classify(url).kind === 'SUCCESS'
const isPasswordPage = url => classify(url).kind === 'PASSWORD'
const isTotpPage = url => classify(url).kind === 'TOTP'
const isBlocked = url => ['REJECTED', 'ACCOUNT_DISABLED'].includes(classify(url).kind)

module.exports = { classify, isSuccess, isPasswordPage, isTotpPage, isBlocked, SUCCESS_HOSTS }

if (require.main === module) {
  const tests = [
    'https://accounts.google.com/signin/v2/identifier?service=mail',
    'https://accounts.google.com/v3/signin/challenge/pwd?abc',
    'https://accounts.google.com/signin/challenge/totp',
    'https://accounts.google.com/signin/challenge/ipe/collect',
    'https://accounts.google.com/signin/challenge/ipp/collect',
    'https://accounts.google.com/signin/challenge/dp',
    'https://accounts.google.com/signin/challenge/selection',
    'https://accounts.google.com/signin/rejected',
    'https://myaccount.google.com/',
    'https://mail.google.com/mail/u/0/#inbox',
  ]
  for (const t of tests) console.log(JSON.stringify(classify(t)), '::', t)
}
