/**
 * CAPTCHA 통합 매니저
 *
 * 우선순위:
 *   1. 오디오 (wit.ai, 무료, 성공률 70-100%)
 *   2. Gemini Vision (무료, 성공률 낮음)
 *
 * ref: https://github.com/njraladdin/recaptcha-v2-solver
 * ref: https://ai.google.dev/gemini-api/docs/image-understanding
 */
'use strict';

const { solveAudioCaptcha } = require('./audio_solver');

function availablePageAdapters() {
  const adapters = [];
  if (process.env.WIT_AI_TOKEN || process.env.GEMINI_API_KEY) adapters.push('audio-stt');
  if (process.env.GEMINI_API_KEY) adapters.push('gemini-vision');
  return adapters;
}

function availableSitekeyAdapters() {
  return [];
}

function getGeminiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  for (let i = 2; i <= 8; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

let geminiKeyIdx = 0;
function nextGeminiKey() {
  const keys = getGeminiKeys();
  if (!keys.length) return '';
  const key = keys[geminiKeyIdx % keys.length];
  geminiKeyIdx = (geminiKeyIdx + 1) % keys.length;
  return key;
}

async function solveAny({ page, sitekey, pageurl, invisible, log = () => {} }) {
  const witToken = process.env.WIT_AI_TOKEN || '';
  const geminiKeys = getGeminiKeys();
  const geminiKey = geminiKeys.length ? nextGeminiKey() : '';

  if (witToken || geminiKeys.length) {
    log(`[captcha] 오디오 STT 모드 시도 (${witToken ? 'wit.ai' : 'gemini'}, keys=${geminiKeys.length})`);
    const result = await solveAudioCaptcha({ page, witToken, geminiKeys, log });
    if (result.success && result.token) {
      return { token: result.token, provider: witToken ? 'wit-audio' : 'gemini-audio' };
    }
    log(`[captcha] 오디오 실패: ${result.error}`);
  }

  if (geminiKeys.length) {
    log('[captcha] Gemini Vision 시도');
    try {
      const { solveWithGeminiVision } = require('./gemini_visual');
      const result = await solveWithGeminiVision({ page, apiKey: geminiKeys[0], log });
      if (result.success && result.token) {
        return { token: result.token, provider: 'gemini-vision' };
      }
    } catch (e) {
      log(`[captcha] Gemini 실패: ${e.message}`);
    }
  }

  throw new Error('NO_CAPTCHA_ADAPTER_SUCCEEDED');
}

function solveRecaptchaV2() {
  return null;
}

module.exports = { availablePageAdapters, availableSitekeyAdapters, solveAny, solveRecaptchaV2 };
