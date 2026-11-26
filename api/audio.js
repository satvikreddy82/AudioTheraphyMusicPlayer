/**
 * api/audio.js — Vercel Serverless Function
 *
 * Securely streams JioSaavn CDN audio files with required Referer & Range headers
 * to enable complete full-song playback and responsive seeking across all devices.
 * Includes SSRF protection, method enforcement, and sanitized error responses.
 */

import { Readable } from 'stream';

export const config = {
  api: {
    responseLimit: false, // Disable 4MB response limit for audio streaming
  },
};

// Allowed JioSaavn CDN domains regex (e.g. web.saavncdn.com, aac.saavncdn.com, c.saavncdn.com)
const ALLOWED_CDN_HOST_REGEX = /^([a-zA-Z0-9-]+\.)*(saavncdn\.com|jiosaavn\.com)$/i;

// Blocked private / internal IP ranges & keywords
const DISALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',
  'instance-data',
  'metadata.google.internal',
]);

/**
 * Validates audio URL strictly against SSRF attacks.
 * Returns the parsed URL object if valid, or null if invalid.
 */
function validateAudioUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (rawUrl.length > 1024) return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // 1. Strict HTTPS protocol only
  if (parsed.protocol !== 'https:') return null;

  // 2. Disallow credentials in URL
  if (parsed.username || parsed.password) return null;

  // 3. Port must be 443 or default empty
  if (parsed.port && parsed.port !== '443') return null;

  const hostname = parsed.hostname.toLowerCase();

  // 4. Reject known loopback / link-local / metadata hosts
  if (DISALLOWED_HOSTS.has(hostname)) return null;

  // 5. Reject private IPv4 ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
    return null;
  }

  // 6. Reject raw numeric IPv4 or IPv6 addresses
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    return null;
  }

  // 7. Hostname must end with approved JioSaavn/Saavn CDN domain
  if (!ALLOWED_CDN_HOST_REGEX.test(hostname)) {
    return null;
  }

  return parsed;
}

export default async function handler(req, res) {
  // 1. Restrict CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');

  // 2. HTTP Method restriction
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 3. Input validation & SSRF check
  const { url } = req.query;
  const validatedUrl = validateAudioUrl(url);

  if (!validatedUrl) {
    return res.status(400).json({ error: 'Invalid or unauthorized audio URL' });
  }

  try {
    const fetchHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.jiosaavn.com/',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    // Abort upstream fetch if client disconnects
    req.on('close', () => {
      controller.abort();
    });

    const response = await fetch(validatedUrl.toString(), {
      headers: fetchHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    res.status(response.status);

    const headersToForward = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    headersToForward.forEach((h) => {
      const val = response.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    if (!response.body) {
      return res.end();
    }

    // Convert Web ReadableStream to Node Readable and pipe to res
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      console.error('[API/Audio] Streaming error:', error.message);
      return res.status(502).json({ error: 'Audio stream unavailable' });
    }
  }
}
