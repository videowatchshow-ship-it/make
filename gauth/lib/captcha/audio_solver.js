/**
 * reCAPTCHA v2 오디오 CAPTCHA solver
 *
 * 원본 참조:
 *   - njraladdin/recaptcha-v2-solver (audio flow):
 *     https://github.com/njraladdin/recaptcha-v2-solver/blob/main/lib/generateCaptchaTokensWithAudio.js
 *   - wit.ai Speech API (무료 STT):
 *     https://wit.ai/docs/http/20240304/#post__speech_link
 *   - reCAPTCHA selectors (공식):
 *     https://developers.google.com/recaptcha
 *
 * 흐름:
 *   1. anchor iframe에서 체크박스 클릭
 *   2. bframe iframe에서 오디오 버튼 클릭
 *   3. 오디오 URL 추출 → 다운로드
 *   4. wit.ai Speech API로 STT
 *   5. 답 입력 → verify 클릭
 *   6. g-recaptcha-response 토큰 추출
 */
'use strict';

const https = require('https');
const http = require('http');

function rdn(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function downloadAudio(url) {
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadAudio(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// ref: https://ai.google.dev/gemini-api/docs/audio
function geminiTranscribe(audioBuffer, apiKey) {
  const b64 = audioBuffer.toString('base64');
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: 'Transcribe this audio. Reply with ONLY the spoken words, nothing else. No punctuation.' },
        { inline_data: { mime_type: 'audio/mp3', data: b64 } }
      ]
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 100 }
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase();
          if (text) resolve(text);
          else reject(new Error('Gemini audio: no text'));
        } catch (e) { reject(new Error('Gemini audio parse: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini audio timeout')); });
    req.write(body);
    req.end();
  });
}

// ref: https://wit.ai/docs/http/20240304/#post__speech_link
function witAiTranscribe(audioBuffer, witToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.wit.ai',
      path: '/speech?v=20240304',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${witToken}`,
        'Content-Type': 'audio/mpeg3',
        'Content-Length': audioBuffer.length,
      },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const lines = data.trim().split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const j = JSON.parse(lines[i]);
              if (j.text) return resolve(j.text.trim().toLowerCase());
            } catch (_) {}
          }
          reject(new Error('wit.ai: no text in response'));
        } catch (e) {
          reject(new Error('wit.ai parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('wit.ai timeout')); });
    req.write(audioBuffer);
    req.end();
  });
}

/**
 * @param {Object} opts
 * @param {import('puppeteer').Page} opts.page
 * @param {string} opts.witToken - wit.ai Server Access Token
 * @param {Function} [opts.log]
 * @param {number} [opts.maxRetries=3]
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
async function solveAudioCaptcha({ page, witToken, geminiKey, log = () => {}, maxRetries = 3 }) {
  if (!witToken && !geminiKey) return { success: false, error: 'No STT token (WIT_AI_TOKEN or GEMINI_API_KEY)' };

  // 1. anchor iframe 찾기
  // ref: https://github.com/njraladdin/recaptcha-v2-solver — frame.url().includes('api2/anchor')
  let anchorFrame = null;
  for (const frame of page.frames()) {
    if (frame.url().includes('api2/anchor') || frame.url().includes('recaptcha/api2/anchor') || frame.url().includes('enterprise/anchor') || frame.url().includes('recaptcha/enterprise/anchor')) {
      anchorFrame = frame;
      break;
    }
  }
  if (!anchorFrame) {
    log('anchor iframe 없음');
    return { success: false, error: 'NO_ANCHOR_IFRAME' };
  }

  // 2. 체크박스 클릭
  try {
    const checkbox = await anchorFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 5000 });
    await wait(rdn(300, 700));
    await checkbox.click();
    log('체크박스 클릭');
  } catch (e) {
    log('체크박스 클릭 실패: ' + e.message);
    return { success: false, error: 'CHECKBOX_CLICK_FAILED' };
  }

  await wait(rdn(1500, 3000));

  // 이미 통과?
  try {
    const checked = await anchorFrame.$('.recaptcha-checkbox-checked');
    if (checked) {
      log('체크박스만으로 통과');
      const token = await extractToken(page);
      if (token) return { success: true, token };
    }
  } catch (_) {}

  // 3. bframe iframe 찾기
  let bframe = null;
  for (const frame of page.frames()) {
    if (frame.url().includes('api2/bframe') || frame.url().includes('recaptcha/api2/bframe') || frame.url().includes('enterprise/bframe') || frame.url().includes('recaptcha/enterprise/bframe')) {
      bframe = frame;
      break;
    }
  }
  if (!bframe) {
    log('bframe iframe 없음');
    return { success: false, error: 'NO_BFRAME_IFRAME' };
  }

  // 4. 오디오 버튼 클릭
  try {
    const audioBtn = await bframe.waitForSelector('#recaptcha-audio-button', { timeout: 5000 });
    await wait(rdn(200, 500));
    await audioBtn.click({ delay: rdn(30, 150) });
    log('오디오 버튼 클릭');
  } catch (e) {
    log('오디오 버튼 없음: ' + e.message);
    return { success: false, error: 'NO_AUDIO_BUTTON' };
  }

  await wait(rdn(2000, 4000));

  // rate limit 체크
  try {
    const rateLimit = await bframe.$('.rc-doscaptcha-header-text');
    if (rateLimit) {
      const text = await bframe.evaluate(el => el.textContent, rateLimit);
      if (text && text.toLowerCase().includes('try again later')) {
        log('rate limited');
        return { success: false, error: 'RATE_LIMITED' };
      }
    }
  } catch (_) {}

  // 5. 오디오 다운로드 + STT + 제출 (최대 maxRetries회)
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`오디오 시도 ${attempt}/${maxRetries}`);

    // 오디오 URL 추출
    let audioUrl = null;
    try {
      await bframe.waitForSelector('#audio-source', { timeout: 8000 });
      audioUrl = await bframe.evaluate(() => {
        const src = document.querySelector('#audio-source');
        if (src && src.src) return src.src;
        const dl = document.querySelector('.rc-audiochallenge-tdownload-link a');
        if (dl && dl.href) return dl.href;
        return null;
      });
    } catch (e) {
      log('오디오 소스 대기 실패: ' + e.message);
    }

    if (!audioUrl) {
      log('오디오 URL 없음');
      if (attempt < maxRetries) {
        try {
          const reload = await bframe.$('#recaptcha-reload-button');
          if (reload) { await reload.click(); await wait(rdn(2000, 4000)); }
        } catch (_) {}
        continue;
      }
      return { success: false, error: 'NO_AUDIO_URL' };
    }

    log(`오디오 다운로드: ${audioUrl.slice(0, 60)}...`);

    // 다운로드
    let audioBuffer;
    try {
      audioBuffer = await downloadAudio(audioUrl);
      log(`오디오 크기: ${audioBuffer.length} bytes`);
    } catch (e) {
      log('다운로드 실패: ' + e.message);
      continue;
    }

    // STT (wit.ai 우선, 없으면 Gemini)
    let transcript;
    try {
      if (witToken) {
        transcript = await witAiTranscribe(audioBuffer, witToken);
      } else {
        transcript = await geminiTranscribe(audioBuffer, geminiKey);
      }
      log(`STT 결과: "${transcript}"`);
    } catch (e) {
      log('STT 실패: ' + e.message);
      continue;
    }

    if (!transcript) {
      log('빈 STT 결과');
      continue;
    }

    // 답 입력
    try {
      const input = await bframe.$('#audio-response');
      if (!input) { log('audio-response 입력 필드 없음'); continue; }
      await input.click({ delay: rdn(30, 100) });
      await input.type(transcript, { delay: rdn(30, 75) });
      log('답 입력 완료');
    } catch (e) {
      log('답 입력 실패: ' + e.message);
      continue;
    }

    // verify 클릭
    try {
      const verify = await bframe.$('#recaptcha-verify-button');
      if (verify) {
        await wait(rdn(300, 800));
        await verify.click();
        log('verify 클릭');
      }
    } catch (e) {
      log('verify 실패: ' + e.message);
    }

    await wait(rdn(3000, 5000));

    // 토큰 추출
    const token = await extractToken(page);
    if (token) {
      log(`토큰 획득: ${token.slice(0, 30)}...`);
      return { success: true, token };
    }

    // 에러 메시지 확인
    try {
      const errMsg = await bframe.$('.rc-audiochallenge-error-message');
      if (errMsg) {
        const text = await bframe.evaluate(el => el.textContent, errMsg);
        log(`오디오 에러: ${text}`);
      }
    } catch (_) {}

    // 다시 시도
    if (attempt < maxRetries) {
      try {
        const reload = await bframe.$('#recaptcha-reload-button');
        if (reload) { await reload.click(); await wait(rdn(2000, 4000)); }
      } catch (_) {}
    }
  }

  return { success: false, error: 'MAX_RETRIES_EXCEEDED' };
}

async function extractToken(page) {
  try {
    return await page.evaluate(() => {
      const ta = document.querySelector('textarea[name="g-recaptcha-response"]');
      return ta && ta.value ? ta.value : null;
    });
  } catch (_) {
    return null;
  }
}

module.exports = { solveAudioCaptcha, downloadAudio, witAiTranscribe };
