/**
 * musicService.js — Audio Theraphy
 *
 * Full-song playback via JioSaavn (official web API).
 *
 * All JioSaavn calls go through our local server.py proxy at /api/saavn
 * which adds the required Referer header. Audio is streamed via /api/audio.
 *
 * Falls back to Apple iTunes 30s previews (JSONP) when JioSaavn fails.
 */

'use strict';

let _activeProxyBase = null;

function getProxyBases() {
  const list = [''];
  if (typeof window !== 'undefined') {
    const port = window.location.port;
    if (port && port !== '5500') {
      list.push('http://localhost:5500');
      list.push('http://127.0.0.1:5500');
    } else if (window.location.protocol === 'file:') {
      list.push('http://localhost:5500');
      list.push('http://127.0.0.1:5500');
    }
  }
  return list;
}

const ITUNES_BASE        = 'https://itunes.apple.com';
const REQUEST_TIMEOUT_MS = 12000;

// ─────────────────────────────────────────────
//  LANGUAGE HINTS
// ─────────────────────────────────────────────
const LANGUAGE_HINTS = {
  telugu:    'Telugu',
  hindi:     'Hindi',
  tamil:     'Tamil',
  malayalam: 'Malayalam',
  kannada:   'Kannada',
  punjabi:   'Punjabi',
  english:   '',
  all:       '',
};

// ─────────────────────────────────────────────
//  FETCH HELPER (with timeout & multi-proxy failover)
// ─────────────────────────────────────────────
async function apiFetch(pathAndQuery, timeoutMs = REQUEST_TIMEOUT_MS) {
  const bases = _activeProxyBase !== null
    ? [_activeProxyBase, ...getProxyBases().filter(b => b !== _activeProxyBase)]
    : getProxyBases();

  let lastError = null;

  for (const base of bases) {
    const fullUrl = `${base}${pathAndQuery}`;
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        _activeProxyBase = base;
        return await res.json();
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error('Request timed out. Please check your internet connection.');
  }
  throw lastError || new Error('Network request failed');
}

// ─────────────────────────────────────────────
//  iTunes Fallback (Secure CORS fetch)
// ─────────────────────────────────────────────
async function safeFetchItunes(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─────────────────────────────────────────────
//  JIOSAAVN NORMALISER
// ─────────────────────────────────────────────
function normalizeSaavnTrack(item) {
  const info    = item.more_info || {};
  const artists = info.artistMap?.primary_artists || [];
  const artist  = artists.length
    ? artists.map(a => a.name).join(', ')
    : (item.subtitle || '').split(' - ')[0] || 'Unknown Artist';
  const album   = info.album || (item.subtitle || '').split(' - ').slice(1).join(' - ') || '';
  const raw150  = item.image || '';
  const art500  = raw150.replace(/\d+x\d+/, '500x500');

  return {
    id:           item.id || `s_${Math.random()}`,
    title:        item.title || item.name || 'Unknown Title',
    artist,
    album,
    artworkUrl:   art500,
    thumbnailUrl: raw150,
    previewUrl:   null,                    // resolved by getAudioUrl()
    encryptedUrl: info.encrypted_media_url || '',
    durationMs:   parseInt(info.duration || 0) * 1000,
    genre:        item.language || '',
    year:         parseInt(item.year) || null,
    isFullSong:   true,
    saavnId:      item.id || '',
  };
}

// ─────────────────────────────────────────────
//  INTERNAL: JioSaavn search via local proxy
// ─────────────────────────────────────────────
async function _saavnSearch(query, limit) {
  const params = new URLSearchParams({
    __call:      'search.getResults',
    _format:     'json',
    _marker:     '0',
    api_version: '4',
    ctx:         'wap6dot0',
    n:           String(limit),
    q:           query,
  });
  const data = await apiFetch(`/api/saavn?${params}`);
  return (data?.results || []).map(normalizeSaavnTrack);
}

// ─────────────────────────────────────────────
//  AUDIO URL RESOLUTION (Step 2)
// ─────────────────────────────────────────────
const _audioCache = new Map();

/**
 * For JioSaavn tracks: call generateAuthToken → get signed CDN URL →
 * return our /api/audio proxy URL (adds correct Referer for CDN).
 */
async function resolveAudio(track) {
  if (!track.encryptedUrl) return null;
  if (_audioCache.has(track.id)) return _audioCache.get(track.id);

  // Try 320kbps, fallback to 160kbps, 96kbps
  for (const bitrate of ['320', '160', '96']) {
    try {
      const params = new URLSearchParams({
        __call:      'song.generateAuthToken',
        url:         track.encryptedUrl,
        bitrate,
        api_version: '4',
        _format:     'json',
        ctx:         'wap6dot0',
      });
      const data = await apiFetch(`/api/saavn?${params}`, 8000);
      if (data?.auth_url) {
        // Route CDN audio through our proxy so the Referer is set correctly
        const base = _activeProxyBase !== null ? _activeProxyBase : '';
        const proxied = `${base}/api/audio?url=${encodeURIComponent(data.auth_url)}`;
        _audioCache.set(track.id, proxied);
        return proxied;
      }
    } catch { /* try next bitrate */ }
  }
  return null;
}

// ─────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────

/**
 * Search for songs. Returns tracks immediately with previewUrl: null.
 * Call getAudioUrl(track) to get the playable URL before playing.
 */
async function searchSongs(query, language = 'all', limit = 20) {
  if (!query || !query.trim()) return [];

  const langHint  = LANGUAGE_HINTS[language.toLowerCase()] || '';
  const fullQuery = langHint ? `${query.trim()} ${langHint}` : query.trim();

  // ── Primary: JioSaavn via local proxy ──
  try {
    const tracks = await _saavnSearch(fullQuery, limit);
    if (tracks.length > 0) return tracks;
    if (langHint) {
      const plain = await _saavnSearch(query.trim(), limit);
      if (plain.length > 0) return plain;
    }
  } catch (err) {
    console.warn('[MusicService] JioSaavn failed, falling back to iTunes:', err.message);
  }

  // ── Fallback: iTunes CORS fetch (30s previews) ──
  try {
    const url  = `${ITUNES_BASE}/search?term=${encodeURIComponent(fullQuery)}&entity=song&limit=${limit}&media=music`;
    const data = await safeFetchItunes(url);
    return (data.results || []).map(item => ({
      id:           String(item.trackId || Math.random()),
      title:        item.trackName || 'Unknown Title',
      artist:       item.artistName || 'Unknown Artist',
      album:        item.collectionName || '',
      artworkUrl:   (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      thumbnailUrl: item.artworkUrl100 || '',
      previewUrl:   item.previewUrl || null,
      encryptedUrl: '',
      durationMs:   item.trackTimeMillis || 30000,
      genre:        item.primaryGenreName || '',
      year:         item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
      isFullSong:   false,
      saavnId:      '',
    }));
  } catch (err) {
    throw new Error('Could not reach the music service. Please check your internet connection.');
  }
}

/**
 * Get the playable audio URL for a track.
 * JioSaavn tracks → resolve signed CDN URL via proxy.
 * iTunes tracks   → return previewUrl directly.
 */
async function getAudioUrl(track) {
  if (!track) return null;
  if (!track.isFullSong || !track.encryptedUrl) return track.previewUrl || null;
  const proxied = await resolveAudio(track);
  return proxied || track.previewUrl || null;
}

/**
 * Recommendations: search by primary artist on JioSaavn.
 */
async function getRecommendations(referenceTrack, limit = 8) {
  if (!referenceTrack) return [];
  try {
    const artist = referenceTrack.artist.split(',')[0].trim();
    const tracks = await _saavnSearch(artist, limit + 3);
    return tracks.filter(t => t.id !== referenceTrack.id).slice(0, limit);
  } catch {
    return getCuratedFallbackTracks().slice(0, limit);
  }
}

/**
 * Trending: dual JioSaavn search for popular Hindi + Telugu hits.
 */
async function getTrendingSongs(country = 'in', limit = 12) {
  const terms = ['top hindi hits 2024', 'top telugu hits 2024'];
  try {
    const batches = await Promise.all(
      terms.map(t => _saavnSearch(t, Math.ceil(limit / terms.length) + 2).catch(() => []))
    );
    const seen = new Set(), tracks = [];
    for (const batch of batches) {
      for (const track of batch) {
        if (!seen.has(track.id)) { seen.add(track.id); tracks.push(track); }
        if (tracks.length >= limit) break;
      }
      if (tracks.length >= limit) break;
    }
    if (tracks.length > 0) return { tracks, isLive: false };
    throw new Error('empty');
  } catch {
    // iTunes CORS fallback
    try {
      const data = await safeFetchItunes(`${ITUNES_BASE}/search?term=top+hits+2024+india&entity=song&limit=${limit}&media=music`);
      const tracks = (data.results || []).filter(i => i.previewUrl).map(item => ({
        id:           String(item.trackId || Math.random()),
        title:        item.trackName || '',
        artist:       item.artistName || '',
        album:        item.collectionName || '',
        artworkUrl:   (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        thumbnailUrl: item.artworkUrl100 || '',
        previewUrl:   item.previewUrl || null,
        encryptedUrl: '',
        durationMs:   item.trackTimeMillis || 30000,
        genre:        item.primaryGenreName || '',
        year:         null,
        isFullSong:   false,
        saavnId:      '',
      }));
      return { tracks: tracks.slice(0, limit), isLive: false };
    } catch {
      return { tracks: getCuratedFallbackTracks(), isLive: false };
    }
  }
}

function getCuratedFallbackTracks() {
  return [
    {
      id: 'fb1',
      title: 'Kesariya',
      artist: 'Arijit Singh, Pritam',
      album: 'Brahmastra',
      artworkUrl: 'https://c.saavncdn.com/871/Brahmastra-Original-Motion-Picture-Soundtrack-Hindi-2022-20221006155213-500x500.jpg',
      thumbnailUrl: 'https://c.saavncdn.com/871/Brahmastra-Original-Motion-Picture-Soundtrack-Hindi-2022-20221006155213-150x150.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/38/4c/5c/384c5c8f-3ff8-e457-b2f7-3158ce108649/mzaf_12389299033886433185.plus.aac.p.m4a',
      encryptedUrl: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq',
      durationMs: 268000,
      genre: 'Hindi',
      year: 2022,
      isFullSong: true,
      saavnId: 'rjkrTnma',
    },
    {
      id: 'fb2',
      title: 'Naatu Naatu',
      artist: 'Rahul Sipligunj, Kaala Bhairava, M.M. Keeravaani',
      album: 'RRR',
      artworkUrl: 'https://c.saavncdn.com/683/RRR-Telugu-Telugu-2022-20250828171313-500x500.jpg',
      thumbnailUrl: 'https://c.saavncdn.com/683/RRR-Telugu-Telugu-2022-20250828171313-150x150.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/8e/dd/a4/8edda474-3fe1-3fe6-43d3-765db520a29b/mzaf_11740310005222997767.plus.aac.p.m4a',
      encryptedUrl: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyK1tSoSB+oPrTJYqQ1jcTCNgc6b6boKXKeppOEkUoiK5Fp6jyXWA3QBw7tS9a8Gtq',
      durationMs: 214000,
      genre: 'Telugu',
      year: 2022,
      isFullSong: true,
      saavnId: 'fb2_rrr',
    },
    {
      id: 'fb3',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      artworkUrl: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-500x500.jpg',
      thumbnailUrl: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-150x150.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/19/d6/60/19d660ff-e3a9-8377-15a3-ce4b28e89cac/mzaf_18422426156481158187.plus.aac.p.m4a',
      encryptedUrl: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDy8IXxuTNJ1oLbvDGDneZj5h25kdaKPCof228ruhJnw7PIr7uKBnaPmxw7tS9a8Gtq',
      durationMs: 204000,
      genre: 'Pop',
      year: 2019,
      isFullSong: true,
      saavnId: 'fb3_bl',
    },
  ];
}

// ─────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────
const musicService = { searchSongs, getAudioUrl, getRecommendations, getTrendingSongs, getCuratedFallbackTracks };
if (typeof window !== 'undefined') window.musicService = musicService;
