/**
 * LLM service — wraps Google Gemini API (free tier).
 * - Handles rate-limit (429) with exponential backoff
 * - Validates JSON responses
 * - Never trusts fetched content as instructions (system prompt separation)
 */
const axios = require('axios');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_RETRIES = 5;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call the Gemini API with retry/backoff on rate limits.
 * @param {string} systemPrompt - Instructions (trusted)
 * @param {string} userContent - Content to process (untrusted, treated as data)
 * @returns {string} raw text response
 */
async function callLLM(systemPrompt, userContent) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY not set');

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
  };

  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(`${BASE_URL}?key=${API_KEY}`, body, {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' },
      });
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from LLM');
      return text;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        const wait = Math.min(2000 * Math.pow(2, attempt), 60000);
        console.warn(`[llm] rate-limited (${status}), waiting ${wait}ms (attempt ${attempt + 1})`);
        await sleep(wait);
        continue;
      }
      // Non-retryable
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Call LLM and parse the result as JSON.
 * Strips markdown code fences if present.
 */
async function callLLMJson(systemPrompt, userContent) {
  const raw = await callLLM(systemPrompt, userContent);

  // Strip ```json ... ``` fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object/array within the text
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    throw Object.assign(new Error('LLM returned invalid JSON'), { code: 'LLM_INVALID_JSON', raw: cleaned.slice(0, 500) });
  }
}

module.exports = { callLLM, callLLMJson };
