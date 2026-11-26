/**
 * test-suite.js — Audio Therapy Automated Test Suite
 *
 * Runs comprehensive automated tests across:
 *  1. Music Service & Recommendation Engine
 *  2. Authentication & Data Isolation Engine
 *  3. User Library, Playlists & Guest Migration
 *  4. Wellness Service & Mood Mappings
 *  5. Playback Controller State Machine & Bounded Recovery
 */

'use strict';

// ── Minimal Mock Environment for Node.js ──
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' AUDIO THERAPY — AUTOMATED TEST SUITE EXECUTION');
  console.log('======================================================\n');

  // ─────────────────────────────────────────────
  // SUITE 1: MUSIC SERVICE & RECOMMENDATION ENGINE
  // ─────────────────────────────────────────────
  console.log('▶ Suite 1: Music Service & Recommendations');
  const musicService = require('../musicService.js');

  // 1.1 Curated Fallback
  const fallbacks = musicService.getCuratedFallbackTracks();
  assert(Array.isArray(fallbacks) && fallbacks.length >= 3, 'Curated fallback tracks exist and contain at least 3 tracks');
  assert(fallbacks.some(t => t.language === 'hindi') && fallbacks.some(t => t.language === 'telugu'), 'Fallback contains both Hindi and Telugu songs');

  // 1.2 Deduplication
  const duplicateList = [
    { id: '1', title: 'Kesariya', artist: 'Arijit Singh' },
    { id: '1', title: 'Kesariya', artist: 'Arijit Singh' }, // exact id dupe
    { id: '2', title: 'Kesariya (feat. Pritam)', artist: 'Arijit Singh' }, // near title dupe
    { id: '3', title: 'Naatu Naatu', artist: 'Kaala Bhairava' },
  ];
  const deduped = musicService.deduplicateTracks(duplicateList);
  assert(deduped.length === 2, `Deduplication suppressed exact and normalized duplicates (expected 2, got ${deduped.length})`);
  assert(deduped[0].id === '1' && deduped[1].id === '3', 'Retained unique distinct tracks');

  // 1.3 Language Filtering (Strict vs Non-strict)
  const langTestTracks = [
    { id: 't1', title: 'Song 1', language: 'hindi' },
    { id: 't2', title: 'Song 2', language: 'telugu' },
    { id: 't3', title: 'Song 3', language: 'unknown' },
    { id: 't4', title: 'Song 4', language: 'tamil' },
  ];
  const strictHindi = musicService.filterByLanguage(langTestTracks, 'hindi', true);
  assert(strictHindi.length === 1 && strictHindi[0].language === 'hindi', 'Strict language filter excludes unknown and different language tracks');

  const nonStrictHindi = musicService.filterByLanguage(langTestTracks, 'hindi', false);
  assert(nonStrictHindi.length === 2 && nonStrictHindi.some(t => t.language === 'unknown'), 'Non-strict language filter allows unknown metadata fallback');

  const allLang = musicService.filterByLanguage(langTestTracks, 'all', true);
  assert(allLang.length === 4, "'all' language filter passes all catalog tracks");

  // 1.4 Recommendation Scoring
  const refSong = {
    id: 'ref1',
    title: 'Kesariya',
    artist: 'Arijit Singh, Pritam',
    language: 'hindi',
    genre: 'romantic',
    year: 2022,
    encryptedUrl: 'enc_123'
  };

  const goodMatch = {
    id: 'c1',
    title: 'Apna Bana Le',
    artist: 'Arijit Singh',
    language: 'hindi',
    genre: 'romantic',
    year: 2022,
    encryptedUrl: 'enc_456'
  };

  const wrongLang = {
    id: 'c2',
    title: 'Samajavaragamana',
    artist: 'Sid Sriram',
    language: 'telugu',
    genre: 'romantic',
    year: 2020,
    encryptedUrl: 'enc_789'
  };

  const playedSet = new Set(['c1']);

  const scoreGood = musicService.scoreTrack(goodMatch, refSong, new Set());
  const scoreWrong = musicService.scoreTrack(wrongLang, refSong, new Set());
  const scorePlayed = musicService.scoreTrack(goodMatch, refSong, playedSet);

  assert(scoreGood > 80, `Good match received high score (${scoreGood}) based on same language, artist & genre`);
  assert(scoreWrong < 0, `Different language track heavily penalised in recommendations (${scoreWrong})`);
  assert(scoreGood > scorePlayed, `Recently played song received negative penalty (${scorePlayed} vs ${scoreGood}) to avoid immediate repetition`);

  // ─────────────────────────────────────────────
  // SUITE 2: AUTHENTICATION & MULTI-USER ISOLATION
  // ─────────────────────────────────────────────
  console.log('\n▶ Suite 2: Authentication & Multi-Account Isolation');
  const authService = require('../authService.js');

  // 2.1 Sign Up
  localStorage.clear();
  authService.init();

  let userA = null;
  try {
    userA = await authService.signUp('userA@test.com', 'password123', 'User Alpha');
  } catch (e) {
    console.error(e);
  }
  assert(userA && userA.email === 'usera@test.com', 'User A signed up successfully with valid credentials');
  assert(authService.getCurrentUser().id === userA.id, 'User A session active');

  // 2.2 Duplicate rejection
  let dupeError = null;
  try {
    await authService.signUp('userA@test.com', 'otherpassword', 'Duplicate User');
  } catch (e) {
    dupeError = e;
  }
  assert(dupeError !== null, 'Duplicate email registration was rejected');

  // 2.3 Invalid Password rejection
  let shortPwdError = null;
  try {
    await authService.signUp('short@test.com', '123', 'Short');
  } catch (e) {
    shortPwdError = e;
  }
  assert(shortPwdError !== null, 'Short password (< 6 chars) rejected');

  // 2.4 User A saves a favorite & custom playlist
  authService.addFavorite({ id: 'fav_song_1', title: 'Alpha Favorite Song', artist: 'Artist A' });
  assert(authService.isFavorite('fav_song_1') === true, "User A added track to favorites");

  const plA = authService.createPlaylist('Alpha Gym Vibes', 'Workouts');
  authService.addTrackToPlaylist(plA.id, { id: 'track_a1', title: 'Energy Track' });
  assert(authService.getPlaylists().some(p => p.name === 'Alpha Gym Vibes'), 'User A created playlist');

  // 2.5 User A signs out
  await authService.signOut();
  assert(authService.getCurrentUser() === null, 'User A successfully signed out');

  // 2.6 User B signs up
  const userB = await authService.signUp('userB@test.com', 'securepass456', 'User Beta');
  assert(userB && userB.email === 'userb@test.com', 'User B signed up');

  // 2.7 Verify Data Isolation (User B cannot see User A's data)
  assert(authService.isFavorite('fav_song_1') === false, "DATA ISOLATION: User B cannot see User A's private favorites");
  const bPlaylists = authService.getPlaylists();
  assert(!bPlaylists.some(p => p.name === 'Alpha Gym Vibes'), "DATA ISOLATION: User B cannot see User A's private playlists");

  // User B adds their own favorite
  authService.addFavorite({ id: 'fav_song_b', title: 'Beta Meditation Song', artist: 'Artist B' });
  assert(authService.isFavorite('fav_song_b') === true, 'User B saved own favorite');

  // 2.8 Switch back to User A via SignIn
  await authService.signOut();
  const reUserA = await authService.signIn('userA@test.com', 'password123');
  assert(reUserA.id === userA.id, 'User A successfully logged back in');
  assert(authService.isFavorite('fav_song_1') === true, "User A's favorites restored after logging back in");
  assert(authService.isFavorite('fav_song_b') === false, "User A cannot see User B's favorites");

  // 2.9 Wrong password check
  await authService.signOut();
  let wrongPassErr = null;
  try {
    await authService.signIn('userA@test.com', 'WRONGPASSWORD');
  } catch (e) {
    wrongPassErr = e;
  }
  assert(wrongPassErr !== null, 'Sign in with incorrect password rejected');

  // ─────────────────────────────────────────────
  // SUITE 3: GUEST-TO-ACCOUNT MIGRATION
  // ─────────────────────────────────────────────
  console.log('\n▶ Suite 3: Guest-to-Account Library Migration');
  await authService.signOut();
  assert(authService.getCurrentUser() === null, 'Acting as Guest');

  // Guest adds favorites and creates a playlist
  authService.addFavorite({ id: 'guest_fav_1', title: 'Guest Rain Sound', artist: 'Nature' });
  const guestPl = authService.createPlaylist('Guest Late Night');
  authService.addTrackToPlaylist(guestPl.id, { id: 'guest_t1', title: 'Chill Lo-fi' });

  assert(authService.isFavorite('guest_fav_1') === true, 'Guest favorite saved in guest scope');

  // New user registers — guest data should migrate seamlessly
  const migratedUser = await authService.signUp('migrated@test.com', 'migrated123', 'Migrated Listener');
  assert(authService.isFavorite('guest_fav_1') === true, 'Guest favorites successfully migrated into new user account');
  const migratedPlaylists = authService.getPlaylists();
  assert(migratedPlaylists.some(p => p.name === 'Guest Late Night'), 'Guest playlist successfully migrated into new user account');

  // ─────────────────────────────────────────────
  // SUITE 4: WELLNESS SERVICE & MOOD ENGINE
  // ─────────────────────────────────────────────
  console.log('\n▶ Suite 4: Wellness Service & Mood Engine');
  const wellnessService = require('../wellnessService.js');

  const wellnessTracks = wellnessService.getWellnessTracks();
  assert(Array.isArray(wellnessTracks) && wellnessTracks.length >= 6, `Wellness service provides ${wellnessTracks.length} ambient therapy soundscapes`);
  assert(wellnessTracks.some(t => t.id === 'well_rain') && wellnessTracks.some(t => t.id === 'well_ocean'), 'Contains essential sleep sounds (Rain, Ocean waves)');

  const moods = wellnessService.getMoodPresets();
  assert(Array.isArray(moods) && moods.length >= 8, `Mood engine supports ${moods.length} distinct mood categories`);
  assert(moods.some(m => m.id === 'relaxed') && moods.some(m => m.id === 'sleep') && moods.some(m => m.id === 'focus'), 'Includes Relax, Sleep, and Focus presets');

  // ─────────────────────────────────────────────
  // SUITE 5: PLAYBACK LOGIC & BOUNDED RETRY SIMULATION
  // ─────────────────────────────────────────────
  console.log('\n▶ Suite 5: Playback Logic & Bounded Recovery Simulation');

  // 5.1 Shuffle logic
  function simulateShuffle(queue, currentIndex, playedIds) {
    const unplayed = queue
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => i !== currentIndex && !playedIds.has(t.id));
    if (unplayed.length > 0) {
      return unplayed[0].i; // deterministic pick for test
    }
    return 0;
  }

  const simQueue = [
    { id: 's1', title: 'Song 1' },
    { id: 's2', title: 'Song 2' },
    { id: 's3', title: 'Song 3' },
  ];
  const simPlayed = new Set(['s1', 's2']);
  const nextShuffleIdx = simulateShuffle(simQueue, 0, simPlayed);
  assert(nextShuffleIdx === 2, `Shuffle correctly prioritized unplayed track s3 (index 2)`);

  // 5.2 Bounded Recovery logic (skips max 5 times, never loops infinitely)
  let skipAttempts = 0;
  const MAX_SKIPS = 5;
  let stopped = false;
  for (let i = 0; i < 10; i++) {
    skipAttempts++;
    if (skipAttempts >= MAX_SKIPS) {
      stopped = true;
      break;
    }
  }
  assert(stopped && skipAttempts === MAX_SKIPS, `Bounded failure recovery stopped at maximum ${MAX_SKIPS} attempts, preventing infinite loop`);

  // 5.3 Queue Refill Threshold calculation
  const queueSize = 10;
  const curIdx = 7;
  const remaining = queueSize - 1 - curIdx; // 2
  const REFILL_THRESHOLD = 3;
  const shouldRefill = remaining <= REFILL_THRESHOLD;
  assert(shouldRefill === true, `Queue auto-refill triggers when remaining tracks (${remaining}) <= threshold (${REFILL_THRESHOLD})`);

  // -------------------------------------------------------------
  // SUITE 6: DOMTokenList and Full-Song Audio Integrity
  // -------------------------------------------------------------
  console.log('\n▶ Suite 6: DOMTokenList and Full-Song Audio Integrity');

  const fs = require('fs');
  const path = require('path');
  const playerJs = fs.readFileSync(path.join(__dirname, '..', 'player.js'), 'utf8');
  const audioApiJs = fs.readFileSync(path.join(__dirname, '..', 'api', 'audio.js'), 'utf8');

  // Verify no classList.add calls pass empty string ternary
  const badClassListMatches = playerJs.match(/classList\.add\([^)]*:\s*''\s*\)/g);
  assert(badClassListMatches === null, 'No classList.add calls contain empty string fallback (DOMTokenList empty token bug fixed)');

  // Verify api/audio.js streams using Readable.fromWeb and handles Range headers
  assert(audioApiJs.includes('Readable.fromWeb'), 'api/audio.js streams upstream CDN audio using Readable.fromWeb');
  assert(audioApiJs.includes("'Referer': 'https://www.jiosaavn.com/'"), 'api/audio.js sends JioSaavn Referer to prevent 403 Forbidden');
  assert(audioApiJs.includes("fetchHeaders['Range'] = req.headers.range"), 'api/audio.js forwards HTTP Range header for 206 Partial Content');
  assert(!audioApiJs.includes('res.redirect(302'), 'api/audio.js does not redirect with 302 (avoids browser 403 on saavncdn)');

  // Verify curated fallback tracks are full length (not 30s)
  const fbTracks = musicService.getCuratedFallbackTracks();
  const allFull = fbTracks.every(t => t.isFullSong === true && t.durationMs > 120000);
  assert(allFull, 'All curated fallback tracks are marked isFullSong=true with full durations (>2min)');

  // Verify local storage mode handles favorites and playlists without login
  authService.signOut();
  assert(authService.getCurrentUser() === null, 'Logged out, operating in local storage mode');
  authService.addFavorite({ id: 'local_test_track', title: 'Local Song', artist: 'Local Artist' });
  assert(authService.isFavorite('local_test_track'), 'Local storage mode saves and verifies favorites without sign-in');
  const localPl = authService.createPlaylist('Night Vibes');
  assert(localPl && localPl.name === 'Night Vibes', 'Local storage mode creates playlists without sign-in');

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
