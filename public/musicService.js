/**
 * musicService.js — Audio Theraphy v4.0
 *
 * Full-song playback via JioSaavn (official web API).
 * On Vercel: JioSaavn API calls go through /api/saavn (adds Referer).
 *            Audio is now a direct redirect from /api/audio — no streaming
 *            through Vercel (avoids 10s execution limit on hobby plan).
 * On dev (localhost): Uses /api/saavn and /api/audio proxy as before.
 *
 * Falls back to Apple iTunes 30-second previews when JioSaavn fails.
 *
 * Changes over v3.x:
 *  - Audio URL proxy now returns 302 redirect on Vercel → no timeout
 *  - Strict language mode excludes unknown-language tracks
 *  - Improved recommendation scoring (genre + artist + language)
 *  - Deduplication by normalised title+artist (catches near-dupes)
 *  - getQueueRefill strictly filters language
 *  - Better error categorisation
 */

'use strict';

// ─────────────────────────────────────────────
//  PROXY BASE DETECTION
// ─────────────────────────────────────────────
let _activeProxyBase = null;

function getProxyBases() {
  const list = [''];
  if (typeof window !== 'undefined') {
    const loc = window.location;
    const isLocal = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.protocol === 'file:';
    if (isLocal) {
      if (loc.port !== '5500') {
        list.push('http://localhost:5500');
        list.push('http://127.0.0.1:5500');
      }
      // Fallback to deployed Vercel proxies if local server has no /api/saavn
      list.push('https://audio-theraphy-music-player.vercel.app');
      list.push('https://audio-theraphy-music-player-satvik82.vercel.app');
    }
  }
  return list;
}

const ITUNES_BASE        = 'https://itunes.apple.com';
const REQUEST_TIMEOUT_MS = 12000;
const AUDIO_URL_TTL_MS   = 10 * 60 * 1000; // 10 minutes

// ─────────────────────────────────────────────
//  LANGUAGE CONFIGURATION
// ─────────────────────────────────────────────
const LANGUAGE_HINTS = {
  telugu:    'Telugu',
  hindi:     'Hindi',
  tamil:     'Tamil',
  malayalam: 'Malayalam',
  kannada:   'Kannada',
  punjabi:   'Punjabi',
  english:   'English',
  all:       '',
};

const SAAVN_LANG_MAP = {
  'hindi':     'hindi',
  'telugu':    'telugu',
  'tamil':     'tamil',
  'malayalam': 'malayalam',
  'kannada':   'kannada',
  'punjabi':   'punjabi',
  'english':   'english',
  'bengali':   'bengali',
  'marathi':   'marathi',
  'gujarati':  'gujarati',
  'odia':      'odia',
};

// Discovery queries per language for queue-refresh and trending
const LANG_DISCOVERY_QUERIES = {
  telugu:    ['Telugu hits 2024', 'Telugu love songs', 'Telugu popular 2024', 'Tollywood songs', 'Telugu melody 2024'],
  hindi:     ['Hindi hits 2024', 'Bollywood romantic', 'Hindi popular songs', 'Hindi latest 2024', 'Arijit Singh'],
  tamil:     ['Tamil hits 2024', 'Tamil love songs', 'Kollywood 2024', 'Tamil melody'],
  malayalam: ['Malayalam hits 2024', 'Malayalam songs', 'Malayalam melody 2024'],
  kannada:   ['Kannada hits 2024', 'Sandalwood songs 2024', 'Kannada melody'],
  punjabi:   ['Punjabi hits 2024', 'Punjabi popular', 'Punjabi songs 2024'],
  english:   ['Top English hits 2024', 'English pop songs', 'Billboard hits 2024', 'Pop hits 2024'],
  all:       ['Top hits 2024 India', 'Bollywood hits', 'Telugu hits 2024', 'Popular songs India'],
};

// Genre-related search terms to broaden recommendations
const GENRE_QUERIES = {
  romantic:    ['romantic songs', 'love songs'],
  sad:         ['sad songs', 'emotional songs', 'heart touching songs'],
  party:       ['party songs', 'dance hits', 'upbeat songs'],
  devotional:  ['devotional songs', 'bhakti songs'],
  classical:   ['classical songs', 'carnatic music'],
  folk:        ['folk songs'],
  melody:      ['melody songs', 'soft songs'],
};

// ─────────────────────────────────────────────
//  FETCH HELPERS
// ─────────────────────────────────────────────
async function apiFetch(pathAndQuery, timeoutMs = REQUEST_TIMEOUT_MS) {
  const bases = _activeProxyBase !== null
    ? [_activeProxyBase, ...getProxyBases().filter(b => b !== _activeProxyBase)]
    : getProxyBases();

  let lastError = null;

  for (const base of bases) {
    const fullUrl = `${base}${pathAndQuery}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
//  NORMALISER
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
  const rawLang = (info.language || item.language || '').toLowerCase();
  const normLang = SAAVN_LANG_MAP[rawLang] || rawLang || 'unknown';

  // Extract genre/mood from available fields
  const genre = (info.music || info.label || item.language || '').toLowerCase();

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
    language:     normLang,
    genre,
    year:         parseInt(item.year) || null,
    isFullSong:   true,
    saavnId:      item.id || '',
    provider:     'jiosaavn',
  };
}

function normalizeItunesTrack(item) {
  return {
    id:           String(item.trackId || Math.random()),
    title:        item.trackName || 'Unknown Title',
    artist:       item.artistName || 'Unknown Artist',
    album:        item.collectionName || '',
    artworkUrl:   (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
    thumbnailUrl: item.artworkUrl100 || '',
    previewUrl:   item.previewUrl || null,
    encryptedUrl: '',
    durationMs:   item.trackTimeMillis || 30000,
    language:     'unknown',
    genre:        (item.primaryGenreName || '').toLowerCase(),
    year:         item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
    isFullSong:   false,
    saavnId:      '',
    provider:     'itunes',
  };
}

// ─────────────────────────────────────────────
//  INTERNAL: JioSaavn search
// ─────────────────────────────────────────────
async function _saavnSearch(query, limit) {
  const params = new URLSearchParams({
    __call:      'search.getResults',
    _format:     'json',
    _marker:     '0',
    api_version: '4',
    ctx:         'wap6dot0',
    n:           String(Math.min(50, limit)),
    q:           query,
  });
  const data = await apiFetch(`/api/saavn?${params}`);
  return (data?.results || []).map(normalizeSaavnTrack);
}

// ─────────────────────────────────────────────
//  AUDIO URL RESOLUTION (with TTL cache)
// ─────────────────────────────────────────────
const _audioCache = new Map(); // id → { url, expiresAt }

/**
 * Resolve a playable audio URL for a JioSaavn track.
 *
 * The /api/audio endpoint on Vercel now returns a 302 redirect to the
 * signed CDN URL. The browser follows this redirect automatically.
 * On localhost the proxy streams the audio (backward compatible).
 */
async function resolveAudio(track) {
  if (!track.encryptedUrl) return null;

  // Check cache — purge if expired
  const cached = _audioCache.get(track.id);
  if (cached) {
    if (Date.now() < cached.expiresAt) return cached.url;
    _audioCache.delete(track.id);
  }

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
      const data = await apiFetch(`/api/saavn?${params}`, 10000);
      if (data?.auth_url) {
        // Build the /api/audio proxy URL — which on Vercel redirects to CDN.
        // This keeps the client code uniform across dev and prod.
        const base = _activeProxyBase !== null ? _activeProxyBase : '';
        const proxied = `${base}/api/audio?url=${encodeURIComponent(data.auth_url)}`;
        _audioCache.set(track.id, { url: proxied, expiresAt: Date.now() + AUDIO_URL_TTL_MS });
        return proxied;
      }
    } catch { /* try next bitrate */ }
  }
  return null;
}

/** Invalidate cached audio URL (call on playback error) */
function invalidateAudioCache(trackId) {
  _audioCache.delete(trackId);
}

// ─────────────────────────────────────────────
//  DEDUPLICATION HELPERS
// ─────────────────────────────────────────────
function _normaliseTitle(t) {
  return (t || '').toLowerCase()
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateTracks(tracks) {
  const seenIds = new Set();
  const seenSigs = new Set();
  return tracks.filter(t => {
    if (seenIds.has(t.id)) return false;
    seenIds.add(t.id);
    // Also deduplicate by normalised title + artist (catches near-dupes)
    const sig = `${_normaliseTitle(t.title)}|${_normaliseTitle(t.artist.split(',')[0])}`;
    if (seenSigs.has(sig)) return false;
    seenSigs.add(sig);
    return true;
  });
}

// ─────────────────────────────────────────────
//  LANGUAGE VERIFICATION
// ─────────────────────────────────────────────
/**
 * Filter tracks by language.
 * strict=true → exclude 'unknown' language tracks (used in recommendation/queue contexts)
 * strict=false → include 'unknown' tracks (used for direct search results)
 */
function filterByLanguage(tracks, langKey, strict = false) {
  if (!langKey || langKey === 'all') return tracks;
  return tracks.filter(t => {
    if (t.language === langKey) return true;
    if (!strict && t.language === 'unknown') return true;
    return false;
  });
}

// ─────────────────────────────────────────────
//  RECOMMENDATION SCORING
// ─────────────────────────────────────────────
/**
 * Score a candidate track against a reference track.
 * Higher score = better recommendation.
 */
function scoreTrack(candidate, reference, playedIds = new Set()) {
  let score = 0;

  // Language match (most important)
  if (reference.language && reference.language !== 'unknown') {
    if (candidate.language === reference.language) score += 50;
    else if (candidate.language === 'unknown') score += 5;
    else score -= 100; // wrong language is a heavy penalty
  }

  // Artist match
  const refArtist = (reference.artist || '').toLowerCase();
  const candArtist = (candidate.artist || '').toLowerCase();
  const refFirstArtist = refArtist.split(',')[0].trim();
  if (candArtist.includes(refFirstArtist) || refFirstArtist.includes(candArtist)) score += 30;
  // Partial artist name match
  const refParts = refFirstArtist.split(/\s+/).filter(p => p.length > 2);
  for (const part of refParts) {
    if (candArtist.includes(part)) { score += 10; break; }
  }

  // Genre similarity
  if (reference.genre && candidate.genre) {
    const rg = reference.genre.toLowerCase();
    const cg = candidate.genre.toLowerCase();
    if (rg === cg) score += 20;
    else if (rg.includes(cg) || cg.includes(rg)) score += 10;
  }

  // Year proximity (within 3 years → bonus)
  if (reference.year && candidate.year) {
    const diff = Math.abs(reference.year - candidate.year);
    if (diff <= 1) score += 10;
    else if (diff <= 3) score += 5;
  }

  // Penalty for recently played tracks
  if (playedIds.has(candidate.id)) score -= 40;

  // Penalty for missing audio
  if (!candidate.encryptedUrl && !candidate.previewUrl) score -= 60;

  return score;
}

// ─────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────

/**
 * Search for songs.
 * Returns tracks with previewUrl: null for JioSaavn tracks.
 * Call getAudioUrl(track) before playing.
 */
async function searchSongs(query, language = 'all', limit = 25) {
  if (!query || !query.trim()) return [];

  const langKey  = language.toLowerCase();
  const langHint = LANGUAGE_HINTS[langKey] || '';
  const fullQuery = langHint ? `${query.trim()} ${langHint}` : query.trim();

  // Primary: JioSaavn via proxy
  try {
    let tracks = await _saavnSearch(fullQuery, limit);

    // Apply language filter on results (non-strict to allow unknown-language tracks)
    if (langKey !== 'all') {
      let filtered = filterByLanguage(tracks, langKey, false);
      // If filter wiped everything, try the hint-only search
      if (filtered.length === 0 && langHint) {
        const hintOnly = await _saavnSearch(`${langHint} songs`, limit);
        filtered = filterByLanguage(hintOnly, langKey, false);
      }
      tracks = filtered.length > 0 ? filtered : tracks;
    }

    tracks = deduplicateTracks(tracks);
    if (tracks.length > 0) return tracks;
  } catch (err) {
    console.warn('[MusicService] JioSaavn failed, falling back to iTunes:', err.message);
  }

  // Fallback: iTunes (30s previews)
  try {
    const url  = `${ITUNES_BASE}/search?term=${encodeURIComponent(fullQuery)}&entity=song&limit=${limit}&media=music`;
    const data = await safeFetchItunes(url);
    const tracks = (data.results || []).map(normalizeItunesTrack);
    return deduplicateTracks(tracks);
  } catch (err) {
    throw new Error('Could not reach the music service. Please check your internet connection.');
  }
}

/**
 * Get the playable audio URL for a track.
 */
async function getAudioUrl(track) {
  if (!track) return null;
  if (!track.isFullSong || !track.encryptedUrl) return track.previewUrl || null;
  const proxied = await resolveAudio(track);
  return proxied || track.previewUrl || null;
}

/**
 * Recommendations: language-aware, genre-scored, artist-related.
 * Respects the activeLanguage parameter.
 * Uses scoring to rank candidates instead of returning them raw.
 */
async function getRecommendations(referenceTrack, language = 'all', limit = 10, playedIds = new Set()) {
  if (!referenceTrack) return [];

  const langKey  = language.toLowerCase();
  const langHint = LANGUAGE_HINTS[langKey] || '';
  const artist   = referenceTrack.artist.split(',')[0].trim();
  const genre    = referenceTrack.genre || '';

  const queries = [];

  // Priority 1: Same artist + language
  queries.push(langHint ? `${artist} ${langHint}` : artist);

  // Priority 2: Genre + language discovery
  if (genre) {
    // Try to find matching genre queries
    for (const [gKey, gTerms] of Object.entries(GENRE_QUERIES)) {
      if (genre.includes(gKey)) {
        const term = langHint ? `${langHint} ${gTerms[0]}` : gTerms[0];
        queries.push(term);
        break;
      }
    }
  }

  // Priority 3: Language discovery
  if (langKey !== 'all' && LANG_DISCOVERY_QUERIES[langKey]) {
    const pool = LANG_DISCOVERY_QUERIES[langKey];
    // Pick 2 random discovery queries
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    queries.push(...shuffled.slice(0, 2));
  }

  const rawResults = [];
  try {
    const batches = await Promise.all(
      queries.slice(0, 4).map(q => _saavnSearch(q, limit + 10).catch(() => []))
    );
    for (const batch of batches) {
      for (const t of batch) {
        // Exclude the reference track itself
        if (String(t.id) !== String(referenceTrack.id)) {
          rawResults.push(t);
        }
      }
    }
  } catch { /* swallow */ }

  let candidates = deduplicateTracks(rawResults);

  // Apply strict language filter for recommendations
  if (langKey !== 'all') {
    const strictFiltered = filterByLanguage(candidates, langKey, true); // strict=true excludes unknown
    if (strictFiltered.length >= 4) candidates = strictFiltered;
    else {
      // Fall back to non-strict if strict gives too few
      const nonStrict = filterByLanguage(candidates, langKey, false);
      candidates = nonStrict.length >= 4 ? nonStrict : candidates;
    }
  }

  // Score and sort candidates
  candidates = candidates
    .map(t => ({ track: t, score: scoreTrack(t, referenceTrack, playedIds) }))
    .sort((a, b) => b.score - a.score)
    .filter(({ score }) => score > -50) // filter out heavily penalised tracks
    .map(({ track }) => track);

  return candidates.slice(0, limit);
}

/**
 * Get tracks for queue auto-refresh.
 * Uses language-specific discovery queries with strict filtering.
 */
async function getQueueRefill(language = 'all', excludeIds = new Set(), limit = 15) {
  const langKey = language.toLowerCase();
  const queries = LANG_DISCOVERY_QUERIES[langKey] || LANG_DISCOVERY_QUERIES.all;

  const results = [];
  try {
    // Use up to 3 discovery queries for variety
    const shuffledQueries = [...queries].sort(() => Math.random() - 0.5);
    const batches = await Promise.all(
      shuffledQueries.slice(0, 3).map(q => _saavnSearch(q, limit + 5).catch(() => []))
    );
    for (const batch of batches) {
      for (const t of batch) {
        if (!excludeIds.has(t.id)) results.push(t);
      }
    }
  } catch { /* swallow */ }

  let filtered = deduplicateTracks(results);

  // Strict language filter for queue refill
  if (langKey !== 'all') {
    const strict = filterByLanguage(filtered, langKey, true);
    if (strict.length >= 4) filtered = strict;
    else {
      const nonStrict = filterByLanguage(filtered, langKey, false);
      if (nonStrict.length >= 4) filtered = nonStrict;
    }
  }

  // Shuffle for variety
  filtered = filtered.sort(() => Math.random() - 0.5);

  return filtered.slice(0, limit);
}

/**
 * Trending: language-aware, with deduplication.
 */
async function getTrendingSongs(language = 'all', limit = 12) {
  const langKey = language.toLowerCase();
  const queries = LANG_DISCOVERY_QUERIES[langKey] || LANG_DISCOVERY_QUERIES.all;

  try {
    const batches = await Promise.all(
      queries.slice(0, 2).map(q =>
        _saavnSearch(q, Math.ceil(limit / 2) + 3).catch(() => [])
      )
    );
    let tracks = [];
    for (const batch of batches) tracks.push(...batch);
    tracks = deduplicateTracks(tracks);

    if (langKey !== 'all') {
      const strict = filterByLanguage(tracks, langKey, true);
      if (strict.length >= 4) tracks = strict;
      else {
        const nonStrict = filterByLanguage(tracks, langKey, false);
        if (nonStrict.length > 0) tracks = nonStrict;
      }
    }

    if (tracks.length > 0) return { tracks: tracks.slice(0, limit), isLive: false };
    throw new Error('empty');
  } catch {
    // iTunes fallback
    try {
      const term = langKey === 'all' ? 'top hits 2024 india' :
                   langKey === 'hindi' ? 'bollywood hits 2024' :
                   langKey === 'telugu' ? 'tollywood hits 2024' :
                   `${langKey} songs 2024`;
      const data = await safeFetchItunes(
        `${ITUNES_BASE}/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}&media=music`
      );
      const tracks = (data.results || [])
        .filter(i => i.previewUrl)
        .map(normalizeItunesTrack)
        .slice(0, limit);
      return { tracks, isLive: false };
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
      previewUrl: null,
      encryptedUrl: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq',
      durationMs: 268000,
      language: 'hindi',
      genre: 'hindi',
      year: 2022,
      isFullSong: true,
      saavnId: 'rjkrTnma',
      provider: 'jiosaavn',
    },
    {
      id: 'fb2',
      title: 'Naatu Naatu',
      artist: 'Rahul Sipligunj, Kaala Bhairava, M.M. Keeravaani',
      album: 'RRR',
      artworkUrl: 'https://c.saavncdn.com/683/RRR-Telugu-Telugu-2022-20250828171313-500x500.jpg',
      thumbnailUrl: 'https://c.saavncdn.com/683/RRR-Telugu-Telugu-2022-20250828171313-150x150.jpg',
      previewUrl: null,
      encryptedUrl: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyK1tSoSB+oPrTJYqQ1jcTCNgc6b6boKXKeppOEkUoiK5Fp6jyXWA3QBw7tS9a8Gtq',
      durationMs: 214000,
      language: 'telugu',
      genre: 'telugu',
      year: 2022,
      isFullSong: true,
      saavnId: 'fb2_rrr',
      provider: 'jiosaavn',
    },
    {
      id: 'fb3',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      artworkUrl: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-500x500.jpg',
      thumbnailUrl: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-150x150.jpg',
      previewUrl: null,
      encryptedUrl: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDy8IXxuTNJ1oLbvDGDneZj5h25kdaKPCof228ruhJnw7PIr7uKBnaPmxw7tS9a8Gtq',
      durationMs: 204000,
      language: 'english',
      genre: 'pop',
      year: 2019,
      isFullSong: true,
      saavnId: 'fb3_bl',
      provider: 'jiosaavn',
    },
  ];
}

// ─────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────
const musicService = {
  searchSongs,
  getAudioUrl,
  getRecommendations,
  getTrendingSongs,
  getQueueRefill,
  getCuratedFallbackTracks,
  invalidateAudioCache,
  filterByLanguage,
  deduplicateTracks,
  scoreTrack,
};

if (typeof window !== 'undefined') window.musicService = musicService;
if (typeof module !== 'undefined' && module.exports) module.exports = musicService;
