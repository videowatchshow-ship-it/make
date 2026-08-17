// Gemini Vision 텍스트 CAPTCHA solver (page-based)
// ref: https://ai.google.dev/gemini-api/docs/image-understanding
'use strict';

const https = require('https');

async function solveTextCaptcha({ page, apiKey, log = () => {} }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const captchaImg = await page.$('img[src*="captcha"], img[id*="captcha"], img.captcha-img, img[alt*="captcha"]');
  if (!captchaImg) throw new Error('CAPTCHA image not found');

  const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
  log('CAPTCHA 이미지 캡처');

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: 'Read the text in this CAPTCHA image. Reply with ONLY the text, no explanation.' },
        { inline_data: { mime_type: 'image/png', data: screenshot } }
      ]
    }]
  });

  const result = await new Promise((resolve, reject) => {
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
          else reject(new Error('Gemini: no text in response'));
        } catch (e) { reject(new Error('Gemini parse: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body);
    req.end();
  });

  log(`Gemini 결과: "${result}"`);

  const input = await page.$('input[name*="captcha"], input[id*="captcha"], input.captcha-input, input[type="text"][name*="ca"]');
  if (!input) throw new Error('CAPTCHA input field not found');

  await input.click({ delay: 50 });
  await input.type(result, { delay: 40 });

  const submit = await page.$('button[type="submit"], input[type="submit"], #submit, button.captcha-submit');
  if (submit) await submit.click();

  return { success: true, text: result };
}

module.exports = { solveTextCaptcha };
