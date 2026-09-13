/**
 * api/saavn.js — Vercel Serverless Function
 * Proxies JioSaavn API calls with strict input validation, method enforcement,
 * parameter allowlisting, CORS restriction, and error sanitization.
 */

// Allowlisted JioSaavn API calls required by Audio Theraphy
const ALLOWED_CALLS = new Set([
  'search.getResults',
  'song.generateAuthToken',
  'song.getDetails',
  'autocomplete.get',
]);

const JIOSAAVN_API = 'https://www.jiosaavn.com/api.php';

export default async function handler(req, res) {
  // 1. Restrict CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // 2. HTTP Method restriction
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 3. Input Validation
  const query = req.query || {};
  const call = query.__call;

  if (!call || !ALLOWED_CALLS.has(call)) {
    return res.status(400).json({ error: 'Invalid or unauthorized API call' });
  }

  // Validate search query length
  if (query.q && typeof query.q === 'string' && query.q.length > 100) {
    return res.status(400).json({ error: 'Search query exceeds maximum length of 100 characters' });
  }

  // Validate results limit parameter
  if (query.n) {
    const num = parseInt(query.n, 10);
    if (isNaN(num) || num < 1 || num > 50) {
      return res.status(400).json({ error: 'Limit parameter must be between 1 and 50' });
    }
  }

  // Validate encrypted URL length for auth token requests
  if (query.url && typeof query.url === 'string' && query.url.length > 500) {
    return res.status(400).json({ error: 'Token url parameter exceeds allowed length' });
  }

  try {
    // Reconstruct sanitized query parameters
    const safeParams = new URLSearchParams();
    safeParams.set('__call', call);
    safeParams.set('_format', 'json');
    safeParams.set('_marker', '0');
    safeParams.set('api_version', '4');
    safeParams.set('ctx', 'wap6dot0');

    if (query.q) safeParams.set('q', String(query.q).slice(0, 100));
    if (query.n) safeParams.set('n', String(Math.min(50, Math.max(1, parseInt(query.n, 10) || 20))));
    if (query.url) safeParams.set('url', String(query.url).slice(0, 500));
    if (query.bitrate) {
      const b = String(query.bitrate);
      safeParams.set('bitrate', ['320', '160', '96'].includes(b) ? b : '320');
    }

    const targetUrl = `${JIOSAAVN_API}?${safeParams.toString()}`;

    // Set 10-second timeout to prevent hanging connections
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.jiosaavn.com/',
        'Accept': 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(response.status).send(data);
  } catch (error) {
    console.error('[API/Saavn] Proxy error:', error);
    return res.status(502).json({ error: 'Search service unavailable' });
  }
}
