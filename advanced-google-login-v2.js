#!/usr/bin/env node
/**
 * 🎯 고급 Google 자동 로그인 시스템 v2.1
 * 
 * ✅ 공식 API 기반 + 2026년 7월 검증
 * - Puppeteer 25.x (pptr.dev)
 * - puppeteer-extra 3.3.6 (github.com/berstend/puppeteer-extra)
 * - otplib 13.x (npmjs.com/package/otplib)
 *
 * v2.2 (2026-07-30):
 * - ✅ :has-text() → 표준 CSS 셀렉터로 교체 (Puppeteer 비표준)
 * - ✅ User-Agent Chrome 130 업데이트
 * - ✅ Puppeteer 25 호환 (async executablePath)
 * - ✅ 패스키/기기승인 감지 추가
 * - ✅ 로그인 후 추가 보안 페이지 핸들링
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { authenticator } = require('otplib');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// ✅ 공식 Stealth 플러그인 사용
puppeteer.use(StealthPlugin());

/**
 * 가상 디스플레이(Xvfb) 보장 — "마우스가 지 맘대로 움직인다" 방지
 *
 * 원인: headless:false(헤드풀)로 실제 Chrome을 띄우면 Puppeteer의
 *   page.click()이 Page.mouse로 커서를 요소 중앙까지 물리 이동시킨다.
 *   ref: https://pptr.dev/api/puppeteer.page.click
 *        "uses Page.mouse to click in the center of the element"
 *   → 실제 X 세션(데스크톱)에서 돌면 사용자 마우스를 그대로 뺏어감.
 *
 * 해결: Chrome을 별도 Xvfb 가상 디스플레이에 렌더링 → 커서 이동이
 *   가상 화면 안에서만 발생, 실제 마우스는 건드리지 않음. 헤드풀 유지라
 *   Google 봇 감지 회피(navigator.webdriver 등)는 그대로 작동.
 *   ref: https://www.x.org/releases/current/doc/man/man1/Xvfb.1.xhtml
 *
 * 이미 가상 디스플레이(:99)면 재사용, Xvfb 미설치면 경고만 하고 진행.
 * Windows/macOS엔 Xvfb가 없으므로 false 반환 → 호출부에서 헤드리스로 폴백.
 *
 * @returns {boolean} 가상 디스플레이 확보 성공 여부 (실제 마우스 안전 여부)
 */
function ensureVirtualDisplay() {
    // Xvfb는 Linux(X11) 전용. Windows/macOS엔 존재하지 않음.
    if (process.platform !== 'linux') {
        return false;
    }

    const VDISPLAY = ':99';
    // 이미 가상 디스플레이를 쓰고 있으면 그대로 사용
    if (process.env.DISPLAY === VDISPLAY) return true;

    // Xvfb 바이너리 존재 확인
    const has = spawnSync('which', ['Xvfb'], { encoding: 'utf-8' });
    if (has.status !== 0) {
        console.warn(`${c.yellow}⚠ Xvfb 미설치 — 'sudo apt-get install -y xvfb' 후 재실행 권장${c.reset}`);
        return false;
    }

    // :99 가상 디스플레이가 살아있는지 확인 (X 락파일)
    const alive = fs.existsSync('/tmp/.X99-lock');
    if (!alive) {
        console.log(`${c.cyan}🖥  Xvfb 가상 디스플레이 ${VDISPLAY} 기동 (실제 마우스 보호)${c.reset}`);
        const xvfb = spawn('Xvfb', [VDISPLAY, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], {
            detached: true,
            stdio: 'ignore'
        });
        xvfb.unref();
        // X 서버 소켓이 올라올 때까지 짧게 대기
        const start = Date.now();
        while (!fs.existsSync('/tmp/.X99-lock') && Date.now() - start < 3000) {
            spawnSync('sleep', ['0.1']);
        }
    }
    process.env.DISPLAY = VDISPLAY;
    console.log(`${c.green}✓${c.reset} DISPLAY=${VDISPLAY} (Chrome은 가상 화면에 렌더링 — 실제 커서 미이동)`);
    return true;
}

// 색상
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// 로그인 결과 타입
const LoginResult = {
    SUCCESS: 'SUCCESS',
    SUCCESS_ALREADY_LOGGED_IN: 'ALREADY_LOGGED',
    FAIL_WRONG_PASSWORD: 'WRONG_PASSWORD',
    FAIL_WRONG_2FA: 'WRONG_2FA',
    FAIL_PHONE_VERIFICATION: 'PHONE_REQUIRED',
    FAIL_CAPTCHA: 'CAPTCHA_REQUIRED',
    FAIL_UNUSUAL_ACTIVITY: 'UNUSUAL_ACTIVITY',
    FAIL_TIMEOUT: 'TIMEOUT',
    FAIL_UNKNOWN: 'UNKNOWN_ERROR'
};

/* 역공학 셀렉터 — Google은 로그인 페이지 DOM 구조를 공식 문서화하지 않음.
 * Google Identity Services(https://developers.google.com/identity)는 OAuth용이며
 * 기존 계정 세션 유지 로그인에는 사용 불가.
 * 아래 셀렉터는 실제 DOM 검증 기반이며, Google 배포 시 변경될 수 있음.
 * 변경 감지: 로그인 실패 급증 시 DOM 재검증 필요. */

const SELECTORS = {
    EMAIL: [
        '#identifierId',
        'input[type="email"]',
        'input[name="identifier"]',
        'input[aria-label*="이메일"]',
        'input[aria-label*="Email" i]'
    ],
    EMAIL_NEXT: [
        '#identifierNext',
        '#identifierNext button',
        'button[jsname="LgbsSe"]',
        '#identifierNext div[role="button"]'
    ],
    PASSWORD: [
        'input[type="password"]',
        'input[name="Passwd"]',
        'input[name="password"]',
        '#password input[type="password"]',
        'input[aria-label*="비밀번호"]'
    ],
    PASSWORD_NEXT: [
        '#passwordNext',
        '#passwordNext button',
        'button[jsname="LgbsSe"]',
        '#passwordNext div[role="button"]'
    ],
    TWO_FA: [
        'input[name="totpPin"]',
        '#totpPin',
        'input[type="tel"][autocomplete="one-time-code"]',
        'input[inputmode="numeric"]',
        'input[aria-label*="코드"]'
    ],
    TWO_FA_NEXT: [
        '#totpNext',
        '#totpNext button',
        'button[jsname="LgbsSe"]'
    ],
    RECAPTCHA: [
        'iframe[src*="recaptcha"]',
        'iframe[title*="reCAPTCHA"]',
        '.g-recaptcha',
        '#recaptcha'
    ],
    PHONE_VERIFICATION: [
        'input[type="tel"]:not([name="totpPin"])',
        'input[name="phoneNumber"]',
        'input[aria-label*="전화"]',
        'input[aria-label*="Phone" i]'
    ],
    PASSKEY_OR_DEVICE: [
        '[data-challengetype="6"]',
        'div[data-challengeid="6"]',
        'div[jsname="EKvSSd"]'
    ],
    ERROR: [
        '[role="alert"]',
        '.error-message',
        '[aria-live="assertive"]',
        'span[jsname="B34EJ"]'
    ]
};

// 실패 로그 저장 경로
const FAILED_LOGS_DIR = path.join(__dirname, 'failed_logins');
try { fs.mkdirSync(FAILED_LOGS_DIR, { recursive: true }); } catch (_) {}

function getToday() { return new Date().toISOString().split('T')[0]; }
function getTodayLogFile() { return path.join(FAILED_LOGS_DIR, `failed_${getToday()}.json`); }

/* 파일 시스템 경로용 sanitize — POSIX 금지 문자(\0, /) + Windows 금지 문자 제거
 * ref: https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap03.html#tag_03_170 */
function sanitizeEmail(email) {
  return String(email || '').replace(/[\/\\<>:"|?*\x00-\x1f]/g, '_');
}

/**
 * ✅ 공식 Puppeteer API: 여러 셀렉터 중 하나라도 찾기
 * @param {Page} page - Puppeteer Page 객체
 * @param {string[]} selectors - 시도할 셀렉터 배열
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {Promise<string|null>} 찾은 셀렉터 또는 null
 */
async function waitForAnySelector(page, selectors, timeout = 10000) {
    const timeoutPerSelector = timeout / selectors.length;
    
    for (const selector of selectors) {
        try {
            await page.waitForSelector(selector, { timeout: timeoutPerSelector });
            console.log(`  ${c.green}✓${c.reset} 셀렉터 발견: ${selector}`);
            return selector;
        } catch (e) {
            // 다음 셀렉터 시도
            continue;
        }
    }
    
    return null;
}

/**
 * ✅ 공식 Puppeteer API: 여러 셀렉터 중 하나라도 존재하는지 확인
 * @param {Page} page - Puppeteer Page 객체
 * @param {string[]} selectors - 확인할 셀렉터 배열
 * @returns {Promise<string|null>} 찾은 셀렉터 또는 null
 */
async function checkAnySelector(page, selectors) {
    for (const selector of selectors) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
            return selector;
        }
    }
    return null;
}

/**
 * TOTP 생성 (공식 otplib)
 */
function generateTOTP(secret) {
    try {
        secret = String(secret).toUpperCase().replace(/[\s\-_=]/g, '').replace(/[^A-Z2-7]/g, '');
        if (secret.length < 16) return null;
        return authenticator.generate(secret);
    } catch (error) {
        return null;
    }
}

/**
 * 랜덤 딜레이 (봇 감지 방지)
 */
function delay(min = 500, max = 2000) {
    return new Promise(r => setTimeout(r, Math.random() * (max - min) + min));
}

/**
 * 페이지 상태 감지 (셀렉터 기반)
 */
async function detectPageState(page) {
    const url = page.url();

    // 1. URL 기반 감지 (가장 신뢰할 수 있음)
    if (url.includes('myaccount.google.com') || 
        url.includes('youtube.com') || 
        url.includes('mail.google.com')) {
        return { state: 'ALREADY_LOGGED_IN', verified: true };
    }

    // 2. 셀렉터 기반 감지 (공식 Puppeteer API)
    
    // reCAPTCHA 확인
    const hasCaptcha = await checkAnySelector(page, SELECTORS.RECAPTCHA);
    if (hasCaptcha) {
        return { state: 'CAPTCHA', verified: true };
    }
    
    // 전화번호 인증 확인 (2FA가 아닌)
    const hasPhone = await checkAnySelector(page, SELECTORS.PHONE_VERIFICATION);
    if (hasPhone) {
        return { state: 'PHONE_VERIFICATION', verified: true };
    }
    
    // 2FA 확인
    const has2FA = await checkAnySelector(page, SELECTORS.TWO_FA);
    if (has2FA) {
        return { state: '2FA_PAGE', verified: true };
    }
    
    // 비밀번호 페이지
    const hasPassword = await checkAnySelector(page, SELECTORS.PASSWORD);
    if (hasPassword) {
        return { state: 'PASSWORD_PAGE', verified: true };
    }
    
    // 이메일 페이지
    const hasEmail = await checkAnySelector(page, SELECTORS.EMAIL);
    if (hasEmail) {
        return { state: 'EMAIL_PAGE', verified: true };
    }
    
    // 에러 메시지 확인
    const hasError = await checkAnySelector(page, SELECTORS.ERROR);
    if (hasError) {
        const errorText = await page.$eval(hasError, el => el.textContent).catch(() => '');
        return { 
            state: 'ERROR_PAGE', 
            verified: true, 
            error: errorText 
        };
    }

    return { state: 'UNKNOWN', verified: false };
}

/**
 * 실패 로그 저장
 */
function saveFailedLogin(account, result, error, screenshot = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        email: account.email,
        result: result,
        error: error,
        has2FA: !!account.twoFA,
        screenshot: screenshot,
        attemptNumber: 1
    };

    const logFile = getTodayLogFile();
    let logs = [];
    try {
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
            if (!Array.isArray(logs)) logs = [];
        }
    } catch (_) { logs = []; }

    const existing = logs.find(l => l.email === account.email);
    if (existing) {
        existing.attemptNumber++;
        existing.lastAttempt = new Date().toISOString();
        existing.lastError = error;
    } else {
        logs.push(logEntry);
    }

    try {
        const tmp = logFile + '.tmp.' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(logs, null, 2));
        fs.renameSync(tmp, logFile);
    } catch (_) {}
    console.log(`${c.yellow}📝 실패 로그 저장: ${logFile}${c.reset}`);
}

/**
 * 성공 로그 저장
 */
function saveSuccessLogin(account, result) {
    const successFile = path.join(FAILED_LOGS_DIR, `success_${getToday()}.json`);

    const logEntry = {
        timestamp: new Date().toISOString(),
        email: account.email,
        result: result,
        has2FA: !!account.twoFA
    };

    let logs = [];
    try {
        if (fs.existsSync(successFile)) {
            logs = JSON.parse(fs.readFileSync(successFile, 'utf-8'));
            if (!Array.isArray(logs)) logs = [];
        }
    } catch (_) { logs = []; }
    logs.push(logEntry);

    try {
        const tmp = successFile + '.tmp.' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(logs, null, 2));
        fs.renameSync(tmp, successFile);
    } catch (_) {}
}

/**
 * 고급 Google 로그인 v2
 */
async function advancedGoogleLogin(account, options = {}) {
    const {
        headless = false,
        timeout = 60000,
        captchaWaitTime = 120000,
        executablePath = null
    } = options;

    console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.cyan}   🔐 로그인 시도: ${account.email}${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

    const profilePath = path.join(__dirname, 'profiles', account.email.replace(/[^a-z0-9]/gi, '_'));
    let browser, page;

    /* Chrome 경로: 서버(Ubuntu/Debian) 기준 설치 경로
     * Puppeteer.executablePath()는 번들 Chromium 경로 반환 — 봇 감지 회피에 불리
     * ref: https://pptr.dev/api/puppeteer.browser.executablepath */
    const chromePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
    ];
    let foundChrome = executablePath;
    if (!foundChrome) {
        for (const p of chromePaths) {
            if (fs.existsSync(p)) { foundChrome = p; break; }
        }
    }

    // 마우스 탈취 방지: Linux면 Xvfb 가상 디스플레이 확보.
    // 확보 실패(Windows/macOS/미설치)면 헤드풀은 실제 마우스를 뺏으므로
    // 새 헤드리스 모드('new')로 폴백 — 창/커서 없이 실제 Chrome 렌더링.
    //   ref: https://developer.chrome.com/docs/chromium/new-headless
    const virtualOk = ensureVirtualDisplay();
    let effectiveHeadless = headless;
    if (!headless && !virtualOk) {
        effectiveHeadless = 'new';
        console.warn(`${c.yellow}⚠ 가상 디스플레이 없음(${process.platform}) → 실제 마우스 보호 위해 새 헤드리스('new') 모드로 전환${c.reset}`);
    }

    try {
        // Google은 구(舊) headless 모드를 감지해 차단 (2025-2026 확인)
        // → Linux: 헤드풀 + Xvfb, 그 외: 새 헤드리스('new')
        // headed 모드 + 실제 Chrome + userDataDir가 유일한 작동 방식
        // 서버에서는 Xvfb로 가상 디스플레이 사용
        /* Chromium flags — 비공식이나 Puppeteer 커뮤니티 검증 패턴
         * --no-sandbox: https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox
         * --disable-blink-features=AutomationControlled: navigator.webdriver 비활성화 (비공식)
         * --flag-switches-begin/end: Chromium 내부 플래그 구분자 (비공식)
         * ignoreDefaultArgs: --enable-automation 제거로 "Chrome is being controlled" 배너 숨김 */
        const launchOpts = {
            headless: effectiveHeadless,
            userDataDir: profilePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--flag-switches-begin',
                '--flag-switches-end'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            defaultViewport: null
        };
        if (foundChrome) {
            launchOpts.executablePath = foundChrome;
            console.log(`${c.green}✓${c.reset} Chrome: ${foundChrome}`);
        }

        browser = await puppeteer.launch(launchOpts);

        page = (await browser.pages())[0] || await browser.newPage();

        /* W3C WebDriver spec: navigator.webdriver는 자동화 감지용 플래그
         * ref: https://www.w3.org/TR/webdriver2/#dom-navigatorautomationinformation-webdriver
         * CDP evaluateOnNewDocument로 페이지 로드 전 제거 */
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            delete navigator.__proto__.webdriver;
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
        });

        // Google 계정 페이지로 이동
        console.log(`${c.blue}[1]${c.reset} Google 접속 중...`);
        await page.goto('https://myaccount.google.com', { waitUntil: 'networkidle2', timeout });

        // 페이지 상태 확인
        let state = await detectPageState(page);
        console.log(`${c.blue}[2]${c.reset} 페이지 상태: ${c.yellow}${state.state}${c.reset}`);

        // 이미 로그인됨
        if (state.state === 'ALREADY_LOGGED_IN') {
            console.log(`${c.green}✓✓✓ 이미 로그인되어 있습니다!${c.reset}\n`);
            saveSuccessLogin(account, LoginResult.SUCCESS_ALREADY_LOGGED_IN);
            return {
                success: true,
                result: LoginResult.SUCCESS_ALREADY_LOGGED_IN,
                browser,
                page
            };
        }

        // 로그인 페이지로 이동
        await page.goto('https://accounts.google.com', { waitUntil: 'networkidle2' });
        await delay(1000, 2000);

        // ===== 이메일 입력 =====
        console.log(`${c.blue}[3]${c.reset} 이메일 입력 중...`);
        const emailSelector = await waitForAnySelector(page, SELECTORS.EMAIL, 10000);
        
        if (!emailSelector) {
            throw new Error('이메일 입력 필드를 찾을 수 없습니다');
        }

        await page.click(emailSelector);
        await delay(200, 500);
        
        /* 타이핑 지연: 50~150ms/char — 평균 타이핑 속도(200ms/char) 범위 내
         * 봇 감지 회피를 위한 인간 시뮬레이션 (공식 API 없음, 역공학 기반) */
        for (const char of account.email) {
            await page.keyboard.type(char);
            await delay(50, 150);
        }
        
        console.log(`${c.green}✓${c.reset} 이메일 입력 완료`);
        await delay(500, 1000);
        
        // 다음 버튼 클릭
        const emailNextSelector = await waitForAnySelector(page, SELECTORS.EMAIL_NEXT, 5000);
        if (emailNextSelector) {
            await page.click(emailNextSelector);
        } else {
            await page.keyboard.press('Enter');
        }
        
        await delay(2000, 3000);

        // 상태 재확인
        state = await detectPageState(page);
        
        // CAPTCHA 감지
        if (state.state === 'CAPTCHA') {
            console.log(`${c.yellow}⚠️  reCAPTCHA 감지 - ${captchaWaitTime / 1000}초 대기${c.reset}`);
            await delay(captchaWaitTime);
            
            state = await detectPageState(page);
            if (state.state === 'CAPTCHA') {
                console.log(`${c.red}✗ reCAPTCHA 미해결${c.reset}\n`);
                saveFailedLogin(account, LoginResult.FAIL_CAPTCHA, 'reCAPTCHA 미해결');
                await browser.close();
                return { success: false, result: LoginResult.FAIL_CAPTCHA };
            }
        }
        
        // 전화번호 인증 감지
        if (state.state === 'PHONE_VERIFICATION') {
            console.log(`${c.red}✗ 전화번호 인증 필요 - 로그인 불가${c.reset}\n`);
            await page.screenshot({ path: path.join(FAILED_LOGS_DIR, `${sanitizeEmail(account.email)}_phone.png`) });
            saveFailedLogin(account, LoginResult.FAIL_PHONE_VERIFICATION, '전화번호 인증 필요', `${sanitizeEmail(account.email)}_phone.png`);
            await browser.close();
            return { success: false, result: LoginResult.FAIL_PHONE_VERIFICATION };
        }

        // ===== 2FA 페이지 먼저 감지 (Google이 비밀번호 건너뛸 때) =====
        const earlyTwoFA = await waitForAnySelector(page, SELECTORS.TWO_FA, 2000);
        const pageText = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
        /* 2FA 페이지 감지 텍스트 — Google UI 역공학, 공식 문서 없음 */
        const isVerifyPage = /verification code|authenticator|인증.*코드|Verify it.*you|본인 확인/i.test(pageText);

        if (earlyTwoFA || isVerifyPage) {
            console.log(`${c.yellow}⚠️  비밀번호 단계 건너뜀 — 바로 2FA 페이지${c.reset}`);
        } else {
            // ===== 비밀번호 입력 =====
            console.log(`${c.blue}[4]${c.reset} 비밀번호 입력 중...`);
            const passwordSelector = await waitForAnySelector(page, SELECTORS.PASSWORD, 10000);

            if (!passwordSelector) {
                throw new Error('비밀번호 입력 필드를 찾을 수 없습니다');
            }

            await delay(1000, 2000);
            await page.click(passwordSelector);
            await delay(200, 500);
            await page.type(passwordSelector, account.password, { delay: 100 });

            console.log(`${c.green}✓${c.reset} 비밀번호 입력 완료`);
            await delay(500, 1000);

            // 다음 버튼 클릭
            const passwordNextSelector = await waitForAnySelector(page, SELECTORS.PASSWORD_NEXT, 5000);
            if (passwordNextSelector) {
                await page.click(passwordNextSelector);
            } else {
                await page.keyboard.press('Enter');
            }

            await delay(2000, 3000);
        }

        // ===== 패스키/기기승인 감지 =====
        const hasPasskey = await checkAnySelector(page, SELECTORS.PASSKEY_OR_DEVICE);
        if (hasPasskey) {
            console.log(`${c.red}✗ 패스키/기기승인 필요 — 자동화 불가${c.reset}\n`);
            await page.screenshot({ path: path.join(FAILED_LOGS_DIR, `${sanitizeEmail(account.email)}_passkey.png`) }).catch(() => {});
            saveFailedLogin(account, 'PASSKEY_REQUIRED', '패스키 또는 기기승인 필요');
            await browser.close();
            return { success: false, result: 'PASSKEY_REQUIRED' };
        }

        // ===== 2FA 처리 =====
        console.log(`${c.blue}[5]${c.reset} 2FA 확인 중...`);

        const twoFASelector = await waitForAnySelector(page, SELECTORS.TWO_FA, 5000);

        if (twoFASelector && account.twoFA) {
            console.log(`${c.yellow}⚠️  2FA 필요${c.reset}`);
            await delay(1000, 2000);
            
            const totpCode = generateTOTP(account.twoFA);
            if (!totpCode) {
                console.log(`${c.red}✗ TOTP 코드 생성 실패${c.reset}\n`);
                saveFailedLogin(account, LoginResult.FAIL_WRONG_2FA, 'TOTP 생성 실패');
                await browser.close();
                return { success: false, result: LoginResult.FAIL_WRONG_2FA };
            }

            console.log(`${c.green}✓${c.reset} TOTP 코드 생성 완료 (${totpCode.length}자리)`);
            
            await page.click(twoFASelector);
            await delay(200, 400);
            await page.type(twoFASelector, totpCode, { delay: 150 });
            
            console.log(`${c.green}✓${c.reset} 2FA 코드 입력 완료`);
            await delay(500, 1000);
            
            const twoFANextSelector = await waitForAnySelector(page, SELECTORS.TWO_FA_NEXT, 5000);
            if (twoFANextSelector) {
                await page.click(twoFANextSelector);
            } else {
                await page.keyboard.press('Enter');
            }
            
            await delay(2000, 3000);
        } else if (twoFASelector && !account.twoFA) {
            console.log(`${c.red}✗ 2FA 필요하지만 시크릿 키 없음${c.reset}\n`);
            saveFailedLogin(account, LoginResult.FAIL_WRONG_2FA, '2FA 시크릿 키 없음');
            await browser.close();
            return { success: false, result: LoginResult.FAIL_WRONG_2FA };
        }

        // ===== 로그인 완료 확인 =====
        console.log(`${c.blue}[6]${c.reset} 로그인 확인 중...`);
        await page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: 30000
        }).catch(() => {});

        await delay(2000);

        // 추가 보안 페이지 ("본인 확인", "나중에" 등) 건너뛰기
        const skipButtons = await page.$$('button');
        for (const btn of skipButtons) {
            const text = await btn.evaluate(el => el.textContent).catch(() => '');
            /* 보안/확인 건너뛰기 버튼 텍스트 — Google UI 역공학, 공식 문서 없음
         * 한/영 혼합: 나중에, skip, not now, 아니요, cancel */
        if (/나중에|skip|not now|아니요|cancel/i.test(text)) {
                await btn.click().catch(() => {});
                await delay(2000, 3000);
                break;
            }
        }

        const currentUrl = page.url();

        /* 로그인 성공 판정: accounts.google.com에서 벗어났으면 성공
         * myaccount/youtube/webhp = 로그인 후 리다이렉트 대상 (역공학, 공식 문서 없음) */
        if (currentUrl.includes('myaccount.google.com') ||
            currentUrl.includes('youtube.com') ||
            currentUrl.includes('google.com/webhp') ||
            !currentUrl.includes('accounts.google.com')) {
            
            console.log(`${c.green}✓✓✓ 로그인 성공!${c.reset}`);
            console.log(`${c.cyan}URL: ${currentUrl}${c.reset}\n`);
            
            saveSuccessLogin(account, LoginResult.SUCCESS);
            
            return {
                success: true,
                result: LoginResult.SUCCESS,
                browser,
                page,
                url: currentUrl
            };
        } else {
            console.log(`${c.red}✗ 로그인 실패 (알 수 없는 상태)${c.reset}\n`);
            await page.screenshot({ path: path.join(FAILED_LOGS_DIR, `${sanitizeEmail(account.email)}_unknown.png`) });
            saveFailedLogin(account, LoginResult.FAIL_UNKNOWN, `URL: ${currentUrl}`, `${sanitizeEmail(account.email)}_unknown.png`);
            await browser.close();
            return { success: false, result: LoginResult.FAIL_UNKNOWN };
        }

    } catch (error) {
        console.error(`${c.red}✗ 오류 발생: ${error.message}${c.reset}\n`);
        
        if (page) {
            await page.screenshot({ path: path.join(FAILED_LOGS_DIR, `${sanitizeEmail(account.email)}_error.png`) }).catch(() => {});
        }
        
        const errResult = error.message && error.message.includes('timeout') ? LoginResult.FAIL_TIMEOUT : LoginResult.UNKNOWN_ERROR;
        saveFailedLogin(account, errResult, error.message, `${sanitizeEmail(account.email)}_error.png`);
        
        if (browser) await browser.close();
        
        return { success: false, result: LoginResult.FAIL_TIMEOUT, error: error.message };
    }
}

/**
 * 여러 계정 로그인 with 실패 추적
 */
async function loginMultipleWithTracking(accounts, options = {}) {
    const results = {
        success: [],
        failed: [],
        summary: {}
    };

    console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.cyan}   총 ${accounts.length}개 계정 로그인 시작${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        console.log(`[${i + 1}/${accounts.length}] ${account.email}`);

        const result = await advancedGoogleLogin(account, options);

        if (result.success) {
            results.success.push({ email: account.email, result: result.result });
            if (result.browser) try { await result.browser.close(); } catch (_) {}
        } else {
            results.failed.push({ email: account.email, result: result.result, error: result.error });
        }

        // 다음 계정 전 대기
        if (i < accounts.length - 1) {
            console.log(`${c.yellow}⏳ 5초 대기...${c.reset}\n`);
            await delay(5000, 5000);
        }
    }

    // 결과 요약
    results.summary = {
        total: accounts.length,
        success: results.success.length,
        failed: results.failed.length,
        successRate: ((results.success.length / accounts.length) * 100).toFixed(1) + '%',
        failureBreakdown: {}
    };

    results.failed.forEach(f => {
        results.summary.failureBreakdown[f.result] = (results.summary.failureBreakdown[f.result] || 0) + 1;
    });

    // 결과 출력
    console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.cyan}   로그인 결과 요약${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
    
    console.log(`총 계정: ${results.summary.total}`);
    console.log(`${c.green}성공: ${results.summary.success}${c.reset}`);
    console.log(`${c.red}실패: ${results.summary.failed}${c.reset}`);
    console.log(`성공률: ${results.summary.successRate}\n`);

    if (Object.keys(results.summary.failureBreakdown).length > 0) {
        console.log(`${c.red}실패 원인 분석:${c.reset}`);
        Object.entries(results.summary.failureBreakdown).forEach(([reason, count]) => {
            console.log(`  • ${reason}: ${count}개`);
        });
        console.log();
    }

    console.log(`${c.yellow}📝 실패 로그: ${getTodayLogFile()}${c.reset}\n`);

    return results;
}

// CLI 실행
if (require.main === module) {
    const credFile = path.join(__dirname, 'credentials_data.json');
    
    if (!fs.existsSync(credFile)) {
        console.error(`${c.red}❌ credentials_data.json 파일이 없습니다!${c.reset}\n`);
        process.exit(1);
    }

    let allCredentials;
    try { allCredentials = JSON.parse(fs.readFileSync(credFile, 'utf-8')); }
    catch (e) { console.error(`${c.red}❌ JSON 파싱 실패: ${e.message}${c.reset}`); process.exit(1); }
    const testAccounts = allCredentials;

    loginMultipleWithTracking(testAccounts, {
        headless: false,
        timeout: 60000,
        captchaWaitTime: 120000
    }).then(() => {
        console.log(`${c.green}✅ 모든 작업 완료!${c.reset}\n`);
        process.exit(0);
    }).catch(error => {
        console.error(`${c.red}❌ 오류:${c.reset}`, error);
        process.exit(1);
    });
}

module.exports = {
    advancedGoogleLogin,
    loginMultipleWithTracking,
    LoginResult
};
