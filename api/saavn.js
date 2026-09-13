/**
 * api/saavn.js — Vercel Serverless Function
 * Proxies JioSaavn search and auth queries with required Referer & User-Agent headers.
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const JIOSAAVN_API = 'https://www.jiosaavn.com/api.php';
    const queryString = new URL(req.url, 'http://localhost').search;
    const targetUrl = `${JIOSAAVN_API}${queryString}`;

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.jiosaavn.com/',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const data = await response.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(response.status).send(data);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Failed to fetch from JioSaavn API' });
  }
}
