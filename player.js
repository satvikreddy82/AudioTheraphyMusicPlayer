/**
 * player.js — Audio Therapy Music Player & Wellness Engine v4.0
 *
 * Full-stack music streaming, continuous playback, intelligent recommendations,
 * strict language filtering, user library synchronization, and audio wellness.
 */

'use strict';

// ─────────────────────────────────────────────
//  APPLICATION STATE
// ─────────────────────────────────────────────
const state = {
  currentTrack:      null,
  queue:             [],
  currentIndex:      -1,
  isPlaying:         false,
  isMuted:           false,
  volume:            0.8,
  searchQuery:       '',
  activeLanguage:    'all',
  isSeeking:         false,
  searchDebounce:    null,

  // Playback modes
  shuffle:           false,
  repeat:            'off',    // 'off' | 'one' | 'all'
  autoplay:          true,

  // Generation counter to eliminate async race conditions
  _loadGen:          0,

  // Error-skip tracking (bounded recovery)
  _skipAttempts:     0,
  MAX_SKIP_ATTEMPTS: 5,

  // Queue refill
  _isRefilling:      false,
  REFILL_THRESHOLD:  3,

  // Sleep timer
  _sleepTimerId:     null,
  _sleepFadeId:      null,

  // Active navigation
  activeTab:         'search',      // 'search' | 'wellness' | 'playlist' | 'queue'
  activeLibSubtab:   'playlists',   // 'playlists' | 'favorites' | 'history'

  // Modals
  modalMode:         'create',
  renameTargetId:    null,
  trackForPicker:    null,

  // Active playlist
  activePlaylistId:  'pl_default',

  // Session history for deduplication
  _playedIds:        new Set(),
};

// ─────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────
const audio = document.getElementById('audio-element');

// Header
const searchInput          = document.getElementById('search-input');
const searchClearBtn       = document.getElementById('search-clear-btn');
const searchSubmitBtn      = document.getElementById('search-submit-btn');
const langChips            = document.querySelectorAll('.lang-chip');
const headerQueueBtn       = document.getElementById('header-queue-btn');
const headerQueueCount     = document.getElementById('header-queue-count');
const headerPlaylistBtn    = document.getElementById('header-playlist-btn');
const headerPlaylistCount  = document.getElementById('header-playlist-count');
const headerAuthBtn        = document.getElementById('header-auth-btn');
const headerAuthLabel      = document.getElementById('header-auth-label');
const headerAuthIcon       = document.getElementById('header-auth-icon');

// Now Playing (Left Column)
const npCard               = document.getElementById('now-playing-card');
const npArtworkTrigger     = document.getElementById('np-artwork-trigger');
const npArtwork            = document.getElementById('np-artwork');
const npArtworkGlow        = document.getElementById('np-artwork-glow');
const npIdleState          = document.getElementById('np-idle-state');
const npInfo               = document.getElementById('np-info');
const npControls           = document.getElementById('np-controls');
const npTitle              = document.getElementById('np-title');
const npArtist             = document.getElementById('np-artist');
const npAlbum              = document.getElementById('np-album');
const npBadgeText          = document.getElementById('np-badge-text');
const npAudioBadge         = document.getElementById('np-audio-badge');
const npFavBtn             = document.getElementById('np-fav-btn');
const npFavIcon            = document.getElementById('np-fav-icon');
const npPlaylistBtn        = document.getElementById('np-playlist-btn');
const npPlaylistIcon       = document.getElementById('np-playlist-icon');
const npPlaylistLabel      = document.getElementById('np-playlist-label');
const npCurrentTime        = document.getElementById('np-current-time');
const npDuration           = document.getElementById('np-duration');
const npProgressCont       = document.getElementById('np-progress-bar-container');
const npProgressFill       = document.getElementById('np-progress-fill');
const npProgressThumb      = document.getElementById('np-progress-thumb');
const btnShuffle           = document.getElementById('btn-shuffle');
const btnPrev              = document.getElementById('btn-prev');
const btnPlay              = document.getElementById('btn-play');
const playIcon             = document.getElementById('play-icon');
const btnNext              = document.getElementById('btn-next');
const btnRepeat            = document.getElementById('btn-repeat');
const btnMute              = document.getElementById('btn-mute');
const volIcon              = document.getElementById('vol-icon');
const volumeSlider         = document.getElementById('volume-slider');
const btnSleepTimer        = document.getElementById('btn-sleep-timer');
const npLoading            = document.getElementById('np-loading');

// Tabs & Views
const tabSearch            = document.getElementById('tab-search');
const tabWellness          = document.getElementById('tab-wellness');
const tabPlaylist          = document.getElementById('tab-playlist');
const tabPlaylistCount     = document.getElementById('tab-playlist-count');
const tabQueue             = document.getElementById('tab-queue');
const tabQueueCount        = document.getElementById('tab-queue-count');

const searchView           = document.getElementById('search-view');
const wellnessView         = document.getElementById('wellness-view');
const playlistView         = document.getElementById('playlist-view');
const queueView            = document.getElementById('queue-view');

// Search View Elements
const resultsTitle         = document.getElementById('results-title');
const resultsSubtitle      = document.getElementById('results-subtitle');
const resultsLoading       = document.getElementById('results-loading');
const resultsNotice        = document.getElementById('results-notice');
const resultsNoticeText    = document.getElementById('results-notice-text');
const resultsGrid          = document.getElementById('results-grid');

// Wellness View Elements
const moodSelector         = document.getElementById('mood-selector');
const wellnessGrid         = document.getElementById('wellness-grid');
const noiseActiveBar       = document.getElementById('noise-active-bar');
const noiseActiveLabel     = document.getElementById('noise-active-label');
const noiseStopBtn         = document.getElementById('noise-stop-btn');
const breathingCircle      = document.getElementById('breathing-circle');
const breathingLabel       = document.getElementById('breathing-label');
const btnBreathingStart    = document.getElementById('btn-breathing-start');

// Library View Elements
const libSubtabPlaylists   = document.getElementById('lib-subtab-playlists');
const libSubtabFavorites   = document.getElementById('lib-subtab-favorites');
const libSubtabHistory     = document.getElementById('lib-subtab-history');
const libFavCount          = document.getElementById('lib-fav-count');
const libSecPlaylists      = document.getElementById('lib-section-playlists');
const libSecFavorites      = document.getElementById('lib-section-favorites');
const libSecHistory        = document.getElementById('lib-section-history');
const playlistsChips       = document.getElementById('playlists-chips');
const btnCreatePlaylist    = document.getElementById('btn-create-playlist');
const currentPlaylistTitle = document.getElementById('current-playlist-title');
const btnRenamePlaylist    = document.getElementById('btn-rename-playlist');
const playlistSubtitle     = document.getElementById('playlist-subtitle');
const btnPlaylistPlayAll   = document.getElementById('btn-playlist-play-all');
const btnPlaylistNewAction = document.getElementById('btn-playlist-new-action');
const btnPlaylistClear     = document.getElementById('btn-playlist-clear');
const btnPlaylistDelete    = document.getElementById('btn-playlist-delete');
const playlistEmpty        = document.getElementById('playlist-empty');
const btnPlaylistExplore   = document.getElementById('btn-playlist-explore');
const playlistGrid         = document.getElementById('playlist-grid');
const favoritesGrid        = document.getElementById('favorites-grid');
const btnFavPlayAll        = document.getElementById('btn-fav-play-all');
const historyGrid          = document.getElementById('history-grid');
const btnClearHistory      = document.getElementById('btn-clear-history');

// Queue View Elements
const queueSubtitle        = document.getElementById('queue-subtitle');
const btnQueueAutoplayToggle = document.getElementById('btn-queue-autoplay-toggle');
const queueAutoplayLabel   = document.getElementById('queue-autoplay-label');
const btnQueueClear        = document.getElementById('btn-queue-clear');
const queueGrid            = document.getElementById('queue-grid');

// Discovery
const recSection           = document.getElementById('recommendations-section');
const recTitle             = document.getElementById('rec-title');
const recSubtitle          = document.getElementById('rec-subtitle');
const recGrid              = document.getElementById('recommendations-grid');
const trendingSection      = document.getElementById('trending-section');
const trendingBadge        = document.getElementById('trending-badge');
const trendingLoading      = document.getElementById('trending-loading');
const trendingGrid         = document.getElementById('trending-grid');

// Fixed Bottom Player
const fixedPlayer          = document.getElementById('fixed-player');
const fpSpacer             = document.getElementById('fp-spacer');
const fpInfoClickable      = document.getElementById('fp-info-clickable');
const fpArtwork            = document.getElementById('fp-artwork');
const fpTitle              = document.getElementById('fp-title');
const fpArtist             = document.getElementById('fp-artist');
const fpFavBtn             = document.getElementById('fp-fav-btn');
const fpFavIcon            = document.getElementById('fp-fav-icon');
const fpPlaylistBtn        = document.getElementById('fp-playlist-btn');
const fpPlaylistIcon       = document.getElementById('fp-playlist-icon');
const fpShuffle            = document.getElementById('fp-shuffle');
const fpPrev               = document.getElementById('fp-prev');
const fpPlay               = document.getElementById('fp-play');
const fpPlayIcon           = document.getElementById('fp-play-icon');
const fpNext               = document.getElementById('fp-next');
const fpRepeat             = document.getElementById('fp-repeat');
const fpProgressCont       = document.getElementById('fp-progress-container');
const fpProgressFill       = document.getElementById('fp-progress-fill');
const fpCurrentTime        = document.getElementById('fp-current-time');
const fpDuration           = document.getElementById('fp-duration');
const fpMute               = document.getElementById('fp-mute');
const fpVolIcon            = document.getElementById('fp-vol-icon');
const fpVolSlider          = document.getElementById('fp-volume-slider');
const fpExpandBtn          = document.getElementById('fp-expand-btn');

// Mobile Bottom Nav
const mbNavBtns            = document.querySelectorAll('.mb-nav-btn');
const mbNavUserIcon        = document.getElementById('mb-nav-user-icon');
const mbNavUserLabel       = document.getElementById('mb-nav-user-label');

// Expanded Player Modal
const expModal             = document.getElementById('expanded-player-modal');
const expCloseBtn          = document.getElementById('exp-close-btn');
const expShareBtn          = document.getElementById('exp-share-btn');
const expHeaderAlbum       = document.getElementById('exp-header-album');
const expArtwork           = document.getElementById('exp-artwork');
const expTitle             = document.getElementById('exp-title');
const expArtist            = document.getElementById('exp-artist');
const expFavBtn            = document.getElementById('exp-fav-btn');
const expFavIcon           = document.getElementById('exp-fav-icon');
const expProgressCont      = document.getElementById('exp-progress-container');
const expProgressFill      = document.getElementById('exp-progress-fill');
const expProgressThumb     = document.getElementById('exp-progress-thumb');
const expCurrentTime       = document.getElementById('exp-current-time');
const expDuration          = document.getElementById('exp-duration');
const expShuffleBtn        = document.getElementById('exp-shuffle-btn');
const expPrevBtn           = document.getElementById('exp-prev-btn');
const expPlayBtn           = document.getElementById('exp-play-btn');
const expPlayIcon          = document.getElementById('exp-play-icon');
const expNextBtn           = document.getElementById('exp-next-btn');
const expRepeatBtn         = document.getElementById('exp-repeat-btn');
const expPlaylistBtn       = document.getElementById('exp-playlist-btn');
const expSleepBtn          = document.getElementById('exp-sleep-btn');

// Modals: Auth, Profile, Playlist, Sleep
const authModal            = document.getElementById('auth-modal');
const authModalTitle       = document.getElementById('auth-modal-title');
const authModalClose       = document.getElementById('auth-modal-close');
const authTabSignin        = document.getElementById('auth-tab-signin');
const authTabSignup        = document.getElementById('auth-tab-signup');
const authNotice           = document.getElementById('auth-notice');
const authForm             = document.getElementById('auth-form');
const authNameField        = document.getElementById('auth-name-field');
const authNameInput        = document.getElementById('auth-name-input');
const authEmailInput       = document.getElementById('auth-email-input');
const authPasswordInput    = document.getElementById('auth-password-input');
const authSubmitBtn        = document.getElementById('auth-submit-btn');

const profileModal         = document.getElementById('profile-modal');
const profileModalClose    = document.getElementById('profile-modal-close');
const profileDisplayName   = document.getElementById('profile-display-name');
const profileEmail         = document.getElementById('profile-email');
const profileEditName      = document.getElementById('profile-edit-name');
const profileLangSelect    = document.getElementById('profile-lang-select');
const btnSaveProfile       = document.getElementById('btn-save-profile');
const btnMigrateData       = document.getElementById('btn-migrate-data');
const btnProfileLogout     = document.getElementById('btn-profile-logout');
const btnDeleteAccount     = document.getElementById('btn-delete-account');

const playlistModal        = document.getElementById('playlist-modal');
const playlistModalTitle   = document.getElementById('playlist-modal-title');
const playlistNameInput    = document.getElementById('playlist-name-input');
const playlistModalHint    = document.getElementById('playlist-modal-hint');
const playlistModalClose   = document.getElementById('playlist-modal-close');
const playlistModalCancel  = document.getElementById('playlist-modal-cancel');
const playlistModalSave    = document.getElementById('playlist-modal-save');

const addToPlaylistModal   = document.getElementById('add-to-playlist-modal');
const addToPlaylistClose   = document.getElementById('add-to-playlist-close');
const modalTrackArt        = document.getElementById('modal-track-art');
const modalTrackName       = document.getElementById('modal-track-name');
const modalTrackArtist     = document.getElementById('modal-track-artist');
const modalPlaylistsList   = document.getElementById('modal-playlists-list');
const modalBtnCreateInline = document.getElementById('modal-btn-create-inline');

const sleepModal           = document.getElementById('sleep-modal');
const sleepModalClose      = document.getElementById('sleep-modal-close');
const sleepTimerStatus     = document.getElementById('sleep-timer-status');

// ─────────────────────────────────────────────
//  UTILITY FUNCTIONS
// ─────────────────────────────────────────────
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let _toastTimer = null;
function showToast(message, durationMs = 3500) {
  let toast = document.getElementById('at-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'at-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove('show');
  void toast.offsetWidth; // Trigger reflow
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), durationMs);
}

function setVisible(el, visible) {
  if (!el) return;
  if (visible) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
}

function setProgress(fillEl, percent) {
  if (!fillEl) return;
  fillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createArtworkFallback(size = 56) {
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><rect width='${size}' height='${size}' fill='%23120d1e' rx='${Math.round(size * 0.18)}'/><text x='50%25' y='50%25' fill='%237C3AED' font-size='${Math.round(size * 0.45)}' text-anchor='middle' dy='.3em'>♪</text></svg>`;
}

// ─────────────────────────────────────────────
//  TAB NAVIGATION
// ─────────────────────────────────────────────
function switchTab(tabName) {
  state.activeTab = tabName;

  // Header tab buttons
  const tabMap = { search: tabSearch, wellness: tabWellness, playlist: tabPlaylist, queue: tabQueue };
  const viewMap = { search: searchView, wellness: wellnessView, playlist: playlistView, queue: queueView };

  Object.keys(tabMap).forEach((name) => {
    const btn = tabMap[name];
    const panel = viewMap[name];
    const isActive = name === tabName;
    if (btn) {
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (panel) {
      setVisible(panel, isActive);
    }
  });

  // Mobile bottom nav buttons
  mbNavBtns.forEach((btn) => {
    const isAct = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isAct);
  });

  // Render contents when entering tab
  if (tabName === 'playlist') {
    renderLibraryView();
  } else if (tabName === 'queue') {
    renderQueueView();
  } else if (tabName === 'wellness') {
    renderWellnessView();
  }

  // Scroll to top of results section
  const resSec = document.querySelector('.results-section');
  if (resSec && window.innerWidth < 768) {
    resSec.scrollIntoView({ behavior: 'smooth' });
  }
}

// ─────────────────────────────────────────────
//  CENTRAL PLAYBACK ENGINE
// ─────────────────────────────────────────────

function prepareTrack(track, queueIndex = 0) {
  if (!track) return;
  state.currentTrack = track;
  state.currentIndex = queueIndex;
  state.isPlaying    = false;

  if (npCard) npCard.classList.add('has-track');
  setVisible(npInfo, true);
  setVisible(npControls, true);
  setVisible(npLoading, false);

  const safeArt = track.artworkUrl || track.thumbnailUrl || createArtworkFallback(300);
  if (npArtwork) npArtwork.src = safeArt;
  if (npTitle)   npTitle.textContent  = track.title;
  if (npArtist)  npArtist.textContent = track.artist;
  if (npAlbum)   npAlbum.textContent  = track.album || '';

  _setBadge(track);
  updateAllButtons();

  const dur = track.durationMs > 1000 ? track.durationMs : (track.isFullSong ? 180000 : 30000);
  if (npCurrentTime) npCurrentTime.textContent = '0:00';
  if (npDuration)    npDuration.textContent    = formatTime(Math.round(dur / 1000));
  setProgress(npProgressFill, 0);
  if (npProgressThumb) npProgressThumb.style.left = '0%';

  if (fpArtwork)     fpArtwork.src = track.thumbnailUrl || safeArt;
  if (fpTitle)       fpTitle.textContent  = track.title;
  if (fpArtist)      fpArtist.textContent = track.artist;
  if (fpCurrentTime) fpCurrentTime.textContent = '0:00';
  if (fpDuration)    fpDuration.textContent    = formatTime(Math.round(dur / 1000));
  setProgress(fpProgressFill, 0);

  updateExpandedPlayerUI(track);
  showFixedPlayer(true);
  updateMediaSession(track);
  _enableNavButtons();
}

function _setBadge(track) {
  if (!npBadgeText) return;
  if (track.category === 'nature' || track.provider === 'ambient') {
    npBadgeText.textContent = 'Audio Therapy';
    if (npAudioBadge) {
      npAudioBadge.style.background = 'rgba(167, 139, 250, 0.15)';
      npAudioBadge.style.borderColor = 'rgba(167, 139, 250, 0.3)';
      npAudioBadge.style.color = '#c4b5fd';
    }
  } else if (track.isFullSong) {
    npBadgeText.textContent = 'Full Song · 320kbps';
    if (npAudioBadge) {
      npAudioBadge.style.background = 'rgba(34,197,94,0.12)';
      npAudioBadge.style.borderColor = 'rgba(34,197,94,0.25)';
      npAudioBadge.style.color = '#4ade80';
    }
  } else {
    npBadgeText.textContent = '30s Preview';
    if (npAudioBadge) {
      npAudioBadge.style.background = '';
      npAudioBadge.style.borderColor = '';
      npAudioBadge.style.color = '';
    }
  }
}

function _enableNavButtons() {
  [btnPrev, btnNext, fpPrev, fpNext, expPrevBtn, expNextBtn].forEach((btn) => {
    if (btn) btn.disabled = false;
  });
}

/**
 * Main function to load and play a track
 */
function loadTrack(track, queueIndex = -1) {
  if (!track) return;

  const gen = ++state._loadGen;
  state._skipAttempts = 0;

  state.currentTrack = track;
  state.currentIndex = queueIndex;
  state.isPlaying    = false;

  state._playedIds.add(track.id);

  if (npCard) npCard.classList.add('has-track');
  setVisible(npInfo, true);
  setVisible(npControls, true);
  setVisible(npLoading, true);

  const safeArt = track.artworkUrl || track.thumbnailUrl || createArtworkFallback(300);
  if (npArtwork) npArtwork.src = safeArt;
  if (npTitle)   npTitle.textContent  = track.title;
  if (npArtist)  npArtist.textContent = track.artist;
  if (npAlbum)   npAlbum.textContent  = track.album || '';

  _setBadge(track);
  updateAllButtons();

  const dur = track.durationMs > 1000 ? track.durationMs : (track.isFullSong ? 180000 : 30000);
  if (npCurrentTime) npCurrentTime.textContent = '0:00';
  if (npDuration)    npDuration.textContent    = formatTime(Math.round(dur / 1000));
  setProgress(npProgressFill, 0);
  if (npProgressThumb) npProgressThumb.style.left = '0%';

  if (fpArtwork)     fpArtwork.src = track.thumbnailUrl || safeArt;
  if (fpTitle)       fpTitle.textContent  = track.title;
  if (fpArtist)      fpArtist.textContent = track.artist;
  if (fpCurrentTime) fpCurrentTime.textContent = '0:00';
  if (fpDuration)    fpDuration.textContent    = formatTime(Math.round(dur / 1000));
  setProgress(fpProgressFill, 0);

  updateExpandedPlayerUI(track);
  showFixedPlayer(true);

  // Save to listening history in authService
  if (window.authService) {
    authService.addToHistory(track);
  }

  document.title = `${track.title} · ${track.artist} — Audio Therapy`;

  // Highlight active card in lists
  document.querySelectorAll('.song-card').forEach((c) => {
    c.classList.remove('active', 'playing');
    if (String(c.dataset.trackId) === String(track.id)) c.classList.add('active');
  });

  updateMediaSession(track);
  _enableNavButtons();
  updateQueueCounts();

  // Scroll to NP card on mobile
  if (window.innerWidth < 768 && npCard) {
    setTimeout(() => {
      npCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
  }

  // Pre-load recommendations
  loadRecommendations(track);

  // Auto-refill queue if low
  _maybeRefillQueue();

  // Start resolving audio stream
  _startAudioLoad(track, gen);
}

/**
 * Asynchronously resolve audio URL and start playback with generation guard
 */
async function _startAudioLoad(track, gen) {
  if (gen !== state._loadGen) return;

  try {
    let audioUrl = track.previewUrl;
    if (!audioUrl && window.musicService) {
      audioUrl = await musicService.getAudioUrl(track);
    }

    if (gen !== state._loadGen) return;

    if (!audioUrl) {
      setVisible(npLoading, false);
      showToast(`"${track.title}" is currently unavailable. Trying next song…`);
      setPlayState(false);
      _onPlaybackFailed(track, gen, 'no_url');
      return;
    }

    track.previewUrl = audioUrl;

    // Reset audio element cleanly
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    audio.src = audioUrl;
    audio.volume = state.isMuted ? 0 : state.volume;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (gen !== state._loadGen) return;
          setVisible(npLoading, false);
          setPlayState(true);
        })
        .catch((err) => {
          if (gen !== state._loadGen) return;
          setVisible(npLoading, false);
          if (err.name === 'NotAllowedError') {
            showToast('Tap ▶ to start audio playback.');
            setPlayState(false);
          } else if (err.name === 'AbortError') {
            // Interrupted by another track selection
          } else {
            showToast(`Could not play "${track.title}". Trying next…`);
            setPlayState(false);
            _onPlaybackFailed(track, gen, err.name);
          }
        });
    }
  } catch (err) {
    if (gen !== state._loadGen) return;
    setVisible(npLoading, false);
    if (window.musicService) {
      musicService.invalidateAudioCache(track.id);
    }
    showToast(`Playback error for "${track.title}". Trying next…`);
    setPlayState(false);
    _onPlaybackFailed(track, gen, 'network');
  }
}

/**
 * Handle playback failure gracefully with bounded recovery
 */
function _onPlaybackFailed(track, gen, reason) {
  if (gen !== state._loadGen) return;
  state._skipAttempts++;
  if (state._skipAttempts >= state.MAX_SKIP_ATTEMPTS) {
    showToast('Multiple songs unavailable. Please check your connection or try another search.');
    state._skipAttempts = 0;
    return;
  }
  setTimeout(() => {
    if (gen !== state._loadGen) return;
    if (state.queue.length > 1) {
      _advanceToNext(true);
    }
  }, 1400);
}

function setPlayState(playing) {
  state.isPlaying = playing;
  const iconClass = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';

  [playIcon, fpPlayIcon, expPlayIcon].forEach((icon) => {
    if (icon) icon.className = iconClass;
  });

  [btnPlay, fpPlay, expPlayBtn].forEach((btn) => {
    if (btn) btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  });

  document.querySelectorAll('.song-card').forEach((c) => {
    if (state.currentTrack && String(c.dataset.trackId) === String(state.currentTrack.id)) {
      c.classList.toggle('playing', playing);
    }
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
}

function togglePlayPause() {
  if (!state.currentTrack) {
    if (state.queue.length > 0) {
      loadTrack(state.queue[0], 0);
      return;
    }
    const cur = (window.musicService && musicService.getCuratedFallbackTracks()[0]) || null;
    if (cur) {
      state.queue = musicService.getCuratedFallbackTracks();
      loadTrack(cur, 0);
    }
    return;
  }

  if (audio.paused) {
    if (!audio.src || audio.src === window.location.href) {
      setVisible(npLoading, true);
      _startAudioLoad(state.currentTrack, state._loadGen);
      return;
    }
    audio
      .play()
      .then(() => setPlayState(true))
      .catch(() => {
        setVisible(npLoading, true);
        _startAudioLoad(state.currentTrack, state._loadGen);
      });
  } else {
    audio.pause();
    setPlayState(false);
  }
}

function _getNextIndex(skipMode = false) {
  if (state.queue.length === 0) return -1;
  if (state.repeat === 'one' && !skipMode) return state.currentIndex;
  if (state.shuffle) return getShuffledIndex();

  let idx = state.currentIndex + 1;
  if (idx >= state.queue.length) {
    if (state.repeat === 'all') return 0;
    return -1;
  }
  return idx;
}

function _getPrevIndex() {
  if (state.queue.length === 0) return -1;
  if (state.shuffle) return getShuffledIndex();
  let idx = state.currentIndex - 1;
  if (idx < 0) return state.repeat === 'all' ? state.queue.length - 1 : 0;
  return idx;
}

function _advanceToNext(skipMode = false) {
  if (state.queue.length === 0) return;
  const idx = _getNextIndex(skipMode);
  if (idx === -1) {
    if (state.autoplay) {
      showToast('End of queue. Loading more matching songs…');
      _refillQueueAndContinue();
    } else {
      showToast('End of queue reached.');
    }
    return;
  }
  loadTrack(state.queue[idx], idx);
}

function playPrevious() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const idx = _getPrevIndex();
  if (idx >= 0) loadTrack(state.queue[idx], idx);
}

function playNext() {
  _advanceToNext(true);
}

// ─────────────────────────────────────────────
//  QUEUE AUTO-REFILL
// ─────────────────────────────────────────────
async function _maybeRefillQueue() {
  if (state._isRefilling || !state.autoplay) return;
  const remaining = state.queue.length - 1 - state.currentIndex;
  if (remaining > state.REFILL_THRESHOLD) return;

  state._isRefilling = true;
  try {
    const existingIds = new Set(state.queue.map((t) => t.id));
    const newTracks = await musicService.getQueueRefill(state.activeLanguage, existingIds, 12);
    if (newTracks.length > 0) {
      state.queue.push(...newTracks);
      updateQueueCounts();
      if (state.activeTab === 'queue') renderQueueView();
    }
  } catch (e) {
  } finally {
    state._isRefilling = false;
  }
}

async function _refillQueueAndContinue() {
  try {
    const existingIds = new Set(state.queue.map((t) => t.id));
    const newTracks = await musicService.getQueueRefill(state.activeLanguage, existingIds, 15);
    if (newTracks.length > 0) {
      state.queue.push(...newTracks);
      updateQueueCounts();
      const idx = state.queue.length - newTracks.length;
      loadTrack(state.queue[idx], idx);
    } else {
      showToast('No more tracks available for this language.');
    }
  } catch (e) {
    showToast('Could not load more songs. Check connection.');
  }
}

function updateQueueCounts() {
  const count = state.queue.length;
  if (headerQueueCount) headerQueueCount.textContent = count;
  if (tabQueueCount) tabQueueCount.textContent = count;
  if (queueSubtitle) {
    queueSubtitle.textContent = count === 1 ? '1 song in queue.' : `${count} songs in queue.`;
  }
}

// ─────────────────────────────────────────────
//  PROGRESS & SEEK
// ─────────────────────────────────────────────
function updateProgress() {
  if (!audio.duration || state.isSeeking) return;
  const pct = (audio.currentTime / audio.duration) * 100;

  setProgress(npProgressFill, pct);
  if (npProgressThumb) npProgressThumb.style.left = `${pct}%`;

  setProgress(fpProgressFill, pct);

  setProgress(expProgressFill, pct);
  if (expProgressThumb) expProgressThumb.style.left = `${pct}%`;

  const curStr = formatTime(audio.currentTime);
  if (npCurrentTime) npCurrentTime.textContent = curStr;
  if (fpCurrentTime) fpCurrentTime.textContent = curStr;
  if (expCurrentTime) expCurrentTime.textContent = curStr;

  if (npProgressCont) npProgressCont.setAttribute('aria-valuenow', Math.round(pct));
  if (fpProgressCont) fpProgressCont.setAttribute('aria-valuenow', Math.round(pct));
  if (expProgressCont) expProgressCont.setAttribute('aria-valuenow', Math.round(pct));

  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && audio.duration) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    } catch (e) {}
  }
}

function seekFromEvent(e, container) {
  if (!container || !audio.duration) return;
  const rect = container.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const x = clamp(clientX - rect.left, 0, rect.width);
  const pct = x / rect.width;
  audio.currentTime = pct * audio.duration;
  updateProgress();
}

function attachSeekEvents(container) {
  if (!container) return;
  let dragging = false;

  container.addEventListener('mousedown', (e) => {
    dragging = true;
    state.isSeeking = true;
    seekFromEvent(e, container);
  });
  document.addEventListener('mousemove', (e) => {
    if (dragging) seekFromEvent(e, container);
  });
  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      state.isSeeking = false;
    }
  });

  container.addEventListener(
    'touchstart',
    (e) => {
      state.isSeeking = true;
      seekFromEvent(e, container);
    },
    { passive: true }
  );
  container.addEventListener(
    'touchmove',
    (e) => {
      seekFromEvent(e, container);
    },
    { passive: true }
  );
  container.addEventListener('touchend', () => {
    state.isSeeking = false;
  });

  container.addEventListener('keydown', (e) => {
    if (!audio.duration) return;
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });
}

// ─────────────────────────────────────────────
//  VOLUME & MUTE
// ─────────────────────────────────────────────
function applyVolume(value) {
  state.volume = clamp(value, 0, 1);
  audio.volume = state.isMuted ? 0 : state.volume;
  const pct = state.volume * 100;
  if (volumeSlider) {
    volumeSlider.value = pct;
    volumeSlider.style.background = `linear-gradient(to right, #7C3AED ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  }
  if (fpVolSlider) {
    fpVolSlider.value = pct;
    fpVolSlider.style.background = `linear-gradient(to right, #7C3AED ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  }
  try {
    localStorage.setItem('at_volume', String(state.volume));
  } catch (e) {}
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  audio.volume = state.isMuted ? 0 : state.volume;
  const icon = state.isMuted ? 'fa-volume-xmark' : state.volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high';
  if (volIcon) volIcon.className = `fa-solid ${icon}`;
  if (fpVolIcon) fpVolIcon.className = `fa-solid ${icon}`;
}

// ─────────────────────────────────────────────
//  SHUFFLE & REPEAT
// ─────────────────────────────────────────────
function getShuffledIndex() {
  if (state.queue.length <= 1) return 0;
  const unplayed = state.queue
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => i !== state.currentIndex && !state._playedIds.has(t.id));

  if (unplayed.length > 0) {
    return unplayed[Math.floor(Math.random() * unplayed.length)].i;
  }
  state._playedIds.clear();
  let idx;
  do {
    idx = Math.floor(Math.random() * state.queue.length);
  } while (idx === state.currentIndex && state.queue.length > 1);
  return idx;
}

function updateShuffleUI() {
  [btnShuffle, fpShuffle, expShuffleBtn].forEach((btn) => {
    if (btn) {
      btn.classList.toggle('active', state.shuffle);
      btn.title = state.shuffle ? 'Shuffle: On' : 'Shuffle: Off';
      btn.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
    }
  });
}

function updateRepeatUI() {
  [btnRepeat, fpRepeat, expRepeatBtn].forEach((btn) => {
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (state.repeat === 'one') {
      if (icon) icon.className = 'fa-solid fa-repeat-1';
      btn.classList.add('active');
      btn.title = 'Repeat: One Track';
    } else if (state.repeat === 'all') {
      if (icon) icon.className = 'fa-solid fa-repeat';
      btn.classList.add('active');
      btn.title = 'Repeat: All Queue';
    } else {
      if (icon) icon.className = 'fa-solid fa-repeat';
      btn.classList.remove('active');
      btn.title = 'Repeat: Off';
    }
    btn.setAttribute('aria-pressed', state.repeat !== 'off' ? 'true' : 'false');
  });
}

// ─────────────────────────────────────────────
//  EXPANDED FULL-SCREEN PLAYER
// ─────────────────────────────────────────────
function openExpandedPlayer() {
  if (!expModal) return;
  expModal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  if (state.currentTrack) {
    updateExpandedPlayerUI(state.currentTrack);
  }
}

function closeExpandedPlayer() {
  if (!expModal) return;
  expModal.setAttribute('hidden', '');
  document.body.style.overflow = '';
}

function updateExpandedPlayerUI(track) {
  if (!track || !expModal) return;
  const art = track.artworkUrl || track.thumbnailUrl || createArtworkFallback(400);
  if (expArtwork) expArtwork.src = art;
  if (expTitle) expTitle.textContent = track.title;
  if (expArtist) expArtist.textContent = track.artist;
  if (expHeaderAlbum) expHeaderAlbum.textContent = track.album || 'Audio Therapy';

  const isFav = window.authService ? authService.isFavorite(track.id) : false;
  if (expFavBtn) {
    expFavBtn.classList.toggle('active', isFav);
    if (expFavIcon) expFavIcon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  }

  const bgBlur = document.getElementById('exp-bg-blur');
  if (bgBlur) bgBlur.style.backgroundImage = `url('${art}')`;
}

// ─────────────────────────────────────────────
//  FAVORITES & PLAYLISTS MANAGEMENT
// ─────────────────────────────────────────────
function updateAllButtons() {
  const current = state.currentTrack;
  const isFav = current && window.authService ? authService.isFavorite(current.id) : false;

  [npFavBtn, fpFavBtn, expFavBtn].forEach((btn) => {
    if (btn) btn.classList.toggle('active', isFav);
  });
  [npFavIcon, fpFavIcon, expFavIcon].forEach((icon) => {
    if (icon) icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  });

  // Playlist count badges
  if (window.authService) {
    const playlists = authService.getPlaylists();
    const favs = authService.getFavorites();
    const totalCount = playlists.reduce((acc, p) => acc + p.tracks.length, 0);

    if (headerPlaylistCount) headerPlaylistCount.textContent = totalCount;
    if (tabPlaylistCount) tabPlaylistCount.textContent = totalCount;
    if (libFavCount) libFavCount.textContent = favs.length;
  }
}

function toggleCurrentTrackFavorite() {
  if (!state.currentTrack) return;
  if (!window.authService) return;

  const added = authService.toggleFavorite(state.currentTrack);
  updateAllButtons();
  showToast(added ? `Added "${state.currentTrack.title}" to Favorites` : `Removed from Favorites`);
  if (state.activeTab === 'playlist' && state.activeLibSubtab === 'favorites') {
    renderFavoritesView();
  }
}

// ─────────────────────────────────────────────
//  LIBRARY VIEW (Playlists / Favorites / History)
// ─────────────────────────────────────────────
function renderLibraryView() {
  renderPlaylistsBar();
  const playlists = window.authService ? authService.getPlaylists() : [];
  const activePl = playlists.find((p) => p.id === state.activePlaylistId) || playlists[0];

  if (currentPlaylistTitle && activePl) currentPlaylistTitle.textContent = activePl.name;
  if (playlistSubtitle && activePl) {
    playlistSubtitle.textContent =
      activePl.tracks.length === 1 ? '1 song in this playlist.' : `${activePl.tracks.length} songs in this playlist.`;
  }

  if (activePl && activePl.tracks.length > 0) {
    setVisible(playlistEmpty, false);
    renderSongCards(activePl.tracks, playlistGrid, true);
  } else {
    setVisible(playlistEmpty, true);
    if (playlistGrid) playlistGrid.innerHTML = '';
  }

  updateAllButtons();
}

function renderPlaylistsBar() {
  if (!playlistsChips || !window.authService) return;
  playlistsChips.innerHTML = '';
  const playlists = authService.getPlaylists();

  playlists.forEach((pl) => {
    const chip = document.createElement('button');
    const isActive = pl.id === state.activePlaylistId;
    chip.className = `playlist-chip ${isActive ? 'active' : ''}`;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', isActive ? 'true' : 'false');
    chip.innerHTML = `<span>${escapeHtml(pl.name)}</span><span class="playlist-chip-count">${pl.tracks.length}</span>`;
    chip.addEventListener('click', () => {
      state.activePlaylistId = pl.id;
      renderLibraryView();
    });
    playlistsChips.appendChild(chip);
  });
}

function renderFavoritesView() {
  if (!favoritesGrid || !window.authService) return;
  const favs = authService.getFavorites();
  if (favs.length === 0) {
    favoritesGrid.innerHTML = `
      <div class="playlist-empty-state">
        <div class="playlist-empty-icon"><i class="fa-solid fa-heart" style="color: #f43f5e;"></i></div>
        <h3 class="playlist-empty-title">No Favorites Yet</h3>
        <p class="playlist-empty-sub">Click the heart icon on any track to save it here!</p>
      </div>`;
    return;
  }
  renderSongCards(favs, favoritesGrid);
}

function renderHistoryView() {
  if (!historyGrid || !window.authService) return;
  const history = authService.getHistory();
  if (history.length === 0) {
    historyGrid.innerHTML = `
      <div class="playlist-empty-state">
        <div class="playlist-empty-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
        <h3 class="playlist-empty-title">Listening History Empty</h3>
        <p class="playlist-empty-sub">Songs you listen to will automatically appear here.</p>
      </div>`;
    return;
  }
  renderSongCards(history, historyGrid);
}

// ─────────────────────────────────────────────
//  QUEUE VIEW
// ─────────────────────────────────────────────
function renderQueueView() {
  if (!queueGrid) return;
  queueGrid.innerHTML = '';
  updateQueueCounts();

  if (state.queue.length === 0) {
    queueGrid.innerHTML = `
      <div class="playlist-empty-state">
        <div class="playlist-empty-icon"><i class="fa-solid fa-list-ul"></i></div>
        <h3 class="playlist-empty-title">Queue is Empty</h3>
        <p class="playlist-empty-sub">Search for music or select an Audio Therapy session to start listening!</p>
      </div>`;
    return;
  }

  state.queue.forEach((track, idx) => {
    const isCurrent = idx === state.currentIndex;
    const card = document.createElement('div');
    card.className = `song-card ${isCurrent ? 'active playing' : ''}`;
    card.setAttribute('role', 'listitem');

    const durationSec = track.durationMs > 1000 ? Math.round(track.durationMs / 1000) : (track.isFullSong ? 180 : 30);
    const safeArt = track.thumbnailUrl || track.artworkUrl || createArtworkFallback(48);

    card.innerHTML = `
      <img src="${safeArt}" alt="" class="song-card-art" loading="lazy" />
      <div class="song-card-meta">
        <div class="song-card-title">${isCurrent ? '▶ ' : ''}${escapeHtml(track.title)}</div>
        <div class="song-card-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="song-card-actions">
        <span class="song-card-duration">${formatTime(durationSec)}</span>
        <button class="song-card-remove-btn" title="Remove from queue" aria-label="Remove from queue">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.song-card-remove-btn')) return;
      loadTrack(track, idx);
    });

    const rmBtn = card.querySelector('.song-card-remove-btn');
    if (rmBtn) {
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.queue.splice(idx, 1);
        if (state.currentIndex > idx) state.currentIndex--;
        else if (state.currentIndex === idx && state.queue.length > 0) {
          loadTrack(state.queue[Math.min(idx, state.queue.length - 1)], Math.min(idx, state.queue.length - 1));
        }
        renderQueueView();
      });
    }

    queueGrid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  WELLNESS VIEW
// ─────────────────────────────────────────────
function renderWellnessView() {
  if (!moodSelector || !wellnessGrid || !window.wellnessService) return;

  // Render Mood buttons
  moodSelector.innerHTML = '';
  const moods = wellnessService.getMoodPresets();
  moods.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'mood-btn';
    btn.dataset.mood = m.id;
    btn.innerHTML = `<span class="mood-emoji">${m.emoji}</span><span>${escapeHtml(m.label)}</span>`;
    btn.title = m.description;
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.mood-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Discovering ${m.label} music…`);
      switchTab('search');
      if (searchInput) searchInput.value = m.label;
      performSearch(m.query);
    });
    moodSelector.appendChild(btn);
  });

  // Render Ambient soundscape cards
  wellnessGrid.innerHTML = '';
  const tracks = wellnessService.getWellnessTracks();
  tracks.forEach((t) => {
    const card = document.createElement('button');
    card.className = 'wellness-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="wellness-card-icon"><i class="fa-solid fa-spa"></i></div>
      <div class="wellness-card-info">
        <div class="wellness-card-name">${escapeHtml(t.title)}</div>
        <div class="wellness-card-desc">${escapeHtml(t.description || t.album)}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      // Put sound into queue and play immediately
      const existingIdx = state.queue.findIndex((item) => String(item.id) === String(t.id));
      if (existingIdx >= 0) {
        loadTrack(state.queue[existingIdx], existingIdx);
      } else {
        state.queue.unshift(t);
        loadTrack(t, 0);
      }
      showToast(`Playing "${t.title}"`);
    });
    wellnessGrid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  BREATHING EXERCISE (4-7-8 Technique)
// ─────────────────────────────────────────────
let _breathingTimer = null;
let _isBreathingActive = false;

function toggleBreathing() {
  if (_isBreathingActive) {
    stopBreathing();
  } else {
    startBreathing();
  }
}

function startBreathing() {
  _isBreathingActive = true;
  if (btnBreathingStart) {
    btnBreathingStart.innerHTML = '<i class="fa-solid fa-stop" aria-hidden="true"></i><span>Stop Exercise</span>';
  }

  const phases = [
    { name: 'Inhale...', className: 'inhale', duration: 4000 },
    { name: 'Hold...', className: 'hold', duration: 7000 },
    { name: 'Exhale...', className: 'exhale', duration: 8000 },
  ];

  let currentPhase = 0;

  function step() {
    if (!_isBreathingActive) return;
    const p = phases[currentPhase];
    if (breathingCircle) {
      breathingCircle.classList.remove('inhale', 'hold', 'exhale');
      void breathingCircle.offsetWidth; // Reflow
      breathingCircle.classList.add(p.className);
    }
    if (breathingLabel) breathingLabel.textContent = p.name;

    currentPhase = (currentPhase + 1) % phases.length;
    _breathingTimer = setTimeout(step, p.duration);
  }

  step();
}

function stopBreathing() {
  _isBreathingActive = false;
  clearTimeout(_breathingTimer);
  if (breathingCircle) {
    breathingCircle.classList.remove('inhale', 'hold', 'exhale');
  }
  if (breathingLabel) breathingLabel.textContent = 'Tap to begin';
  if (btnBreathingStart) {
    btnBreathingStart.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i><span>Start Exercise</span>';
  }
}

// ─────────────────────────────────────────────
//  SYNTHESIZED NOISE GENERATOR
// ─────────────────────────────────────────────
function initNoiseGenerator() {
  const noiseBtns = document.querySelectorAll('.noise-btn');
  noiseBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.noise;
      const wasActive = btn.classList.contains('active');
      noiseBtns.forEach((b) => b.classList.remove('active'));

      if (wasActive) {
        wellnessService.stopSynthesizedNoise();
        setVisible(noiseActiveBar, false);
      } else {
        btn.classList.add('active');
        wellnessService.playSynthesizedNoise(type, state.volume);
        if (noiseActiveLabel) noiseActiveLabel.textContent = `Playing pure ${type} noise frequency`;
        setVisible(noiseActiveBar, true);
      }
    });
  });

  if (noiseStopBtn) {
    noiseStopBtn.addEventListener('click', () => {
      wellnessService.stopSynthesizedNoise();
      noiseBtns.forEach((b) => b.classList.remove('active'));
      setVisible(noiseActiveBar, false);
    });
  }
}

// ─────────────────────────────────────────────
//  SLEEP TIMER WITH EXPONENTIAL FADE-OUT
// ─────────────────────────────────────────────
function setSleepTimer(minutes) {
  clearSleepTimer();
  if (!minutes || minutes <= 0) {
    showToast('Sleep timer cancelled.');
    updateSleepTimerUI(0);
    return;
  }
  const ms = minutes * 60 * 1000;
  state._sleepTimerId = setTimeout(() => {
    // 5-second gentle exponential fade-out
    let curVol = audio.volume;
    const fadeSteps = 50;
    const stepInterval = 100;
    const decrement = curVol / fadeSteps;

    state._sleepFadeId = setInterval(() => {
      curVol -= decrement;
      if (curVol <= 0.01) {
        audio.volume = 0;
        audio.pause();
        setPlayState(false);
        clearInterval(state._sleepFadeId);
        clearSleepTimer();
        showToast('Sleep timer finished. Goodnight 🌙');
      } else {
        audio.volume = curVol;
      }
    }, stepInterval);
  }, ms);

  showToast(`Sleep timer set for ${minutes} min.`);
  updateSleepTimerUI(minutes);
}

function clearSleepTimer() {
  if (state._sleepTimerId) {
    clearTimeout(state._sleepTimerId);
    state._sleepTimerId = null;
  }
  if (state._sleepFadeId) {
    clearInterval(state._sleepFadeId);
    state._sleepFadeId = null;
  }
}

function updateSleepTimerUI(minutes = 0) {
  if (sleepTimerStatus) {
    sleepTimerStatus.textContent = minutes > 0 ? `Active: ${minutes} min remaining` : 'No timer active';
  }
  [btnSleepTimer, expSleepBtn].forEach((btn) => {
    if (btn) {
      btn.classList.toggle('active', minutes > 0);
      btn.title = minutes > 0 ? `Sleep timer: ${minutes}m (click to cancel)` : 'Set sleep timer';
    }
  });
}

// ─────────────────────────────────────────────
//  SONG CARD RENDERING
// ─────────────────────────────────────────────
function renderSongCards(tracks, container, isPlaylistView = false) {
  if (!container) return;
  container.innerHTML = '';
  tracks.forEach((track, idx) => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.setAttribute('role', 'listitem');
    card.dataset.trackId = track.id;
    card.tabIndex = 0;

    if (state.currentTrack && String(state.currentTrack.id) === String(track.id)) {
      card.classList.add('active');
      if (state.isPlaying) card.classList.add('playing');
    }

    const durationSec = track.durationMs > 1000 ? Math.round(track.durationMs / 1000) : (track.isFullSong ? 180 : 30);
    const durationStr = formatTime(durationSec);
    const isFav = window.authService ? authService.isFavorite(track.id) : false;
    const safeArt = track.thumbnailUrl || track.artworkUrl || createArtworkFallback(56);

    const langBadge =
      track.language && track.language !== 'unknown' && track.language !== 'all'
        ? `<span class="song-card-lang">${escapeHtml(track.language.toUpperCase())}</span>`
        : '';

    card.innerHTML = `
      <img src="${safeArt}" alt="" class="song-card-art" loading="lazy"/>
      <div class="song-card-meta">
        <div class="song-card-title">${escapeHtml(track.title)}</div>
        <div class="song-card-artist">${escapeHtml(track.artist)}</div>
        <div class="song-card-album">${escapeHtml(track.album || '')}</div>
      </div>
      <div class="song-card-actions">
        ${langBadge}
        <span class="song-card-duration">${durationStr}</span>
        <button class="song-card-fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Remove Favorite' : 'Add to Favorites'}">
          <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        </button>
        <button class="song-card-playlist-btn" title="Add to Playlist">
          <i class="fa-regular fa-bookmark"></i>
        </button>
        <button class="song-card-play-btn" aria-label="Play ${escapeHtml(track.title)}">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    `;

    // Click card to play
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (isPlaylistView) {
        state.queue = [...tracks];
      } else {
        const qIdx = state.queue.findIndex((t) => String(t.id) === String(track.id));
        if (qIdx === -1) state.queue.push(track);
      }
      const playIdx = state.queue.findIndex((t) => String(t.id) === String(track.id));
      loadTrack(track, playIdx >= 0 ? playIdx : 0);
    });

    // Favorite button
    const favBtn = card.querySelector('.song-card-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.authService) {
          const added = authService.toggleFavorite(track);
          favBtn.classList.toggle('active', added);
          const icon = favBtn.querySelector('i');
          if (icon) icon.className = added ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
          updateAllButtons();
          showToast(added ? `Added "${track.title}" to Favorites` : 'Removed from Favorites');
        }
      });
    }

    // Playlist picker button
    const plBtn = card.querySelector('.song-card-playlist-btn');
    if (plBtn) {
      plBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      });
    }

    // Direct play button
    const playBtn = card.querySelector('.song-card-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.queue.unshift(track);
        loadTrack(track, 0);
      });
    }

    container.appendChild(card);
  });
}

function renderDiscoveryCards(tracks, container) {
  if (!container) return;
  container.innerHTML = '';
  tracks.forEach((track) => {
    const card = document.createElement('button');
    card.className = 'disc-card';
    card.setAttribute('role', 'listitem');
    card.dataset.trackId = track.id;

    const safeArt = track.thumbnailUrl || track.artworkUrl || createArtworkFallback(120);

    card.innerHTML = `
      <div class="disc-card-art-wrapper">
        <img src="${safeArt}" alt="" class="disc-card-art" loading="lazy"/>
        <div class="disc-card-play-overlay">
          <div class="disc-card-play-btn"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="disc-card-meta">
        <div class="disc-card-title">${escapeHtml(track.title)}</div>
        <div class="disc-card-artist">${escapeHtml(track.artist)}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      const existing = state.queue.find((t) => String(t.id) === String(track.id));
      if (!existing) state.queue.unshift(track);
      const idx = state.queue.findIndex((t) => String(t.id) === String(track.id));
      loadTrack(track, idx >= 0 ? idx : 0);
    });

    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────
async function performSearch(query) {
  const q = (query || '').trim();
  if (!q) {
    showNotice('Please enter a song name, artist, album, or peaceful mood.', false);
    return;
  }

  state.searchQuery = q;
  setVisible(resultsLoading, true);
  hideNotice();
  if (resultsGrid) resultsGrid.innerHTML = '';
  if (resultsTitle) resultsTitle.textContent = `Searching for "${q}"…`;

  try {
    const tracks = await musicService.searchSongs(q, state.activeLanguage, 25);
    setVisible(resultsLoading, false);

    if (tracks.length === 0) {
      const langHint = state.activeLanguage !== 'all' ? ` in ${state.activeLanguage}` : '';
      showNotice(`No songs found for "${q}"${langHint}. Try another query or switch language to 'All'.`, false);
      if (resultsTitle) resultsTitle.textContent = 'No results found';
      return;
    }

    state.queue = [...tracks];
    state._playedIds.clear();
    updateQueueCounts();

    if (resultsTitle) resultsTitle.textContent = `Results for "${q}"`;
    if (resultsSubtitle) resultsSubtitle.textContent = `${tracks.length} songs found`;
    renderSongCards(tracks, resultsGrid);

    // Update recommendations
    loadRecommendations(tracks[0]);
  } catch (err) {
    setVisible(resultsLoading, false);
    showNotice(`Search error: ${err.message}`, true);
    if (resultsTitle) resultsTitle.textContent = 'Search failed';
  }
}

function showNotice(text, isError = false) {
  if (resultsNoticeText) resultsNoticeText.textContent = text;
  setVisible(resultsNotice, true);
  if (resultsNotice) {
    resultsNotice.style.borderColor = isError ? 'rgba(244,63,94,0.4)' : 'rgba(124,58,237,0.3)';
  }
}

function hideNotice() {
  setVisible(resultsNotice, false);
}

// ─────────────────────────────────────────────
//  RECOMMENDATIONS & TRENDING
// ─────────────────────────────────────────────
async function loadRecommendations(referenceTrack) {
  if (!referenceTrack || !recGrid || !window.musicService) return;
  try {
    const artist = referenceTrack.artist ? referenceTrack.artist.split(',')[0].trim() : '';
    if (recTitle) recTitle.textContent = `Recommended: Similar to ${referenceTrack.title}`;
    if (recSubtitle) recSubtitle.textContent = `Based on ${referenceTrack.language || 'selected'} mood and sound`;

    const tracks = await musicService.getRecommendations(referenceTrack, state.activeLanguage, 12, state._playedIds);
    if (tracks.length > 0) {
      renderDiscoveryCards(tracks, recGrid);
    }
  } catch (e) {}
}

async function loadTrending() {
  if (!trendingGrid || !window.musicService) return;
  setVisible(trendingLoading, true);
  setVisible(trendingGrid, false);

  try {
    const { tracks } = await musicService.getTrendingSongs(state.activeLanguage, 12);
    setVisible(trendingLoading, false);

    if (tracks && tracks.length > 0) {
      renderDiscoveryCards(tracks, trendingGrid);
      setVisible(trendingGrid, true);

      // Pre-fill queue if empty
      if (state.queue.length === 0) {
        state.queue = [...tracks];
        prepareTrack(tracks[0], 0);
        updateQueueCounts();
      }
    }
  } catch (e) {
    setVisible(trendingLoading, false);
  }
}

// ─────────────────────────────────────────────
//  MEDIA SESSION API
// ─────────────────────────────────────────────
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'Audio Therapy',
      artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: '500x500', type: 'image/jpeg' }] : [],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      audio.play();
      setPlayState(true);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
      setPlayState(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) audio.currentTime = details.seekTime;
    });
  } catch (e) {}
}

// ─────────────────────────────────────────────
//  MODALS MANAGEMENT
// ─────────────────────────────────────────────
function openPlaylistModal(mode = 'create', targetId = null) {
  state.modalMode = mode;
  state.renameTargetId = targetId;
  if (!playlistModal) return;

  if (mode === 'rename') {
    const playlists = window.authService ? authService.getPlaylists() : [];
    const pl = playlists.find((p) => p.id === targetId);
    if (playlistModalTitle) playlistModalTitle.textContent = 'Rename Playlist';
    if (playlistNameInput) playlistNameInput.value = pl ? pl.name : '';
    if (playlistModalSave) playlistModalSave.textContent = 'Rename';
  } else {
    if (playlistModalTitle) playlistModalTitle.textContent = 'Create New Playlist';
    if (playlistNameInput) playlistNameInput.value = '';
    if (playlistModalSave) playlistModalSave.textContent = 'Create Playlist';
  }

  playlistModal.removeAttribute('hidden');
  playlistModal.style.display = 'flex';
  setTimeout(() => {
    if (playlistNameInput) playlistNameInput.focus();
  }, 60);
}

function closePlaylistModal() {
  if (playlistModal) {
    playlistModal.setAttribute('hidden', '');
    playlistModal.style.display = 'none';
  }
}

function savePlaylistModal() {
  const name = playlistNameInput ? playlistNameInput.value.trim() : '';
  if (!name) {
    showToast('Please enter a playlist name.');
    return;
  }
  if (!window.authService) return;

  if (state.modalMode === 'rename') {
    authService.renamePlaylist(state.renameTargetId || state.activePlaylistId, name);
    showToast(`Renamed to "${name}"`);
  } else {
    const newPl = authService.createPlaylist(name);
    state.activePlaylistId = newPl.id;
    showToast(`Created playlist "${name}"`);
  }
  closePlaylistModal();
  renderLibraryView();
}

function openAddToPlaylistModal(track) {
  if (!addToPlaylistModal || !track || !window.authService) return;
  state.trackForPicker = track;

  if (modalTrackArt) modalTrackArt.src = track.thumbnailUrl || createArtworkFallback(44);
  if (modalTrackName) modalTrackName.textContent = track.title;
  if (modalTrackArtist) modalTrackArtist.textContent = track.artist;

  renderAddToPlaylistModal();
  addToPlaylistModal.removeAttribute('hidden');
  addToPlaylistModal.style.display = 'flex';
}

function closeAddToPlaylistModal() {
  if (addToPlaylistModal) {
    addToPlaylistModal.setAttribute('hidden', '');
    addToPlaylistModal.style.display = 'none';
    state.trackForPicker = null;
  }
}

function renderAddToPlaylistModal() {
  if (!modalPlaylistsList || !state.trackForPicker || !window.authService) return;
  modalPlaylistsList.innerHTML = '';
  const track = state.trackForPicker;
  const playlists = authService.getPlaylists();

  playlists.forEach((pl) => {
    const hasTrack = pl.tracks.some((t) => String(t.id) === String(track.id));
    const item = document.createElement('div');
    item.className = `modal-playlist-item ${hasTrack ? 'has-track' : ''}`;
    item.innerHTML = `
      <div class="modal-playlist-name">
        <i class="fa-solid fa-list"></i>
        <span>${escapeHtml(pl.name)}</span>
        <span class="playlist-chip-count">${pl.tracks.length}</span>
      </div>
      <div class="modal-playlist-check">
        <i class="fa-solid ${hasTrack ? 'fa-circle-check' : 'fa-circle-plus'}"></i>
      </div>
    `;
    item.addEventListener('click', () => {
      if (hasTrack) {
        authService.removeTrackFromPlaylist(pl.id, track.id);
        showToast(`Removed from "${pl.name}"`);
      } else {
        authService.addTrackToPlaylist(pl.id, track);
        showToast(`Added to "${pl.name}"`);
      }
      renderAddToPlaylistModal();
      updateAllButtons();
    });
    modalPlaylistsList.appendChild(item);
  });
}

// ─────────────────────────────────────────────
//  USER AUTH & PROFILE UI
// ─────────────────────────────────────────────
let _authMode = 'signin'; // 'signin' | 'signup'

function openAuthOrProfileModal() {
  switchTab('playlist');
}

function openAuthModal(mode = 'signin') {
  _authMode = mode;
  if (!authModal) return;
  authModal.removeAttribute('hidden');
  authModal.style.display = 'flex';

  if (authTabSignin) authTabSignin.classList.toggle('active', mode === 'signin');
  if (authTabSignup) authTabSignup.classList.toggle('active', mode === 'signup');
  if (authNameField) setVisible(authNameField, mode === 'signup');
  if (authSubmitBtn) {
    authSubmitBtn.querySelector('span').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  }
  if (authModalTitle) {
    authModalTitle.textContent = mode === 'signin' ? 'Sign In to Audio Therapy' : 'Create an Account';
  }
  if (authNotice) setVisible(authNotice, false);
}

function closeAuthModal() {
  if (authModal) {
    authModal.setAttribute('hidden', '');
    authModal.style.display = 'none';
  }
}

function openProfileModal(user) {
  if (!profileModal || !user) return;
  if (profileDisplayName) profileDisplayName.textContent = user.displayName || 'User';
  if (profileEmail) profileEmail.textContent = user.email || '';
  if (profileEditName) profileEditName.value = user.displayName || '';
  if (profileLangSelect) profileLangSelect.value = user.preferredLanguage || 'all';

  profileModal.removeAttribute('hidden');
  profileModal.style.display = 'flex';
}

function closeProfileModal() {
  if (profileModal) {
    profileModal.setAttribute('hidden', '');
    profileModal.style.display = 'none';
  }
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS INITIALIZATION
// ─────────────────────────────────────────────
function initEventListeners() {
  // ── Audio events ──
  audio.addEventListener('timeupdate', updateProgress);

  audio.addEventListener('loadedmetadata', () => {
    const durStr = formatTime(Math.round(audio.duration));
    if (npDuration) npDuration.textContent = durStr;
    if (fpDuration) fpDuration.textContent = durStr;
    if (expDuration) expDuration.textContent = durStr;
  });

  audio.addEventListener('waiting', () => setVisible(npLoading, true));
  audio.addEventListener('playing', () => {
    setVisible(npLoading, false);
    setPlayState(true);
  });
  audio.addEventListener('pause', () => setPlayState(false));

  audio.addEventListener('ended', () => {
    setPlayState(false);
    if (state._endedPending) return;
    state._endedPending = true;
    setTimeout(() => {
      state._endedPending = false;
      _advanceToNext(false);
    }, 300);
  });

  audio.addEventListener('error', () => {
    setVisible(npLoading, false);
    setPlayState(false);
    if (state.currentTrack && window.musicService) {
      musicService.invalidateAudioCache(state.currentTrack.id);
      state.currentTrack.previewUrl = null;
    }
    showToast('Playback error. Skipping to next playable track…');
    const gen = state._loadGen;
    setTimeout(() => {
      if (gen !== state._loadGen) return;
      if (state.queue.length > 1) _advanceToNext(true);
    }, 1200);
  });

  // ── Seekbar dragging ──
  attachSeekEvents(npProgressCont);
  attachSeekEvents(fpProgressCont);
  attachSeekEvents(expProgressCont);

  // ── Playback buttons ──
  [btnPlay, fpPlay, expPlayBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', togglePlayPause);
  });
  [btnPrev, fpPrev, expPrevBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', playPrevious);
  });
  [btnNext, fpNext, expNextBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', playNext);
  });

  // ── Shuffle & Repeat ──
  const toggleShuffle = () => {
    state.shuffle = !state.shuffle;
    updateShuffleUI();
    showToast(state.shuffle ? 'Shuffle: On' : 'Shuffle: Off');
  };
  if (btnShuffle) btnShuffle.addEventListener('click', toggleShuffle);
  if (fpShuffle) fpShuffle.addEventListener('click', toggleShuffle);
  if (expShuffleBtn) expShuffleBtn.addEventListener('click', toggleShuffle);

  const cycleRepeat = () => {
    if (state.repeat === 'off') state.repeat = 'all';
    else if (state.repeat === 'all') state.repeat = 'one';
    else state.repeat = 'off';
    updateRepeatUI();
    showToast(`Repeat: ${state.repeat === 'off' ? 'Off' : state.repeat === 'all' ? 'All' : 'One'}`);
  };
  if (btnRepeat) btnRepeat.addEventListener('click', cycleRepeat);
  if (fpRepeat) fpRepeat.addEventListener('click', cycleRepeat);
  if (expRepeatBtn) expRepeatBtn.addEventListener('click', cycleRepeat);

  // ── Favorite buttons ──
  [npFavBtn, fpFavBtn, expFavBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', toggleCurrentTrackFavorite);
  });

  // ── Volume & Mute ──
  if (btnMute) btnMute.addEventListener('click', toggleMute);
  if (fpMute) fpMute.addEventListener('click', toggleMute);
  if (volumeSlider) volumeSlider.addEventListener('input', () => applyVolume(volumeSlider.value / 100));
  if (fpVolSlider) fpVolSlider.addEventListener('input', () => applyVolume(fpVolSlider.value / 100));

  // ── Search events ──
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const val = searchInput.value;
      setVisible(searchClearBtn, val.length > 0);
      clearTimeout(state.searchDebounce);
      state.searchDebounce = setTimeout(() => {
        if (val.trim().length >= 2) performSearch(val);
      }, 500);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(state.searchDebounce);
        performSearch(searchInput.value);
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        setVisible(searchClearBtn, false);
        searchInput.focus();
      }
      hideNotice();
      if (resultsGrid) resultsGrid.innerHTML = '';
      if (resultsTitle) resultsTitle.textContent = 'Discover Your Sound';
      if (resultsSubtitle) resultsSubtitle.textContent = 'Search for any song, artist, album, or peaceful mood.';
    });
  }

  if (searchSubmitBtn) {
    searchSubmitBtn.addEventListener('click', () => {
      clearTimeout(state.searchDebounce);
      if (searchInput) performSearch(searchInput.value);
    });
  }

  // ── Strict Language Chips ──
  langChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      langChips.forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');

      state.activeLanguage = chip.dataset.lang;

      // Filter existing queue to respect newly selected language
      if (state.activeLanguage !== 'all' && state.queue.length > 1) {
        const cur = state.currentTrack;
        const filtered = state.queue.filter((t) => {
          if (cur && String(t.id) === String(cur.id)) return true;
          return t.language === state.activeLanguage || t.language === 'unknown';
        });
        if (filtered.length >= 2) {
          state.queue = filtered;
          state.currentIndex = cur ? filtered.findIndex((t) => String(t.id) === String(cur.id)) : 0;
          updateQueueCounts();
        }
      }

      // Reload trending and search for new language
      loadTrending();
      if (state.searchQuery) performSearch(state.searchQuery);

      showToast(`Language set to ${chip.textContent.trim()}`);
    });
  });

  // ── Tab buttons ──
  if (tabSearch) tabSearch.addEventListener('click', () => switchTab('search'));
  if (tabWellness) tabWellness.addEventListener('click', () => switchTab('wellness'));
  if (tabPlaylist) tabPlaylist.addEventListener('click', () => switchTab('playlist'));
  if (tabQueue) tabQueue.addEventListener('click', () => switchTab('queue'));

  mbNavBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'profile') openAuthOrProfileModal();
      else switchTab(tab);
    });
  });

  // ── Library subtabs ──
  if (libSubtabPlaylists) {
    libSubtabPlaylists.addEventListener('click', () => {
      state.activeLibSubtab = 'playlists';
      libSubtabPlaylists.classList.add('active');
      libSubtabFavorites.classList.remove('active');
      libSubtabHistory.classList.remove('active');
      setVisible(libSecPlaylists, true);
      setVisible(libSecFavorites, false);
      setVisible(libSecHistory, false);
      renderLibraryView();
    });
  }

  if (libSubtabFavorites) {
    libSubtabFavorites.addEventListener('click', () => {
      state.activeLibSubtab = 'favorites';
      libSubtabFavorites.classList.add('active');
      libSubtabPlaylists.classList.remove('active');
      libSubtabHistory.classList.remove('active');
      setVisible(libSecPlaylists, false);
      setVisible(libSecFavorites, true);
      setVisible(libSecHistory, false);
      renderFavoritesView();
    });
  }

  if (libSubtabHistory) {
    libSubtabHistory.addEventListener('click', () => {
      state.activeLibSubtab = 'history';
      libSubtabHistory.classList.add('active');
      libSubtabPlaylists.classList.remove('active');
      libSubtabFavorites.classList.remove('active');
      setVisible(libSecPlaylists, false);
      setVisible(libSecFavorites, false);
      setVisible(libSecHistory, true);
      renderHistoryView();
    });
  }

  if (btnFavPlayAll) {
    btnFavPlayAll.addEventListener('click', () => {
      const favs = authService.getFavorites();
      if (favs.length === 0) return;
      state.queue = [...favs];
      loadTrack(favs[0], 0);
      showToast(`Playing ${favs.length} favorites`);
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      authService.clearHistory();
      renderHistoryView();
      showToast('Listening history cleared');
    });
  }

  // ── Playlist actions ──
  if (headerPlaylistBtn) headerPlaylistBtn.addEventListener('click', () => switchTab('playlist'));
  if (headerQueueBtn) headerQueueBtn.addEventListener('click', () => switchTab('queue'));
  if (btnPlaylistPlayAll) {
    btnPlaylistPlayAll.addEventListener('click', () => {
      const playlists = authService.getPlaylists();
      const activePl = playlists.find((p) => p.id === state.activePlaylistId) || playlists[0];
      if (activePl && activePl.tracks.length > 0) {
        state.queue = [...activePl.tracks];
        loadTrack(activePl.tracks[0], 0);
        showToast(`Playing "${activePl.name}" (${activePl.tracks.length} songs)`);
      }
    });
  }
  if (btnCreatePlaylist) btnCreatePlaylist.addEventListener('click', () => openPlaylistModal('create'));
  if (btnPlaylistNewAction) btnPlaylistNewAction.addEventListener('click', () => openPlaylistModal('create'));
  if (btnRenamePlaylist)
    btnRenamePlaylist.addEventListener('click', () => openPlaylistModal('rename', state.activePlaylistId));
  if (currentPlaylistTitle)
    currentPlaylistTitle.addEventListener('click', () => openPlaylistModal('rename', state.activePlaylistId));
  if (btnPlaylistClear) {
    btnPlaylistClear.addEventListener('click', () => {
      const pl = authService.getPlaylists().find((p) => p.id === state.activePlaylistId);
      if (pl && confirm(`Clear all tracks from "${pl.name}"?`)) {
        pl.tracks = [];
        authService.savePlaylists(authService.getPlaylists());
        renderLibraryView();
        showToast(`Cleared "${pl.name}"`);
      }
    });
  }
  if (btnPlaylistDelete) {
    btnPlaylistDelete.addEventListener('click', () => {
      if (confirm('Delete this playlist?')) {
        authService.deletePlaylist(state.activePlaylistId);
        state.activePlaylistId = 'pl_default';
        renderLibraryView();
        showToast('Playlist deleted');
      }
    });
  }

  // ── Queue actions ──
  if (btnQueueClear) {
    btnQueueClear.addEventListener('click', () => {
      if (state.currentTrack) {
        state.queue = [state.currentTrack];
        state.currentIndex = 0;
      } else {
        state.queue = [];
        state.currentIndex = -1;
      }
      renderQueueView();
      showToast('Queue cleared');
    });
  }
  if (btnQueueAutoplayToggle) {
    btnQueueAutoplayToggle.addEventListener('click', () => {
      state.autoplay = !state.autoplay;
      if (queueAutoplayLabel) queueAutoplayLabel.textContent = `Autoplay: ${state.autoplay ? 'ON' : 'OFF'}`;
      showToast(`Autoplay ${state.autoplay ? 'enabled' : 'disabled'}`);
    });
  }

  // ── Expanded player trigger ──
  if (npArtworkTrigger) npArtworkTrigger.addEventListener('click', openExpandedPlayer);
  if (fpInfoClickable) {
    fpInfoClickable.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openExpandedPlayer();
    });
  }
  if (fpExpandBtn) fpExpandBtn.addEventListener('click', openExpandedPlayer);
  if (expCloseBtn) expCloseBtn.addEventListener('click', closeExpandedPlayer);
  if (expShareBtn) {
    expShareBtn.addEventListener('click', () => {
      if (!state.currentTrack) return;
      if (navigator.share) {
        navigator.share({
          title: state.currentTrack.title,
          text: `Listening to "${state.currentTrack.title}" by ${state.currentTrack.artist} on Audio Therapy`,
          url: window.location.href,
        });
      } else {
        navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard!');
      }
    });
  }

  // ── Auth & Profile Modals ──
  if (headerAuthBtn) headerAuthBtn.addEventListener('click', openAuthOrProfileModal);
  if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);
  if (profileModalClose) profileModalClose.addEventListener('click', closeProfileModal);

  if (authTabSignin) {
    authTabSignin.addEventListener('click', () => openAuthModal('signin'));
  }
  if (authTabSignup) {
    authTabSignup.addEventListener('click', () => openAuthModal('signup'));
  }

  if (authForm) {
    authForm.addEventListener('submit', async () => {
      const email = authEmailInput ? authEmailInput.value.trim() : '';
      const password = authPasswordInput ? authPasswordInput.value : '';
      const name = authNameInput ? authNameInput.value.trim() : '';

      try {
        if (_authMode === 'signup') {
          await authService.signUp(email, password, name);
          showToast('Account created successfully! Welcome to Audio Therapy.');
        } else {
          await authService.signIn(email, password);
          showToast('Signed in successfully! Welcome back.');
        }
        closeAuthModal();
      } catch (err) {
        if (authNotice) {
          authNotice.textContent = err.message || 'Authentication error';
          setVisible(authNotice, true);
        }
      }
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
      try {
        await authService.updateProfile({
          displayName: profileEditName.value,
          preferredLanguage: profileLangSelect.value,
        });
        showToast('Profile updated!');
        closeProfileModal();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  if (btnMigrateData) {
    btnMigrateData.addEventListener('click', () => {
      const user = authService.getCurrentUser();
      if (user) {
        authService.migrateGuestData(user.id);
        renderLibraryView();
        showToast('Guest library synced into your account!');
      }
    });
  }

  if (btnProfileLogout) {
    btnProfileLogout.addEventListener('click', async () => {
      await authService.signOut();
      closeProfileModal();
      showToast('Signed out.');
    });
  }

  if (btnDeleteAccount) {
    btnDeleteAccount.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete your account? All saved playlists will be removed.')) {
        await authService.deleteAccount();
        closeProfileModal();
        showToast('Account deleted.');
      }
    });
  }

  // ── Playlist Modals ──
  if (playlistModalClose) playlistModalClose.addEventListener('click', closePlaylistModal);
  if (playlistModalCancel) playlistModalCancel.addEventListener('click', closePlaylistModal);
  if (playlistModalSave) playlistModalSave.addEventListener('click', savePlaylistModal);
  if (playlistNameInput) {
    playlistNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') savePlaylistModal();
      if (e.key === 'Escape') closePlaylistModal();
    });
  }
  if (addToPlaylistClose) addToPlaylistClose.addEventListener('click', closeAddToPlaylistModal);
  if (modalBtnCreateInline) {
    modalBtnCreateInline.addEventListener('click', () => {
      const t = state.trackForPicker;
      closeAddToPlaylistModal();
      openPlaylistModal('create');
      // After save, add track
      setTimeout(() => {
        if (t) authService.addTrackToPlaylist(state.activePlaylistId, t);
      }, 500);
    });
  }

  // ── Sleep Timer Modal ──
  const openSleepModal = () => {
    if (state._sleepTimerId) {
      clearSleepTimer();
      updateSleepTimerUI(0);
      showToast('Sleep timer cancelled.');
    } else if (sleepModal) {
      sleepModal.removeAttribute('hidden');
      sleepModal.style.display = 'flex';
    }
  };
  if (btnSleepTimer) btnSleepTimer.addEventListener('click', openSleepModal);
  if (expSleepBtn) expSleepBtn.addEventListener('click', openSleepModal);
  if (sleepModalClose) {
    sleepModalClose.addEventListener('click', () => {
      if (sleepModal) {
        sleepModal.setAttribute('hidden', '');
        sleepModal.style.display = 'none';
      }
    });
  }

  document.querySelectorAll('.sleep-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.minutes, 10);
      setSleepTimer(mins);
      if (sleepModal) {
        sleepModal.setAttribute('hidden', '');
        sleepModal.style.display = 'none';
      }
    });
  });

  // ── Wellness & Breathing ──
  if (btnBreathingStart) btnBreathingStart.addEventListener('click', toggleBreathing);
  if (breathingCircle) breathingCircle.addEventListener('click', toggleBreathing);
  initNoiseGenerator();

  // ── Global Keyboard Shortcuts ──
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'ArrowRight') {
      if (e.shiftKey) playNext();
      else if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    } else if (e.key === 'ArrowLeft') {
      if (e.shiftKey) playPrevious();
      else if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.key.toLowerCase() === 'm') {
      toggleMute();
    } else if (e.key.toLowerCase() === 'n') {
      playNext();
    } else if (e.key.toLowerCase() === 's') {
      toggleShuffle();
    } else if (e.key === 'Escape') {
      closeExpandedPlayer();
      closeAuthModal();
      closeProfileModal();
      closePlaylistModal();
      closeAddToPlaylistModal();
    }
  });
}

function showFixedPlayer(visible) {
  setVisible(fixedPlayer, visible);
  setVisible(fpSpacer, visible);
}

// ─────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────
function init() {
  initEventListeners();

  // Load volume
  try {
    const savedVol = parseFloat(localStorage.getItem('at_volume')) || 0.8;
    applyVolume(savedVol);
  } catch (e) {}

  // Auth observer
  if (window.authService) {
    authService.onAuthStateChange((user) => {
      if (user) {
        if (headerAuthLabel) headerAuthLabel.textContent = user.displayName || 'Profile';
        if (headerAuthIcon) headerAuthIcon.className = 'fa-solid fa-user-check';
        if (headerAuthBtn) headerAuthBtn.classList.add('logged-in');
        if (mbNavUserLabel) mbNavUserLabel.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Profile';
        if (mbNavUserIcon) mbNavUserIcon.className = 'fa-solid fa-user-check';
      } else {
        if (headerAuthLabel) headerAuthLabel.textContent = 'Sign In';
        if (headerAuthIcon) headerAuthIcon.className = 'fa-regular fa-user';
        if (headerAuthBtn) headerAuthBtn.classList.remove('logged-in');
        if (mbNavUserLabel) mbNavUserLabel.textContent = 'Account';
        if (mbNavUserIcon) mbNavUserIcon.className = 'fa-regular fa-user';
      }
      updateAllButtons();
    });
  }

  // Initial trending & fallback queue
  loadTrending();

  // Pre-fill initial fallback track
  const fallback = window.musicService && musicService.getCuratedFallbackTracks()[0];
  if (fallback) {
    state.queue = musicService.getCuratedFallbackTracks();
    prepareTrack(fallback, 0);
  }

  // Pre-render library & wellness views
  renderLibraryView();
  renderWellnessView();
  updateQueueCounts();

  // Hash handling (e.g. #playlist)
  if (window.location.hash === '#playlist') {
    switchTab('playlist');
  } else if (window.location.hash === '#wellness') {
    switchTab('wellness');
  }

  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 400);
}

// Start
document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
}
