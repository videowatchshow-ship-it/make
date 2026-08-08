// reCAPTCHA v2 이미지 CAPTCHA → Gemini Vision으로 해결 시도
// ref: https://ai.google.dev/gemini-api/docs/image-understanding
// ref: https://github.com/njraladdin/recaptcha-v2-solver
'use strict';

const https = require('https');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function solveWithGeminiVision({ page, apiKey, log = () => {} }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  // bframe 찾기
  let bframe = null;
  for (const frame of page.frames()) {
    if (frame.url().includes('api2/bframe') || frame.url().includes('recaptcha/api2/bframe') || frame.url().includes('enterprise/bframe') || frame.url().includes('recaptcha/enterprise/bframe')) {
      bframe = frame;
      break;
    }
  }
  if (!bframe) throw new Error('bframe not found');

  // 이미지 챌린지 확인
  const hasImageChallenge = await bframe.$('.rc-imageselect-challenge').catch(() => null);
  if (!hasImageChallenge) throw new Error('no image challenge found');

  // 챌린지 스크린샷
  const challengeEl = await bframe.$('.rc-imageselect-challenge');
  if (!challengeEl) throw new Error('challenge element not found');

  const screenshot = await challengeEl.screenshot({ encoding: 'base64' });
  log('챌린지 이미지 캡처');

  // 지시문 추출
  const instruction = await bframe.evaluate(() => {
    const el = document.querySelector('.rc-imageselect-desc-wrapper, .rc-imageselect-desc, .rc-imageselect-instructions');
    return el ? el.innerText : '';
  });
  log(`지시문: ${instruction}`);

  // Gemini Vision API 호출
  const body = JSON.stringify({
    contents: [{
      parts: [
        {
          text: `This is a reCAPTCHA image challenge. The instruction says: "${instruction}".
The image is a 3x3 or 4x4 grid. Tell me which grid squares (numbered 1-9 or 1-16, left-to-right top-to-bottom) match the instruction.
Reply with ONLY the numbers separated by commas. Example: 1,4,7`
        },
        { inline_data: { mime_type: 'image/png', data: screenshot } }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
  });

  const answer = await new Promise((resolve, reject) => {
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
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) resolve(text);
          else reject(new Error('Gemini: empty response'));
        } catch (e) { reject(new Error('Gemini parse: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body);
    req.end();
  });

  log(`Gemini 결과: "${answer}"`);

  // 숫자 파싱
  const nums = answer.match(/\d+/g);
  if (!nums || nums.length === 0) throw new Error('no numbers in Gemini response');

  // 그리드 타일 클릭
  const tiles = await bframe.$$('.rc-imageselect-tile');
  log(`타일 수: ${tiles.length}, 선택: ${nums.join(',')}`);

  for (const numStr of nums) {
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < tiles.length) {
      await tiles[idx].click();
      await wait(300);
    }
  }

  // verify 클릭
  await wait(500);
  const verify = await bframe.$('#recaptcha-verify-button');
  if (verify) {
    await verify.click();
    log('verify 클릭');
  }

  await wait(3000);

  // 토큰 추출
  const token = await page.evaluate(() => {
    const ta = document.querySelector('textarea[name="g-recaptcha-response"]');
    return ta && ta.value ? ta.value : null;
  });

  if (token) {
    return { success: true, token };
  }

  throw new Error('no token after verify');
}

module.exports = { solveWithGeminiVision };
