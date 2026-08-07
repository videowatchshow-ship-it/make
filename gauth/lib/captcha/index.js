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
  if (process.env.WIT_AI_TOKEN) adapters.push('wit-audio');
  if (process.env.GEMINI_API_KEY) adapters.push('gemini-vision');
  return adapters;
}

function availableSitekeyAdapters() {
  return [];
}

async function solveAny({ page, sitekey, pageurl, invisible, log = () => {} }) {
  const witToken = process.env.WIT_AI_TOKEN || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  if (witToken) {
    log('[captcha] wit.ai 오디오 모드 시도');
    const result = await solveAudioCaptcha({ page, witToken, log });
    if (result.success && result.token) {
      return { token: result.token, provider: 'wit-audio' };
    }
    log(`[captcha] wit.ai 실패: ${result.error}`);
  }

  if (geminiKey) {
    log('[captcha] Gemini Vision 시도');
    try {
      const { solveWithGeminiVision } = require('./gemini_visual');
      const result = await solveWithGeminiVision({ page, apiKey: geminiKey, log });
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
