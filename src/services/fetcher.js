/**
 * Fetcher service — retrieves web pages safely.
 * - Validates URLs (no private/loopback addresses in production)
 * - Respects content-type and size limits
 * - Retries with exponential backoff on rate-limit / transient errors
 */
const axios = require('axios');
const axiosRetry = require('axios-retry').default;

const MAX_BYTES = parseInt(process.env.MAX_CONTENT_BYTES || '512000', 10);
const TIMEOUT = parseInt(process.env.FETCH_TIMEOUT_MS || '10000', 10);

const PRIVATE_RANGES = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^\[?::1\]?$/,
];

function isPrivateHost(hostname) {
  return PRIVATE_RANGES.some(r => r.test(hostname));
}

function validateUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw Object.assign(new Error(`Invalid URL: ${urlStr}`), { code: 'INVALID_URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error(`Unsupported protocol: ${parsed.protocol}`), { code: 'INVALID_URL' });
  }
  if (process.env.NODE_ENV === 'production' && isPrivateHost(parsed.hostname)) {
    throw Object.assign(new Error(`Private address not allowed: ${parsed.hostname}`), { code: 'PRIVATE_ADDRESS' });
  }
  return parsed;
}

const client = axios.create({ timeout: TIMEOUT, maxRedirects: 5 });

axiosRetry(client, {
  retries: 3,
  retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 30000),
  retryCondition: (err) => {
    const status = err.response?.status;
    return axiosRetry.isNetworkError(err) || status === 429 || (status >= 500 && status < 600);
  },
  onRetry: (count, err) => {
    console.warn(`[fetcher] retry ${count} for ${err.config?.url}: ${err.message}`);
  },
});

/**
 * Fetch a URL and return its text content.
 * Returns null if the page can't be retrieved (404, timeout, etc.)
 * Throws only on programming errors.
 */
async function fetchPage(urlStr) {
  validateUrl(urlStr);

  let response;
  try {
    response = await client.get(urlStr, {
      responseType: 'text',
      headers: {
        'User-Agent': 'InterviewPrepBot/1.0 (educational tool; respects robots.txt)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxContentLength: MAX_BYTES,
      decompress: true,
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 404 || status === 410) return null;
    // Timeout, network error, or exhausted retries
    console.warn(`[fetcher] failed to fetch ${urlStr}: ${err.message}`);
    return null;
  }

  const contentType = response.headers['content-type'] || '';
  if (!contentType.includes('text/') && !contentType.includes('application/xhtml')) {
    return null; // skip binary/pdf/etc
  }

  return typeof response.data === 'string' ? response.data : null;
}

module.exports = { fetchPage, validateUrl };
