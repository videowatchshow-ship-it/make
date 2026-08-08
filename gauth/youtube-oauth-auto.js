/* YouTube OAuth 자동 consent + refresh_token 획득
 * 로그인된 Puppeteer 브라우저 세션을 재사용하여
 * OAuth consent → auth code → refresh_token 전체 자동화
 *
 * ref: https://developers.google.com/identity/protocols/oauth2/web-server
 * ref: https://pptr.dev/api/puppeteer.page.goto
 * ref: https://pptr.dev/api/puppeteer.page.waitfornavigation */
const https = require('https');
const { URL } = require('url');
const path = require('path');

const CONSENT_TIMEOUT = 30000;

let generateTotpLocal;
try { generateTotpLocal = require(path.join(__dirname, 'lib/totp_local')).generateTOTP; } catch (_) {}
if (!generateTotpLocal) {
  try { generateTotpLocal = require('./lib/totp_local').generateTOTP; } catch (_) {}
}
if (!generateTotpLocal) {
  try { generateTotpLocal = require('/opt/gauth-full/lib/totp_local').generateTOTP; } catch (_) {}
}

async function delay(min = 500, max = 1500) {
  return new Promise(r => setTimeout(r, Math.random() * (max - min) + min));
}

async function clickByText(page, texts, tag = 'button,a,span,div') {
  for (const text of texts) {
    const el = await page.evaluateHandle((t, s) => {
      const els = document.querySelectorAll(s);
      for (const e of els) {
        if (e.textContent.trim().includes(t)) return e;
      }
      return null;
    }, text, tag);
    if (el && el.asElement()) {
      await el.asElement().click();
      return true;
    }
  }
  return false;
}

/**
 * 로그인된 Puppeteer 브라우저로 YouTube OAuth consent 자동 수행
 * @param {object} browser - Puppeteer Browser 인스턴스 (로그인 완료 상태)
 * @param {object} oauthConfig - { client_id, client_secret, redirect_uri, scopes }
 * @returns {object} { success, channel_id, channel_title, refresh_token, access_token, error }
 */
async function autoOAuthConsent(browser, oauthConfig, loginPage, log) {
  if (!log) log = (...args) => console.log(...args);
  const { client_id, client_secret, redirect_uri } = oauthConfig;
  const scopes = oauthConfig.scopes || 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl';
  const state = 'auto_' + Date.now();

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + [
    'client_id=' + encodeURIComponent(client_id),
    'redirect_uri=' + encodeURIComponent(redirect_uri),
    'response_type=code',
    'scope=' + encodeURIComponent(scopes),
    'access_type=offline',
    'state=' + state
  ].join('&');

  let page;
  try {
    if (loginPage) {
      page = loginPage;
      await page.setDefaultNavigationTimeout(CONSENT_TIMEOUT);
    } else {
      page = await browser.newPage();
      await page.setDefaultNavigationTimeout(CONSENT_TIMEOUT);
    }

    const accountInfo = oauthConfig._account || {};

    log('  [OAuth] consent URL 접속...');
    await page.goto(authUrl, { waitUntil: 'networkidle2', timeout: CONSENT_TIMEOUT });
    await delay(1500, 2500);

    let url = page.url();

    /* TOTP 재인증 요구 시 자동 처리 */
    if (url.includes('challenge/totp') || url.includes('challenge/pwd')) {
      log(`  [OAuth] Google 재인증 요구: ${url.includes('totp') ? 'TOTP' : 'PASSWORD'}, generateTotpLocal=${!!generateTotpLocal}`);

      if (url.includes('challenge/pwd') && accountInfo.password) {
        const pwInput = await page.$('input[type="password"]').catch(() => null);
        if (pwInput) {
          await pwInput.type(accountInfo.password, { delay: 60 });
          const pwBtn = await page.$('#passwordNext').catch(() => null);
          if (pwBtn) await pwBtn.click();
          else await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONSENT_TIMEOUT }).catch(() => {});
          await delay(1500, 2500);
          url = page.url();
        }
      }

      if (url.includes('challenge/totp') && accountInfo.totp_secret && generateTotpLocal) {
        const code = generateTotpLocal(accountInfo.totp_secret);
        log(`  [OAuth] TOTP 입력: ${code}`);
        const totpInput = await page.$('input[type="tel"]').catch(() => null);
        log(`  [OAuth] totpInput=${!!totpInput}`);
        if (totpInput) {
          await totpInput.type(code, { delay: 60 });
          const totpBtn = await page.$('#totpNext').catch(() => null);
          log(`  [OAuth] totpBtn=${!!totpBtn}`);
          if (totpBtn) await totpBtn.click();
          else await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONSENT_TIMEOUT }).catch(() => {});
          await delay(1500, 2500);
          url = page.url();
          log(`  [OAuth] TOTP 후 URL: ${url.slice(0, 120)}`);
        } else {
          log(`  [OAuth] TOTP input 못 찾음, page URL: ${url.slice(0, 120)}`);
        }
      }
    }

    /* 브랜드 채널 선택 화면 — delegation 페이지면 첫 번째(기본) 채널 선택 */
    if (url.includes('/delegation') || url.includes('accountchooser')) {
      log('  [OAuth] 계정/브랜드 채널 선택 화면...');
      /* 기본 계정(첫 번째) 클릭 */
      const firstAccount = await page.$('ul li:first-child, div[data-identifier], div[data-email]');
      if (firstAccount) {
        await firstAccount.click();
        await delay(2000, 3000);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONSENT_TIMEOUT }).catch(() => {});
      }
      url = page.url();
    }

    /* "확인하지 않은 앱" 경고 처리 */
    if (url.includes('/warning') || url.includes('oauth/warning')) {
      log('  [OAuth] 확인하지 않은 앱 경고 → 고급 클릭...');
      await delay(500, 1000);
      const clicked = await clickByText(page, ['고급', '고급 설정 숨기기', 'Advanced'], 'a,button,span,div');
      if (clicked) {
        await delay(1000, 2000);
        const unsafeClicked = await clickByText(page,
          ['이동(안전하지 않음)', '안전하지 않음', 'Go to', 'unsafe'],
          'a,button,span,div'
        );
        if (unsafeClicked) {
          log('  [OAuth] 안전하지 않음 → 이동 클릭');
          await delay(2000, 3000);
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONSENT_TIMEOUT }).catch(() => {});
        }
      }
      url = page.url();
    }

    /* consent 화면 — "모두 선택" 체크 + "계속" 클릭 */
    if (url.includes('consentsummary') || url.includes('consent')) {
      log('  [OAuth] consent 화면 → 모두 선택 + 계속...');
      await delay(500, 1000);

      const selectAll = await page.$('input[type="checkbox"]');
      if (selectAll) {
        const checked = await page.evaluate(el => el.checked, selectAll);
        if (!checked) await selectAll.click();
        await delay(500, 1000);
      }

      const submitClicked = await clickByText(page, ['계속', 'Continue', '허용', 'Allow'], 'button,div,span');
      if (submitClicked) {
        log('  [OAuth] 계속 클릭됨, 리다이렉트 대기...');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONSENT_TIMEOUT }).catch(() => {});
      }
      url = page.url();
    }

    /* redirect_uri 도착 → code 파라미터 추출 */
    url = page.url();
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');

    if (!code) {
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
      log(`  [OAuth] code 못 찾음. URL: ${url.substring(0, 120)}`);
      log(`  [OAuth] body: ${bodyText.substring(0, 200)}`);

      if (bodyText.includes('suspended') || bodyText.includes('정지')) {
        return { success: false, error: 'CHANNEL_SUSPENDED' };
      }
      return { success: false, error: 'NO_AUTH_CODE', url: url.substring(0, 200) };
    }

    log('  [OAuth] auth code 획득! code=' + code.substring(0, 20) + '...');

    /* auth code → access_token + refresh_token 교환 */
    const tokenResult = await exchangeCodeForTokens(code, client_id, client_secret, redirect_uri);
    if (!tokenResult.success) {
      return { success: false, error: 'TOKEN_EXCHANGE_FAILED', detail: tokenResult.error };
    }

    /* 채널 정보 조회 */
    const channelInfo = await getChannelInfo(tokenResult.access_token);

    return {
      success: true,
      channel_id: channelInfo.channel_id || '',
      channel_title: channelInfo.channel_title || '',
      refresh_token: tokenResult.refresh_token,
      access_token: tokenResult.access_token,
      expires_in: tokenResult.expires_in
    };

  } catch (e) {
    log('  [OAuth] 에러:', e.message);
    return { success: false, error: e.message };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
  return new Promise((resolve) => {
    const body = [
      'code=' + encodeURIComponent(code),
      'client_id=' + encodeURIComponent(clientId),
      'client_secret=' + encodeURIComponent(clientSecret),
      'redirect_uri=' + encodeURIComponent(redirectUri),
      'grant_type=authorization_code'
    ].join('&');

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) resolve({ success: false, error: j.error + ': ' + (j.error_description || '') });
          else resolve({ success: true, access_token: j.access_token, refresh_token: j.refresh_token || '', expires_in: j.expires_in || 3600 });
        } catch (e) { resolve({ success: false, error: 'parse_error' }); }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

function getChannelInfo(accessToken) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: '/youtube/v3/channels?part=snippet&mine=true',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.items && j.items.length > 0) {
            resolve({ channel_id: j.items[0].id, channel_title: j.items[0].snippet.title });
          } else {
            resolve({ channel_id: '', channel_title: '' });
          }
        } catch { resolve({ channel_id: '', channel_title: '' }); }
      });
    });
    req.on('error', () => resolve({ channel_id: '', channel_title: '' }));
    req.end();
  });
}

module.exports = { autoOAuthConsent };
