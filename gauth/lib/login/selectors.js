/**
 * lib/login/selectors.js — Google 로그인 셀렉터 사전 (fallback 40+개)
 *
 * 원본 출처:
 *   - the-type-founders/continue-with-google (2026-06-11 최신)
 *     https://github.com/the-type-founders/continue-with-google/blob/main/src/index.ts
 *     :: input#identifierId, input[type=email], input[type=password], input#ca, input[type=tel]
 *   - hasanbasri1993/puppeteer_admin_google (TOTP 11개 fallback)
 *     https://github.com/hasanbasri1993/puppeteer_admin_google/blob/main/services/authService.js
 *   - spenpw/2fa_automation (#idvPin XPath)
 *     https://github.com/spenpw/2fa_automation/blob/main/disable_scripts/google.js
 *   - Brandawg93 gist (#identifierId[aria-invalid=true])
 *     https://gist.github.com/Brandawg93/728a93e84ed7b66d8dd0af966cb20ecb
 */

'use strict'

// ── 이메일 입력 ────────────────────────────────────────────────────────────
const EMAIL_INPUT = [
  '#identifierId',
  'input[type="email"]',
  'input[name="identifier"]',
  'input[autocomplete="username"]',
  'input[jsname="YPqjbf"]',
].join(', ')

const EMAIL_NEXT = [
  '#identifierNext',
  'button[jsname="LgbsSe"]',
  'div[role="button"][data-primary-action-label]',
].join(', ')

// 이메일 오류 감지 (원본: Brandawg93 gist)
const EMAIL_INVALID = '#identifierId[aria-invalid="true"]'

// ── 비밀번호 입력 ──────────────────────────────────────────────────────────
const PASSWORD_INPUT = [
  'input[type="password"]',
  'input[name="Passwd"]',
  'input[autocomplete="current-password"]',
].join(', ')

const PASSWORD_NEXT = [
  '#passwordNext',
  'button[jsname="LgbsSe"]',
].join(', ')

// ── TOTP 입력 (fallback 13개, 원본: puppeteer_admin_google) ────────────────
const TOTP_INPUT = [
  '#totpPin',
  '#idvPin',                                // spenpw/2fa_automation
  'input[name="totpPin"]',
  'input[name="Pin"]',
  'input[autocomplete="one-time-code"]',
  'input[type="tel"]',
  'input[aria-label*="code" i]',
  'input[aria-label*="verification" i]',
  'input[aria-label*="확인 코드"]',
  'input[placeholder*="code" i]',
  'input[placeholder*="verification" i]',
  'input[maxlength="6"]',
  'input[maxlength="8"]',
].join(', ')

const TOTP_NEXT = [
  '#totpNext',
  '#idvPreregisteredPhoneNext',
  'button[type="submit"]',
  'button[jsname="LgbsSe"]',
  '[data-primary-action-label]',
].join(', ')

// ── CAPTCHA 감지 (원본: continue-with-google + oxylabs/bypass-captcha-puppeteer) ─
const CAPTCHA_IFRAME = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="recaptcha" i]'
const CAPTCHA_INPUT = 'input#ca, input[name="ca"]'   // 텍스트형 CAPTCHA
const CAPTCHA_ANY = `${CAPTCHA_IFRAME}, ${CAPTCHA_INPUT}, div.g-recaptcha`

// ── 에러 알림 감지 ─────────────────────────────────────────────────────────
const ERROR_ALERT = [
  '[role="alert"]',
  '[jsname="B34EJ"]',       // 비번 오류 텍스트
  '[jsname="h9d3hd"]',      // 인라인 오류
  '.dEOOab',                 // 오류 배너
  '.OyEIQ',                  // 오류 배너 변형
].join(', ')

// ── 인증 방법 선택 옵션 (data-challengetype) ───────────────────────────────
// 원본: AfterDawn1130/Gmail_tools 관찰 (data-challengetype="6" = TOTP)
const CHALLENGE_TYPE = {
  BACKUP_CODE: '[data-challengetype="0"]',
  SECURITY_KEY: '[data-challengetype="4"]',
  TOTP: '[data-challengetype="6"]',           // 최우선 (Authenticator app)
  BACKUP_EMAIL: '[data-challengetype="7"]',
  BACKUP_PHONE: '[data-challengetype="9"]',
  TOTP_ALT: '[data-challengetype="12"]',      // 변형
}

const CHALLENGE_SELECTION_ANY = 'li[data-challengeid], [data-challengetype]'

// ── 다국어 본문 키워드 (원본: AfterDawn1130/Gmail_tools) ──────────────────
const BODY_KEYWORDS = {
  ACCOUNT_NOT_FOUND: [
    "couldn't find", 'could not find', 'not found',
    '找不到', '찾을 수 없', 'không tìm thấy',
  ],
  ACCOUNT_DISABLED: [
    'disabled', 'suspended', 'stopped working', 'deactivated',
    '停用', '锁定', 'locked',
    '일시 중지', '비활성',
    'bị vô hiệu',
  ],
  WRONG_PASSWORD: [
    'wrong password', 'incorrect password', "couldn't sign you in",
    'password was changed', 'password is incorrect',
    '密码错误', '密码不正确', '密码已更改',
    '잘못된 비밀번호', '비밀번호가 일치하지 않',
    'đổi mật khẩu',
  ],
  CAPTCHA: [
    'not a robot', 'unusual traffic', "verify you're human", 'captcha',
    '人机验证', '机器人', '异常流量', '自动化',
    '자동화된', '로봇', '비정상적인 트래픽',
  ],
  PHONE_VERIFY: [
    'verify your phone', 'phone number', 'confirm your recovery',
    'recovery phone', 'gmail app', 'open the gmail', 'google prompt',
    'tap the number', "yes, it's me", 'use your phone or tablet',
    'choose a way to verify',
    '验证您的手机', '电话号码', '打开gmail', '使用您的手机', '选择验证方式',
    '전화번호 확인', '기기에서 확인',
    'xác minh điện thoại', 'số điện thoại',
  ],
  IDENTITY_UNVERIFIED: [
    "couldn't verify", 'could not verify', "we can't verify",
    '无法验证', '无法确认',
    '본인 확인 불가',
    'không thể xác minh',
  ],
}

module.exports = {
  EMAIL_INPUT, EMAIL_NEXT, EMAIL_INVALID,
  PASSWORD_INPUT, PASSWORD_NEXT,
  TOTP_INPUT, TOTP_NEXT,
  CAPTCHA_IFRAME, CAPTCHA_INPUT, CAPTCHA_ANY,
  ERROR_ALERT,
  CHALLENGE_TYPE, CHALLENGE_SELECTION_ANY,
  BODY_KEYWORDS,
}
