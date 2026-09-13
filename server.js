/**
 * server.js — Audio Theraphy Node.js Dev Server
 *
 * Serves static files AND proxies JioSaavn API & audio streams with required headers.
 * Run: node server.js
 * Then open: http://localhost:5500
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 5500;
const STATIC_DIR = __dirname;
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'no-cache',
};

function proxySaavn(queryString, res) {
  const target = `${JIOSAAVN_API}?${queryString}`;
  https.get(
    target,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.jiosaavn.com/',
        'Accept': 'application/json, text/plain, */*',
      },
      timeout: 15000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, {
        ...COMMON_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
      });
      proxyRes.pipe(res);
    }
  ).on('error', (err) => {
    res.writeHead(502, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

function proxyAudio(audioUrl, req, res) {
  try {
    const parsed = new URL(audioUrl);
    const client = parsed.protocol === 'http:' ? http : https;

    const reqHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.jiosaavn.com/',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      reqHeaders['Range'] = req.headers.range;
    }

    client.get(audioUrl, { headers: reqHeaders, timeout: 30000 }, (streamRes) => {
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
    }).on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } catch (err) {
    res.writeHead(400, { ...COMMON_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL' }));
  }
}

function serveStatic(reqPath, req, res) {
  let safePath = reqPath.split('?')[0];
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const decodedPath = decodeURIComponent(safePath);
  const filePath = path.join(STATIC_DIR, decodedPath);

  // Security check: ensure path is within STATIC_DIR
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
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
    const queryString = parsedUrl.search ? parsedUrl.search.slice(1) : '';
    return proxySaavn(queryString, res);
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
