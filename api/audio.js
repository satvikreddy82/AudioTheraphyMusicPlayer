/**
 * api/audio.js — Vercel Serverless Function
 * Streams JioSaavn CDN audio file with required Referer & Range headers for full seeking and duration.
 */

import { Readable } from 'stream';

export const config = {
  api: {
    responseLimit: false, // Disable 4MB response limit for audio streaming
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.jiosaavn.com/',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const response = await fetch(url, { headers: fetchHeaders });

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
      return res.status(502).json({ error: error.message || 'Audio stream failed' });
    }
  }
}
