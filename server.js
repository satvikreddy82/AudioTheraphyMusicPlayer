/**
 * server.js — Audio Theraphy Node.js Dev Server
 *
 * Serves static files AND securely proxies JioSaavn API & audio streams.
 * Includes SSRF allowlist, method enforcement, input bounds, and CORS restrictions.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 5500;
const STATIC_DIR = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
const JIOSAAVN_API = 'https://www.jiosaavn.com/api.php';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.m4a': 'audio/mp4',
};

const COMMON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
  'Cache-Control': 'no-cache',
};

const ALLOWED_CDN_HOST_REGEX = /^([a-zA-Z0-9-]+\.)*(saavncdn\.com|jiosaavn\.com)$/i;
const ALLOWED_CALLS = new Set([
  'search.getResults',
  'song.generateAuthToken',
  'song.getDetails',
  'autocomplete.get',
]);

const DISALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',
  'instance-data',
  'metadata.google.internal',
]);

function validateAudioUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 1024) return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== '443') return null;

  const hostname = parsed.hostname.toLowerCase();
  if (DISALLOWED_HOSTS.has(hostname)) return null;
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) return null;
  if (!ALLOWED_CDN_HOST_REGEX.test(hostname)) return null;

  return parsed;
}

function proxySaavn(parsedUrl, req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...COMMON_HEADERS, 'Allow': 'GET, OPTIONS', 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const query = parsedUrl.query || {};
  const call = query.__call;

  if (!call || !ALLOWED_CALLS.has(call)) {
    res.writeHead(400, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid or unauthorized API call' }));
  }

  if (query.q && typeof query.q === 'string' && query.q.length > 100) {
    res.writeHead(400, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Search query too long' }));
  }

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

  const target = `${JIOSAAVN_API}?${safeParams.toString()}`;
  const request = https.get(
    target,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.jiosaavn.com/',
        'Accept': 'application/json, text/plain, */*',
      },
      timeout: 10000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, {
        ...COMMON_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
      });
      proxyRes.pipe(res);
    }
  );

  request.on('timeout', () => {
    request.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream timeout' }));
    }
  });

  request.on('error', (err) => {
    console.error('[Server/Saavn] Error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Search service unavailable' }));
    }
  });
}

function proxyAudio(audioUrl, req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...COMMON_HEADERS, 'Allow': 'GET, OPTIONS', 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const validated = validateAudioUrl(audioUrl);
  if (!validated) {
    res.writeHead(400, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid or unauthorized audio URL' }));
  }

  try {
    const reqHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.jiosaavn.com/',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      reqHeaders['Range'] = req.headers.range;
    }

    const streamReq = https.get(validated.toString(), { headers: reqHeaders, timeout: 15000 }, (streamRes) => {
      const forwardHeaders = {
        ...COMMON_HEADERS,
      };

      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
        if (streamRes.headers[h]) {
          forwardHeaders[h] = streamRes.headers[h];
        }
      });

      res.writeHead(streamRes.statusCode || 200, forwardHeaders);
      streamRes.pipe(res);
    });

    streamReq.on('timeout', () => {
      streamReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Audio stream timeout' }));
      }
    });

    streamReq.on('error', (err) => {
      console.error('[Server/Audio] Error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Audio stream unavailable' }));
      }
    });
  } catch (err) {
    res.writeHead(400, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid audio request' }));
  }
}

function serveStatic(reqPath, req, res) {
  let safePath = reqPath.split('?')[0];
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const normalized = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(STATIC_DIR, normalized);

  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      ...COMMON_HEADERS,
      'Content-Type': contentType,
      'Content-Length': stats.size,
    };

    if (safePath === '/sw.js') {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, COMMON_HEADERS);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname.startsWith('/api/saavn')) {
    return proxySaavn(parsedUrl, req, res);
  }

  if (parsedUrl.pathname === '/api/audio') {
    const audioUrl = parsedUrl.query.url;
    if (audioUrl) {
      return proxyAudio(audioUrl, req, res);
    }
    res.writeHead(400, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing url parameter' }));
  }

  serveStatic(req.url, req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  >> Audio Theraphy Node Server running!`);
  console.log(`  ------------------------------------`);
  console.log(`  Landing page : http://localhost:${PORT}/index.html`);
  console.log(`  Music player : http://localhost:${PORT}/player.html`);
  console.log(`  ------------------------------------\n`);
});
