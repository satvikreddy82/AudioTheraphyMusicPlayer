/**
 * player.js — Audio Theraphy Music Player
 *
 * Full playback engine:
 * • HTML5 Audio via <audio> element
 * • Search with debouncing and language filter
 * • Queue management (previous / next / auto-advance)
 * • Progress bar seeking and live timestamps
 * • Volume + mute with localStorage persistence
 * • Recommendations based on recent searches (localStorage)
 * • Trending/Popular picks loaded on startup
 * • Keyboard shortcuts (Space, ←, →, M)
 * • Graceful error & fallback handling throughout
 */

'use strict';

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const state = {
  currentTrack:   null,      // Track object currently loaded
  queue:          [],        // Array of Track objects (from search results)
  currentIndex:   -1,        // Index of currentTrack in queue
  isPlaying:      false,
  isMuted:        false,
  volume:         0.8,
  searchQuery:    '',
  activeLanguage: 'all',
  isSeeking:      false,     // True while user drags progress bar
  searchDebounce: null,
  historyKey:     'at_history', // localStorage key for recent tracks
  legacyPlaylistKey: 'audiotheraphy_playlist',
  playlistsKey:   'audiotheraphy_playlists_v2',
  activePlaylistKey: 'audiotheraphy_active_playlist_id',
  playlists:      [],        // Array of { id, name, createdAt, tracks: [] }
  activePlaylistId: 'pl_default',
  activeTab:      'search',  // 'search' | 'playlist'
  modalMode:      'create',  // 'create' | 'rename'
  renameTargetId: null,
  trackForPicker: null,
};

// Getter/setter for state.playlist pointing to the currently active playlist
Object.defineProperty(state, 'playlist', {
  get() {
    const active = state.playlists.find(p => p.id === state.activePlaylistId) || state.playlists[0];
    return active ? active.tracks : [];
  },
  set(newTracks) {
    const active = state.playlists.find(p => p.id === state.activePlaylistId) || state.playlists[0];
    if (active) {
      active.tracks = newTracks;
      savePlaylists(state.playlists);
    }
  },
  configurable: true,
  enumerable: true,
});

// ─────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────
const audio            = document.getElementById('audio-element');

// Header
const searchInput      = document.getElementById('search-input');
const searchClearBtn   = document.getElementById('search-clear-btn');
const searchSubmitBtn  = document.getElementById('search-submit-btn');
const langChips        = document.querySelectorAll('.lang-chip');
const headerPlaylistBtn   = document.getElementById('header-playlist-btn');
const headerPlaylistCount = document.getElementById('header-playlist-count');

// Now Playing
const npCard           = document.getElementById('now-playing-card');
const npArtwork        = document.getElementById('np-artwork');
const npArtworkGlow    = document.getElementById('np-artwork-glow');
const npIdleState      = document.getElementById('np-idle-state');
const npInfo           = document.getElementById('np-info');
const npControls       = document.getElementById('np-controls');
const npTitle          = document.getElementById('np-title');
const npArtist         = document.getElementById('np-artist');
const npAlbum          = document.getElementById('np-album');
const npCurrentTime    = document.getElementById('np-current-time');
const npDuration       = document.getElementById('np-duration');
const npProgressCont   = document.getElementById('np-progress-bar-container');
const npProgressFill   = document.getElementById('np-progress-fill');
const npProgressThumb  = document.getElementById('np-progress-thumb');
const btnPlay          = document.getElementById('btn-play');
const playIcon         = document.getElementById('play-icon');
const btnPrev          = document.getElementById('btn-prev');
const btnNext          = document.getElementById('btn-next');
const btnMute          = document.getElementById('btn-mute');
const volIcon          = document.getElementById('vol-icon');
const volumeSlider     = document.getElementById('volume-slider');
const npLoading        = document.getElementById('np-loading');
const npPlaylistBtn    = document.getElementById('np-playlist-btn');
const npPlaylistIcon   = document.getElementById('np-playlist-icon');
const npPlaylistLabel  = document.getElementById('np-playlist-label');

// View Tabs & Panels
const tabSearch        = document.getElementById('tab-search');
const tabPlaylist      = document.getElementById('tab-playlist');
const tabPlaylistCount = document.getElementById('tab-playlist-count');
const searchView       = document.getElementById('search-view');
const playlistView     = document.getElementById('playlist-view');

// Results
const resultsHeader    = document.getElementById('results-header');
const resultsTitle     = document.getElementById('results-title');
const resultsSubtitle  = document.getElementById('results-subtitle');
const resultsLoading   = document.getElementById('results-loading');
const resultsNotice    = document.getElementById('results-notice');
const resultsNoticeText= document.getElementById('results-notice-text');
const resultsGrid      = document.getElementById('results-grid');

// Playlist Elements (Multi-playlist)
const playlistsBar        = document.getElementById('playlists-bar');
const playlistsChips      = document.getElementById('playlists-chips');
const btnCreatePlaylist      = document.getElementById('btn-create-playlist');
const btnPlaylistNewAction   = document.getElementById('btn-playlist-new-action');
const currentPlaylistTitle   = document.getElementById('current-playlist-title');
const btnRenamePlaylist      = document.getElementById('btn-rename-playlist');
const btnPlaylistRenameAction= document.getElementById('btn-playlist-rename-action');
const playlistSubtitle      = document.getElementById('playlist-subtitle');
const btnPlaylistPlayAll    = document.getElementById('btn-playlist-play-all');
const btnPlaylistClear      = document.getElementById('btn-playlist-clear');
const btnPlaylistDelete     = document.getElementById('btn-playlist-delete');
const playlistEmpty         = document.getElementById('playlist-empty');
const btnPlaylistExplore    = document.getElementById('btn-playlist-explore');
const btnPlaylistEmptyNew   = document.getElementById('btn-playlist-empty-new');
const playlistGrid          = document.getElementById('playlist-grid');

// Playlist Modals
const playlistModal       = document.getElementById('playlist-modal');
const playlistModalTitle  = document.getElementById('playlist-modal-title');
const playlistNameInput   = document.getElementById('playlist-name-input');
const playlistModalHint   = document.getElementById('playlist-modal-hint');
const playlistModalClose  = document.getElementById('playlist-modal-close');
const playlistModalCancel = document.getElementById('playlist-modal-cancel');
const playlistModalSave   = document.getElementById('playlist-modal-save');

const addToPlaylistModal  = document.getElementById('add-to-playlist-modal');
const addToPlaylistClose  = document.getElementById('add-to-playlist-close');
const modalTrackArt       = document.getElementById('modal-track-art');
const modalTrackName      = document.getElementById('modal-track-name');
const modalTrackArtist    = document.getElementById('modal-track-artist');
const modalPlaylistsList  = document.getElementById('modal-playlists-list');
const modalBtnCreateInline= document.getElementById('modal-btn-create-inline');

// Discovery
const recSection       = document.getElementById('recommendations-section');
const recTitle         = document.getElementById('rec-title');
const recSubtitle      = document.getElementById('rec-subtitle');
const recGrid          = document.getElementById('recommendations-grid');
const trendingSection  = document.getElementById('trending-section');
const trendingBadge    = document.getElementById('trending-badge');
const trendingLoading  = document.getElementById('trending-loading');
const trendingGrid     = document.getElementById('trending-grid');

// Fixed player
const fixedPlayer      = document.getElementById('fixed-player');
const fpSpacer         = document.getElementById('fp-spacer');
const fpArtwork        = document.getElementById('fp-artwork');
const fpTitle          = document.getElementById('fp-title');
const fpArtist         = document.getElementById('fp-artist');
const fpPlay           = document.getElementById('fp-play');
const fpPlayIcon       = document.getElementById('fp-play-icon');
const fpPrev           = document.getElementById('fp-prev');
const fpNext           = document.getElementById('fp-next');
const fpMute           = document.getElementById('fp-mute');
const fpVolIcon        = document.getElementById('fp-vol-icon');
const fpVolSlider      = document.getElementById('fp-volume-slider');
const fpProgressCont   = document.getElementById('fp-progress-container');
const fpProgressFill   = document.getElementById('fp-progress-fill');
const fpCurrentTime    = document.getElementById('fp-current-time');
const fpDuration       = document.getElementById('fp-duration');

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────

/** Format seconds to mm:ss */
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Show a toast message */
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
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), durationMs);
}

/** Show/hide element by adding/removing hidden attribute */
function setVisible(el, visible) {
  if (visible) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
}

/** Set percent on a progress fill */
function setProgress(fillEl, percent) {
  fillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

/** Clamp a value between min and max */
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

// ─────────────────────────────────────────────
//  LOCAL STORAGE — History
// ─────────────────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(state.historyKey) || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(track) {
  try {
    let history = loadHistory().filter(t => t.id !== track.id);
    history.unshift(track);
    history = history.slice(0, 10); // keep last 10
    localStorage.setItem(state.historyKey, JSON.stringify(history));
  } catch {
    // storage quota or private mode — silently skip
  }
}

// ─────────────────────────────────────────────
//  LOCAL STORAGE & STATE — Multi-Playlist System
// ─────────────────────────────────────────────

function loadPlaylists() {
  try {
    const raw = localStorage.getItem(state.playlistsKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Check legacy single-array playlist for migration
    const legacyRaw = localStorage.getItem(state.legacyPlaylistKey);
    let legacyTracks = [];
    if (legacyRaw) {
      try { legacyTracks = JSON.parse(legacyRaw); } catch {}
    }
    const defaultList = [
      {
        id: 'pl_default',
        name: 'My Playlist',
        createdAt: Date.now(),
        tracks: Array.isArray(legacyTracks) ? legacyTracks : [],
      }
    ];
    savePlaylists(defaultList);
    return defaultList;
  } catch {
    return [{ id: 'pl_default', name: 'My Playlist', createdAt: Date.now(), tracks: [] }];
  }
}

function savePlaylists(playlists) {
  try {
    localStorage.setItem(state.playlistsKey, JSON.stringify(playlists));
  } catch (err) {
    console.warn('Could not save playlists to localStorage:', err);
  }
}

function getActivePlaylist() {
  return state.playlists.find(p => p.id === state.activePlaylistId) || state.playlists[0];
}

function createPlaylist(name) {
  const trimmed = (name || '').trim();
  const plName = trimmed || `Playlist ${state.playlists.length + 1}`;
  const newPl = {
    id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: plName,
    createdAt: Date.now(),
    tracks: [],
  };

  if (state._pendingTrackForNewPlaylist) {
    newPl.tracks.push(state._pendingTrackForNewPlaylist);
  }

  state.playlists.push(newPl);
  state.activePlaylistId = newPl.id;
  try { localStorage.setItem(state.activePlaylistKey, newPl.id); } catch {}
  savePlaylists(state.playlists);

  renderPlaylistsBar();
  renderPlaylistView();
  updateAllPlaylistButtons();

  if (state._pendingTrackForNewPlaylist) {
    showToast(`Created "${plName}" & added "${state._pendingTrackForNewPlaylist.title}"`);
    state._pendingTrackForNewPlaylist = null;
  } else {
    showToast(`Created playlist "${plName}"`);
  }
  return newPl;
}

function renamePlaylist(id, newName) {
  const pl = state.playlists.find(p => p.id === id);
  if (!pl) return;
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    showToast('Please enter a valid playlist name.');
    return;
  }
  pl.name = trimmed;
  savePlaylists(state.playlists);
  renderPlaylistsBar();
  renderPlaylistView();
  showToast(`Renamed to "${trimmed}"`);
}

function deletePlaylist(id) {
  if (state.playlists.length <= 1) {
    showToast('You must keep at least one playlist. You can rename it or clear its songs.');
    return;
  }
  const pl = state.playlists.find(p => p.id === id);
  if (!pl) return;

  if (!confirm(`Are you sure you want to delete playlist "${pl.name}"?`)) return;

  state.playlists = state.playlists.filter(p => p.id !== id);
  if (state.activePlaylistId === id) {
    state.activePlaylistId = state.playlists[0].id;
    try { localStorage.setItem(state.activePlaylistKey, state.activePlaylistId); } catch {}
  }
  savePlaylists(state.playlists);
  renderPlaylistsBar();
  renderPlaylistView();
  updateAllPlaylistButtons();
  showToast(`Deleted playlist "${pl.name}"`);
}

function switchPlaylist(id) {
  const pl = state.playlists.find(p => p.id === id);
  if (!pl) return;
  state.activePlaylistId = id;
  try { localStorage.setItem(state.activePlaylistKey, id); } catch {}
  renderPlaylistsBar();
  renderPlaylistView();
  updateAllPlaylistButtons();
}

function isInPlaylist(trackId, playlistId = null) {
  if (playlistId) {
    const pl = state.playlists.find(p => p.id === playlistId);
    return pl ? pl.tracks.some(t => String(t.id) === String(trackId)) : false;
  }
  const active = getActivePlaylist();
  return active ? active.tracks.some(t => String(t.id) === String(trackId)) : false;
}

function isTrackInAnyPlaylist(trackId) {
  return state.playlists.some(p => p.tracks.some(t => String(t.id) === String(trackId)));
}

function addToPlaylist(track, playlistId = null) {
  if (!track) return;
  const pl = playlistId ? state.playlists.find(p => p.id === playlistId) : getActivePlaylist();
  if (!pl) return;
  if (pl.tracks.some(t => String(t.id) === String(track.id))) return;

  pl.tracks.unshift(track);
  savePlaylists(state.playlists);
  updatePlaylistBadges();
  updateAllPlaylistButtons();
  if (state.activeTab === 'playlist') {
    renderPlaylistView();
  }
  showToast(`Added "${track.title}" to ${pl.name}`);
}

function removeFromPlaylist(trackId, playlistId = null) {
  const pl = playlistId ? state.playlists.find(p => p.id === playlistId) : getActivePlaylist();
  if (!pl) return;
  const track = pl.tracks.find(t => String(t.id) === String(trackId));
  pl.tracks = pl.tracks.filter(t => String(t.id) !== String(trackId));
  savePlaylists(state.playlists);
  updatePlaylistBadges();
  updateAllPlaylistButtons();
  if (state.activeTab === 'playlist') {
    renderPlaylistView();
  }
  if (track) {
    showToast(`Removed "${track.title}" from ${pl.name}`);
  }
}

function togglePlaylistTrack(track) {
  if (!track) return;
  // Always open the picker modal so user can choose which playlist(s) to add to or create a new one
  openAddToPlaylistModal(track);
}

function clearPlaylist() {
  const active = getActivePlaylist();
  if (!active || active.tracks.length === 0) return;
  if (!confirm(`Are you sure you want to remove all songs from "${active.name}"?`)) return;
  active.tracks = [];
  savePlaylists(state.playlists);
  updatePlaylistBadges();
  updateAllPlaylistButtons();
  renderPlaylistView();
  showToast(`Cleared all songs from "${active.name}"`);
}

function playAllPlaylist() {
  const active = getActivePlaylist();
  if (!active || active.tracks.length === 0) {
    showToast('This playlist is empty. Add songs first!');
    return;
  }
  state.queue = [...active.tracks];
  loadTrack(active.tracks[0], 0);
  showToast(`Playing "${active.name}" (${active.tracks.length} songs)`);
}

function updatePlaylistBadges() {
  const active = getActivePlaylist();
  const activeCount = active ? active.tracks.length : 0;
  const totalCount = state.playlists.reduce((acc, p) => acc + p.tracks.length, 0);

  if (headerPlaylistCount) headerPlaylistCount.textContent = totalCount;
  if (tabPlaylistCount) tabPlaylistCount.textContent = totalCount;
  if (playlistSubtitle) {
    playlistSubtitle.textContent = activeCount === 1
      ? `1 song in "${active.name}"`
      : `${activeCount} songs in "${active.name}"`;
  }
}

function renderPlaylistsBar() {
  if (!playlistsChips) return;
  playlistsChips.innerHTML = '';

  state.playlists.forEach(pl => {
    const chip = document.createElement('button');
    const isActive = pl.id === state.activePlaylistId;
    chip.className = `playlist-chip ${isActive ? 'active' : ''}`;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', isActive ? 'true' : 'false');
    chip.innerHTML = `
      <span>${escapeHtml(pl.name)}</span>
      <span class="playlist-chip-count">${pl.tracks.length}</span>
    `;
    chip.addEventListener('click', () => switchPlaylist(pl.id));
    playlistsChips.appendChild(chip);
  });
}

function renderPlaylistView() {
  const active = getActivePlaylist();
  if (currentPlaylistTitle && active) {
    currentPlaylistTitle.textContent = active.name;
  }
  renderPlaylistsBar();
  updatePlaylistBadges();

  const tracks = active ? active.tracks : [];
  if (tracks.length === 0) {
    setVisible(playlistEmpty, true);
    playlistGrid.innerHTML = '';
  } else {
    setVisible(playlistEmpty, false);
    renderSongCards(tracks, playlistGrid, true);
  }
}

// ─────────────────────────────────────────────
//  MODALS LOGIC
// ─────────────────────────────────────────────

function openPlaylistModal(mode = 'create', targetId = null) {
  state.modalMode = mode;
  state.renameTargetId = targetId;

  if (!playlistModal) {
    // Robust fallback to native prompt if modal element is not in DOM
    if (mode === 'rename') {
      const pl = state.playlists.find(p => p.id === targetId) || getActivePlaylist();
      const currentName = pl ? pl.name : 'My Playlist';
      const newName = window.prompt('Rename Playlist to:', currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        renamePlaylist(pl.id, newName.trim());
      }
    } else {
      const newName = window.prompt('Enter name for your new playlist:', `Playlist ${state.playlists.length + 1}`);
      if (newName && newName.trim()) {
        createPlaylist(newName.trim());
      }
    }
    return;
  }

  if (mode === 'rename') {
    const pl = state.playlists.find(p => p.id === targetId) || getActivePlaylist();
    if (playlistModalTitle) playlistModalTitle.textContent = 'Rename Playlist';
    if (playlistNameInput) playlistNameInput.value = pl ? pl.name : '';
    if (playlistModalHint) playlistModalHint.textContent = 'Enter the new name for this playlist.';
    if (playlistModalSave) playlistModalSave.textContent = 'Rename';
  } else {
    if (playlistModalTitle) playlistModalTitle.textContent = 'Create New Playlist';
    if (playlistNameInput) playlistNameInput.value = '';
    if (playlistModalHint) playlistModalHint.textContent = 'Choose a name for your new playlist.';
    if (playlistModalSave) playlistModalSave.textContent = 'Create Playlist';
  }

  playlistModal.removeAttribute('hidden');
  playlistModal.style.display = 'flex';
  setTimeout(() => {
    if (playlistNameInput) {
      playlistNameInput.focus();
      playlistNameInput.select();
    }
  }, 60);
}

function closePlaylistModal() {
  if (!playlistModal) return;
  playlistModal.setAttribute('hidden', '');
  playlistModal.style.display = 'none';
  if (playlistNameInput) playlistNameInput.value = '';
}

function savePlaylistModal() {
  const val = playlistNameInput ? playlistNameInput.value.trim() : '';
  if (state.modalMode === 'rename') {
    if (!val) {
      showToast('Please enter a playlist name.');
      return;
    }
    renamePlaylist(state.renameTargetId || state.activePlaylistId, val);
  } else {
    createPlaylist(val);
  }
  closePlaylistModal();
}

function openAddToPlaylistModal(track) {
  if (!addToPlaylistModal || !track) return;
  state.trackForPicker = track;

  if (modalTrackArt) {
    modalTrackArt.src = track.thumbnailUrl || createArtworkFallback(44);
  }
  if (modalTrackName) modalTrackName.textContent = track.title;
  if (modalTrackArtist) modalTrackArtist.textContent = track.artist;

  renderAddToPlaylistModal();
  addToPlaylistModal.removeAttribute('hidden');
  addToPlaylistModal.style.display = 'flex';
}

function closeAddToPlaylistModal() {
  if (!addToPlaylistModal) return;
  addToPlaylistModal.setAttribute('hidden', '');
  addToPlaylistModal.style.display = 'none';
  state.trackForPicker = null;
}

function renderAddToPlaylistModal() {
  if (!modalPlaylistsList || !state.trackForPicker) return;
  modalPlaylistsList.innerHTML = '';

  const track = state.trackForPicker;

  state.playlists.forEach(pl => {
    const hasTrack = pl.tracks.some(t => String(t.id) === String(track.id));
    const item = document.createElement('div');
    item.className = `modal-playlist-item ${hasTrack ? 'has-track' : ''}`;
    item.innerHTML = `
      <div class="modal-playlist-name">
        <i class="fa-solid fa-list" aria-hidden="true"></i>
        <span>${escapeHtml(pl.name)}</span>
        <span class="playlist-chip-count">${pl.tracks.length}</span>
      </div>
      <div class="modal-playlist-check">
        <i class="fa-solid ${hasTrack ? 'fa-circle-check' : 'fa-circle-plus'}" aria-hidden="true"></i>
      </div>
    `;

    item.addEventListener('click', () => {
      if (hasTrack) {
        removeFromPlaylist(track.id, pl.id);
      } else {
        addToPlaylist(track, pl.id);
      }
      renderAddToPlaylistModal();
    });

    modalPlaylistsList.appendChild(item);
  });
}

function updateNowPlayingPlaylistBtn() {
  if (!npPlaylistBtn) return;
  if (!state.currentTrack) {
    npPlaylistBtn.style.display = 'none';
    return;
  }
  npPlaylistBtn.style.display = 'inline-flex';
  const inPlaylist = isTrackInAnyPlaylist(state.currentTrack.id);
  npPlaylistBtn.classList.toggle('active', inPlaylist);
  if (npPlaylistIcon) {
    npPlaylistIcon.className = inPlaylist ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
  }
  if (npPlaylistLabel) {
    npPlaylistLabel.textContent = inPlaylist ? 'In Playlist' : 'Add to Playlist';
  }
  npPlaylistBtn.title = inPlaylist ? 'In Playlist (Manage)' : 'Add to Playlist';
}

function updateAllPlaylistButtons() {
  updateNowPlayingPlaylistBtn();

  // Update all search result card buttons
  document.querySelectorAll('.song-card-playlist-btn').forEach(btn => {
    const tid = btn.dataset.trackId;
    if (!tid) return;
    const inPlaylist = isTrackInAnyPlaylist(tid);
    btn.classList.toggle('active', inPlaylist);
    btn.title = inPlaylist ? 'In Playlist' : 'Add to Playlist';
    btn.setAttribute('aria-label', inPlaylist ? 'In Playlist' : 'Add to Playlist');
    const icon = btn.querySelector('i');
    if (icon) icon.className = inPlaylist ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
  });

  // Update all discovery card buttons
  document.querySelectorAll('.disc-card-playlist-btn').forEach(btn => {
    const tid = btn.dataset.trackId;
    if (!tid) return;
    const inPlaylist = isTrackInAnyPlaylist(tid);
    btn.classList.toggle('active', inPlaylist);
    btn.title = inPlaylist ? 'In Playlist' : 'Add to Playlist';
    btn.setAttribute('aria-label', inPlaylist ? 'In Playlist' : 'Add to Playlist');
    const icon = btn.querySelector('i');
    if (icon) icon.className = inPlaylist ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
  });
}

function switchTab(tabName) {
  state.activeTab = tabName;
  if (tabName === 'playlist') {
    tabSearch.classList.remove('active');
    tabSearch.setAttribute('aria-selected', 'false');
    tabPlaylist.classList.add('active');
    tabPlaylist.setAttribute('aria-selected', 'true');
    setVisible(searchView, false);
    setVisible(playlistView, true);
    renderPlaylistView();
  } else {
    tabPlaylist.classList.remove('active');
    tabPlaylist.setAttribute('aria-selected', 'false');
    tabSearch.classList.add('active');
    tabSearch.setAttribute('aria-selected', 'true');
    setVisible(playlistView, false);
    setVisible(searchView, true);
  }
}

// ─────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────

async function performSearch(query) {
  const q = (query || '').trim();
  if (!q) {
    showNotice('Please enter a song name, artist, or album to search.', false);
    return;
  }

  state.searchQuery = q;
  showResultsLoading(true);
  hideNotice();
  resultsGrid.innerHTML = '';
  updateResultsHeader(`Searching for "${q}"…`, '');

  try {
    const tracks = await musicService.searchSongs(q, state.activeLanguage, 25);
    showResultsLoading(false);

    if (tracks.length === 0) {
      showNotice(`No songs found for "${q}". Try a different search term or language filter.`, false);
      updateResultsHeader('No results', `No songs found for "${q}"`);
      return;
    }

    state.queue = tracks;
    updateResultsHeader(`Results for "${q}"`, `${tracks.length} songs found`);
    renderSongCards(tracks, resultsGrid);

    // Load recommendations based on first result's artist
    loadRecommendations(tracks[0]);

  } catch (err) {
    showResultsLoading(false);
    let msg = 'Search failed. Please try again.';
    if (err.message && err.message.includes('timed out')) {
      msg = 'Request timed out. Please check your internet connection.';
    } else if (err.message && err.message.includes('Network error')) {
      msg = 'No internet connection. Please connect to the internet and try again.';
    } else if (err.message) {
      msg = `Search error: ${err.message}`;
    }
    showNotice(msg, true);
    updateResultsHeader('Search failed', '');
  }
}

function updateResultsHeader(title, subtitle) {
  resultsTitle.textContent = title;
  resultsSubtitle.textContent = subtitle;
}

function showResultsLoading(visible) {
  setVisible(resultsLoading, visible);
}

function showNotice(text, isError = false) {
  resultsNoticeText.textContent = text;
  setVisible(resultsNotice, true);
  resultsNotice.style.borderColor = isError
    ? 'rgba(220, 50, 50, 0.3)'
    : 'rgba(124, 58, 237, 0.2)';
}

function hideNotice() {
  setVisible(resultsNotice, false);
}

// ─────────────────────────────────────────────
//  RENDERING — SONG CARDS
// ─────────────────────────────────────────────

function createArtworkFallback(size = 56) {
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><rect width='${size}' height='${size}' fill='%23120d1e' rx='${Math.round(size * 0.18)}'/><text x='50%25' y='50%25' fill='%237C3AED' font-size='${Math.round(size * 0.45)}' text-anchor='middle' dy='.3em'>♪</text></svg>`;
}

function renderSongCards(tracks, container, isPlaylistView = false) {
  container.innerHTML = '';
  tracks.forEach((track, idx) => {
    const card = document.createElement('button');
    card.className = 'song-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`);
    card.dataset.trackId = track.id;
    card.tabIndex = 0;

    if (state.currentTrack && String(state.currentTrack.id) === String(track.id)) {
      card.classList.add('active', state.isPlaying ? 'playing' : '');
    }

    // Use actual duration; Saavn gives real duration, iTunes fallback defaults to 30s
    const durationSec = track.durationMs > 1000
      ? Math.round(track.durationMs / 1000)
      : (track.isFullSong ? 180 : 30);
    const durationStr = formatTime(durationSec);
    const hasAudio    = !!(track.previewUrl || track.encryptedUrl);
    const qualityTag  = !hasAudio
      ? '<span class="no-preview-badge" title="Audio unavailable">No Audio</span>'
      : track.isFullSong
        ? '<span class="full-song-badge" title="Full song available">Full Song</span>'
        : '<span class="no-preview-badge" title="30-second preview only">Preview</span>';

    const inPlaylist = isInPlaylist(track.id);

    const playlistActionBtn = isPlaylistView
      ? `<button
          class="song-card-remove-btn"
          data-track-id="${track.id}"
          title="Remove from Playlist"
          aria-label="Remove from Playlist"
        >
          <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
        </button>`
      : `<button
          class="song-card-playlist-btn ${inPlaylist ? 'active' : ''}"
          data-track-id="${track.id}"
          title="${inPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}"
          aria-label="${inPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}"
        >
          <i class="${inPlaylist ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>
        </button>`;

    const safeArt = sanitizeMediaUrl(track.thumbnailUrl, createArtworkFallback(56));
    const safeTrackId = escapeHtml(track.id);

    card.innerHTML = `
      <img
        src="${safeArt}"
        alt="Artwork for ${escapeHtml(track.title)}"
        class="song-card-art"
        loading="lazy"
      />
      <div class="song-card-meta">
        <div class="song-card-title">${escapeHtml(track.title)}</div>
        <div class="song-card-artist">${escapeHtml(track.artist)}</div>
        <div class="song-card-album">${escapeHtml(track.album)}</div>
      </div>
      <div class="song-card-actions">
        ${qualityTag}
        <span class="song-card-duration">${durationStr}</span>
        ${playlistActionBtn}
        <button
          class="song-card-play-btn"
          aria-label="Play ${escapeHtml(track.title)}"
          tabindex="-1"
        >
          <i class="fa-solid fa-play" aria-hidden="true"></i>
        </button>
      </div>
    `;

    // Attach fallback onerror listener cleanly
    const cardImg = card.querySelector('.song-card-art');
    if (cardImg) {
      cardImg.addEventListener('error', () => { cardImg.src = createArtworkFallback(56); }, { once: true });
    }

    // Hook up playlist toggle or remove button
    if (isPlaylistView) {
      const rmBtn = card.querySelector('.song-card-remove-btn');
      if (rmBtn) {
        rmBtn.addEventListener('click', e => {
          e.stopPropagation();
          removeFromPlaylist(track.id);
        });
      }
    } else {
      const pBtn = card.querySelector('.song-card-playlist-btn');
      if (pBtn) {
        pBtn.addEventListener('click', e => {
          e.stopPropagation();
          togglePlaylistTrack(track);
        });
      }
    }

    card.addEventListener('click', () => {
      if (isPlaylistView) {
        state.queue = [...state.playlist];
        loadTrack(track, idx);
      } else {
        const queueIndex = state.queue.findIndex(t => String(t.id) === String(track.id));
        loadTrack(track, queueIndex >= 0 ? queueIndex : idx);
      }
    });

    container.appendChild(card);
  });
}

function renderDiscoveryCards(tracks, container) {
  container.innerHTML = '';
  tracks.forEach(track => {
    const card = document.createElement('button');
    card.className = 'disc-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`);
    card.dataset.trackId = track.id;
    card.tabIndex = 0;

    const inPlaylist = isInPlaylist(track.id);

    const safeDiscArt = sanitizeMediaUrl(track.thumbnailUrl, createArtworkFallback(120));
    const safeTrackId = escapeHtml(track.id);

    card.innerHTML = `
      <div class="disc-card-art-wrapper">
        <img
          src="${safeDiscArt}"
          alt="Artwork for ${escapeHtml(track.title)}"
          class="disc-card-art"
          loading="lazy"
        />
        <button
          class="disc-card-playlist-btn ${inPlaylist ? 'active' : ''}"
          data-track-id="${safeTrackId}"
          title="${inPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}"
          aria-label="${inPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}"
        >
          <i class="${inPlaylist ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>
        </button>
        <div class="disc-card-play-overlay">
          <button class="disc-card-play-btn" aria-label="Play ${escapeHtml(track.title)}" tabindex="-1">
            <i class="fa-solid fa-play" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="disc-card-meta">
        <div class="disc-card-title">${escapeHtml(track.title)}</div>
        <div class="disc-card-artist">${escapeHtml(track.artist)}</div>
      </div>
    `;

    const discImg = card.querySelector('.disc-card-art');
    if (discImg) {
      discImg.addEventListener('error', () => { discImg.src = createArtworkFallback(120); }, { once: true });
    }

    const pBtn = card.querySelector('.disc-card-playlist-btn');
    if (pBtn) {
      pBtn.addEventListener('click', e => {
        e.stopPropagation();
        togglePlaylistTrack(track);
      });
    }

    card.addEventListener('click', () => {
      // Add track to front of queue so next/prev works
      const existing = state.queue.find(t => String(t.id) === String(track.id));
      if (!existing) {
        state.queue.unshift(track);
        state.currentIndex = 0;
      }
      const idx = state.queue.findIndex(t => String(t.id) === String(track.id));
      loadTrack(track, idx >= 0 ? idx : 0);
    });

    container.appendChild(card);
  });
}

/** HTML escape to prevent XSS with untrusted API data */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize image or media URLs ensuring only safe https: or data: schemes are loaded */
function sanitizeMediaUrl(urlStr, fallback = '') {
  if (!urlStr || typeof urlStr !== 'string') return fallback;
  const trimmed = urlStr.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('data:image/') || trimmed.startsWith('/')) {
    return escapeHtml(trimmed);
  }
  return fallback;
}

// ─────────────────────────────────────────────
//  PLAYBACK
// ─────────────────────────────────────────────

/**
 * Load a track into the player.
 * @param {Track} track
 * @param {number} queueIndex - index in state.queue
 */
function loadTrack(track, queueIndex = -1) {
  if (!track) return;

  // Update state
  state.currentTrack  = track;
  state.currentIndex  = queueIndex;
  state.isPlaying     = false;

  // Update Now Playing UI
  npCard.classList.add('has-track');
  setVisible(npInfo, true);
  setVisible(npControls, true);
  setVisible(npLoading, true);

  npArtwork.src        = track.artworkUrl || createArtworkFallback(300);
  npTitle.textContent  = track.title;
  npArtist.textContent = track.artist;
  npAlbum.textContent  = track.album || '';

  // Update the audio quality badge
  const badgeText = document.getElementById('np-badge-text');
  const badge     = document.getElementById('np-audio-badge');
  const badgeIcon = badge ? badge.querySelector('i') : null;
  if (badgeText) {
    if (track.isFullSong) {
      badgeText.textContent = 'Full Song · 320kbps';
      if (badgeIcon) badgeIcon.className = 'fa-solid fa-music';
      if (badge) badge.style.background = 'rgba(34, 197, 94, 0.12)';
      if (badge) badge.style.borderColor = 'rgba(34, 197, 94, 0.25)';
      if (badge) badge.style.color = '#4ade80';
    } else {
      badgeText.textContent = '30s Preview';
      if (badgeIcon) badgeIcon.className = 'fa-solid fa-headphones';
      if (badge) badge.style.background = '';
      if (badge) badge.style.borderColor = '';
      if (badge) badge.style.color = '';
    }
  }

  // Update Now Playing playlist button
  updateNowPlayingPlaylistBtn();

  // Duration — use actual track duration (from Saavn), not hardcoded 30s
  const trackDuration = track.durationMs && track.durationMs > 1000
    ? track.durationMs
    : (track.isFullSong ? 180000 : 30000);
  npCurrentTime.textContent = '0:00';
  npDuration.textContent    = formatTime(Math.round(trackDuration / 1000));
  setProgress(npProgressFill, 0);
  npProgressThumb.style.left = '0%';

  // Update fixed player bar
  fpArtwork.src        = track.thumbnailUrl || createArtworkFallback(52);
  fpTitle.textContent  = track.title;
  fpArtist.textContent = track.artist;
  fpCurrentTime.textContent = '0:00';
  fpDuration.textContent    = formatTime(Math.round(trackDuration / 1000));
  setProgress(fpProgressFill, 0);

  showFixedPlayer(true);

  // Mark active card
  document.querySelectorAll('.song-card').forEach(c => {
    c.classList.remove('active', 'playing');
    if (String(c.dataset.trackId) === String(track.id)) c.classList.add('active');
  });
  document.querySelectorAll('.disc-card').forEach(c => {
    c.classList.remove('playing');
  });

  // Save to history
  saveToHistory(track);

  // Update page title
  document.title = `${track.title} \u00b7 ${track.artist} \u2014 Audio Theraphy`;

  // Resolve audio URL (async for JioSaavn full songs) then play
  _startAudioLoad(track);
}

/**
 * Async helper: resolves the signed audio URL for a track then starts playback.
 * For JioSaavn tracks this calls the auth-token endpoint to get the real URL.
 * For iTunes fallback tracks it uses the previewUrl directly.
 */
async function _startAudioLoad(track) {
  // Guard: if user switched to a different song while we were resolving, abort
  if (!state.currentTrack || state.currentTrack.id !== track.id) return;

  try {
    const audioUrl = await musicService.getAudioUrl(track);

    // Guard again after the await
    if (!state.currentTrack || state.currentTrack.id !== track.id) return;

    if (!audioUrl) {
      setVisible(npLoading, false);
      showToast(`'${track.title}' \u2014 audio unavailable. Try another song.`);
      setPlayState(false);
      return;
    }

    // Cache the resolved URL on the track object so play/pause works without re-fetching
    track.previewUrl = audioUrl;

    audio.src    = audioUrl;
    audio.load();
    audio.volume = state.isMuted ? 0 : state.volume;

    audio.play().then(() => {
      setVisible(npLoading, false);
      setPlayState(true);
    }).catch(err => {
      setVisible(npLoading, false);
      if (err.name === 'NotAllowedError') {
        showToast('Click \u25b6 to start playing.');
        setPlayState(false);
      } else {
        showToast(`Could not play '${track.title}'. Try another song.`);
        setPlayState(false);
      }
    });

  } catch (err) {
    if (!state.currentTrack || state.currentTrack.id !== track.id) return;
    setVisible(npLoading, false);
    const msg = err.message?.includes('timed out')
      ? 'Request timed out. Please check your internet connection.'
      : `Could not load '${track.title}'. Try another song.`;
    showToast(msg);
    setPlayState(false);
  }
}

function setPlayState(playing) {
  state.isPlaying = playing;

  // NP card icons
  playIcon.className   = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  fpPlayIcon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';

  btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  fpPlay.setAttribute('aria-label',  playing ? 'Pause' : 'Play');

  // Active card class
  document.querySelectorAll('.song-card').forEach(c => {
    if (state.currentTrack && c.dataset.trackId === state.currentTrack.id) {
      c.classList.toggle('playing', playing);
    }
  });
}

function togglePlayPause() {
  if (!state.currentTrack) return;

  if (audio.paused) {
    // If audio has no src yet (URL not resolved), re-trigger the load
    if (!audio.src || audio.src === window.location.href) {
      setVisible(npLoading, true);
      _startAudioLoad(state.currentTrack);
      return;
    }
    audio.play().then(() => setPlayState(true)).catch(() => {
      showToast('Could not play audio. Try again.');
    });
  } else {
    audio.pause();
    setPlayState(false);
  }
}

function playPrevious() {
  if (state.queue.length === 0) return;
  let idx = state.currentIndex - 1;
  if (idx < 0) idx = state.queue.length - 1;
  loadTrack(state.queue[idx], idx);
}

function playNext() {
  if (state.queue.length === 0) return;
  let idx = state.currentIndex + 1;
  if (idx >= state.queue.length) idx = 0;
  loadTrack(state.queue[idx], idx);
}

function showFixedPlayer(visible) {
  setVisible(fixedPlayer, visible);
  setVisible(fpSpacer, visible);
}

// ─────────────────────────────────────────────
//  PROGRESS / SEEK
// ─────────────────────────────────────────────

function updateProgress() {
  if (!audio.duration || state.isSeeking) return;
  const pct = (audio.currentTime / audio.duration) * 100;

  setProgress(npProgressFill, pct);
  npProgressThumb.style.left = `${pct}%`;
  setProgress(fpProgressFill, pct);

  npCurrentTime.textContent = formatTime(audio.currentTime);
  fpCurrentTime.textContent = formatTime(audio.currentTime);

  npProgressCont.setAttribute('aria-valuenow', Math.round(pct));
  fpProgressCont.setAttribute('aria-valuenow', Math.round(pct));
}

function seekFromClick(e, container) {
  const rect = container.getBoundingClientRect();
  const x    = clamp(e.clientX - rect.left, 0, rect.width);
  const pct  = x / rect.width;
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
  }
}

function attachSeekEvents(container) {
  let dragging = false;

  container.addEventListener('mousedown', e => {
    dragging = true;
    state.isSeeking = true;
    seekFromClick(e, container);
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    seekFromClick(e, container);
  });

  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; state.isSeeking = false; }
  });

  // Touch
  container.addEventListener('touchstart', e => {
    state.isSeeking = true;
    seekFromClick(e.touches[0], container);
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    seekFromClick(e.touches[0], container);
  }, { passive: true });

  container.addEventListener('touchend', () => { state.isSeeking = false; });

  // Keyboard
  container.addEventListener('keydown', e => {
    if (!audio.duration) return;
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    if (e.key === 'ArrowLeft')  audio.currentTime = Math.max(0, audio.currentTime - 5);
  });
}

// ─────────────────────────────────────────────
//  VOLUME
// ─────────────────────────────────────────────

function applyVolume(value) {
  state.volume = clamp(value, 0, 1);
  audio.volume = state.isMuted ? 0 : state.volume;

  const pct = state.volume * 100;
  volumeSlider.value = pct;
  fpVolSlider.value  = pct;

  // Style slider fill via CSS custom property
  volumeSlider.style.background = `linear-gradient(to right, #7C3AED ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  fpVolSlider.style.background  = `linear-gradient(to right, #7C3AED ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  audio.volume  = state.isMuted ? 0 : state.volume;
  const icon = state.isMuted ? 'fa-volume-xmark' : (state.volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high');
  volIcon.className   = `fa-solid ${icon}`;
  fpVolIcon.className = `fa-solid ${icon}`;
  btnMute.setAttribute('aria-label', state.isMuted ? 'Unmute' : 'Mute');
  fpMute.setAttribute('aria-label',  state.isMuted ? 'Unmute' : 'Mute');
}

// ─────────────────────────────────────────────
//  RECOMMENDATIONS
// ─────────────────────────────────────────────

async function loadRecommendations(referenceTrack) {
  if (!referenceTrack) return;

  try {
    recTitle.textContent    = `Because you searched for ${referenceTrack.artist.split(',')[0].trim()}`;
    recSubtitle.textContent = '';

    const tracks = await musicService.getRecommendations(referenceTrack, 8);
    if (tracks.length > 0) {
      renderDiscoveryCards(tracks, recGrid);
    } else {
      recSubtitle.textContent = 'No recommendations available right now.';
    }
  } catch {
    recSubtitle.textContent = 'Could not load recommendations.';
  }
}

// ─────────────────────────────────────────────
//  TRENDING / POPULAR
// ─────────────────────────────────────────────

async function loadTrending() {
  setVisible(trendingLoading, true);
  setVisible(trendingGrid, false);

  try {
    const { tracks, isLive } = await musicService.getTrendingSongs('in', 12);

    setVisible(trendingLoading, false);

    if (tracks.length === 0) {
      document.getElementById('trending-title').textContent = 'Popular Picks';
      trendingBadge.textContent = 'Curated';
      return;
    }

    // Update label based on whether we got live chart data
    if (isLive) {
      document.getElementById('trending-title').textContent = 'Trending Now';
      trendingBadge.textContent = 'Live Chart';
      trendingBadge.style.background = 'rgba(124, 58, 237, 0.12)';
    } else {
      document.getElementById('trending-title').textContent = 'Popular Picks';
      trendingBadge.textContent = 'Popular';
      trendingBadge.style.background = 'rgba(100, 100, 100, 0.12)';
      trendingBadge.style.borderColor = 'rgba(100, 100, 100, 0.25)';
      trendingBadge.style.color = '#888';
    }

    // Trending tracks go into a separate pool — prepend to queue if user plays one
    renderDiscoveryCards(tracks, trendingGrid);
    setVisible(trendingGrid, true);

  } catch {
    setVisible(trendingLoading, false);
    document.getElementById('trending-title').textContent = 'Popular Picks';
    trendingBadge.textContent = 'Unavailable';
  }
}

// ─────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────

document.addEventListener('keydown', e => {
  // Ignore when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowRight':
      if (audio.duration) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      }
      break;
    case 'ArrowLeft':
      if (audio.duration) {
        audio.currentTime = Math.max(0, audio.currentTime - 5);
      }
      break;
    case 'm':
    case 'M':
      toggleMute();
      break;
  }
});

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────

// ── Audio events ──
audio.addEventListener('timeupdate', updateProgress);

audio.addEventListener('ended', () => {
  setPlayState(false);
  // Auto-advance to next track if queue is available
  if (state.queue.length > 1) {
    setTimeout(playNext, 800);
  }
});

audio.addEventListener('error', () => {
  setPlayState(false);
  setVisible(npLoading, false);
  showToast('Audio playback error. This preview may not be available in your region.');
});

audio.addEventListener('loadedmetadata', () => {
  const dur = formatTime(Math.round(audio.duration));
  npDuration.textContent = dur;
  fpDuration.textContent = dur;
});

audio.addEventListener('waiting', () => {
  setVisible(npLoading, true);
});

audio.addEventListener('playing', () => {
  setVisible(npLoading, false);
});

// ── Search ──
searchInput.addEventListener('input', () => {
  const val = searchInput.value;
  setVisible(searchClearBtn, val.length > 0);
  // Debounce — search on pause in typing (500ms)
  clearTimeout(state.searchDebounce);
  state.searchDebounce = setTimeout(() => {
    if (val.trim().length >= 2) performSearch(val);
  }, 500);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(state.searchDebounce);
    performSearch(searchInput.value);
  }
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  setVisible(searchClearBtn, false);
  resultsGrid.innerHTML = '';
  hideNotice();
  updateResultsHeader('Discover Your Sound', 'Search for a song above to start listening.');
  searchInput.focus();
});

searchSubmitBtn.addEventListener('click', () => {
  clearTimeout(state.searchDebounce);
  performSearch(searchInput.value);
});

// ── Language Chips ──
langChips.forEach(chip => {
  chip.addEventListener('click', () => {
    langChips.forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
    state.activeLanguage = chip.dataset.lang;

    // Re-search if there's an existing query
    if (state.searchQuery) {
      clearTimeout(state.searchDebounce);
      performSearch(state.searchQuery);
    }
  });
});

// ── Playback controls ──
btnPlay.addEventListener('click', togglePlayPause);
fpPlay.addEventListener('click',  togglePlayPause);
btnPrev.addEventListener('click', playPrevious);
btnNext.addEventListener('click', playNext);
fpPrev.addEventListener('click',  playPrevious);
fpNext.addEventListener('click',  playNext);

// ── Mute ──
btnMute.addEventListener('click', toggleMute);
fpMute.addEventListener('click',  toggleMute);

// ── Volume sliders ──
volumeSlider.addEventListener('input', () => applyVolume(volumeSlider.value / 100));
fpVolSlider.addEventListener('input',  () => applyVolume(fpVolSlider.value / 100));

// ── Seek bars ──
attachSeekEvents(npProgressCont);
attachSeekEvents(fpProgressCont);

// ── Playlist controls & navigation ──
if (headerPlaylistBtn) {
  headerPlaylistBtn.addEventListener('click', () => {
    switchTab('playlist');
    const resultsSec = document.querySelector('.results-section');
    if (resultsSec) resultsSec.scrollIntoView({ behavior: 'smooth' });
  });
}

if (tabSearch) {
  tabSearch.addEventListener('click', () => switchTab('search'));
}

if (tabPlaylist) {
  tabPlaylist.addEventListener('click', () => switchTab('playlist'));
}

if (btnPlaylistPlayAll) {
  btnPlaylistPlayAll.addEventListener('click', playAllPlaylist);
}

if (btnPlaylistClear) {
  btnPlaylistClear.addEventListener('click', clearPlaylist);
}

if (btnPlaylistDelete) {
  btnPlaylistDelete.addEventListener('click', () => deletePlaylist(state.activePlaylistId));
}

if (btnCreatePlaylist) {
  btnCreatePlaylist.addEventListener('click', () => openPlaylistModal('create'));
}
if (btnPlaylistNewAction) {
  btnPlaylistNewAction.addEventListener('click', () => openPlaylistModal('create'));
}
if (btnPlaylistEmptyNew) {
  btnPlaylistEmptyNew.addEventListener('click', () => openPlaylistModal('create'));
}

if (btnRenamePlaylist) {
  btnRenamePlaylist.addEventListener('click', () => openPlaylistModal('rename', state.activePlaylistId));
}
if (btnPlaylistRenameAction) {
  btnPlaylistRenameAction.addEventListener('click', () => openPlaylistModal('rename', state.activePlaylistId));
}
if (currentPlaylistTitle) {
  currentPlaylistTitle.addEventListener('click', () => openPlaylistModal('rename', state.activePlaylistId));
}

if (btnPlaylistExplore) {
  btnPlaylistExplore.addEventListener('click', () => {
    switchTab('search');
    searchInput.focus();
  });
}

if (npPlaylistBtn) {
  npPlaylistBtn.addEventListener('click', () => {
    if (state.currentTrack) {
      togglePlaylistTrack(state.currentTrack);
    }
  });
}

// ── Modals event wiring ──
if (playlistModalClose) {
  playlistModalClose.addEventListener('click', closePlaylistModal);
}
if (playlistModalCancel) {
  playlistModalCancel.addEventListener('click', closePlaylistModal);
}
if (playlistModalSave) {
  playlistModalSave.addEventListener('click', savePlaylistModal);
}
if (playlistNameInput) {
  playlistNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') savePlaylistModal();
    if (e.key === 'Escape') closePlaylistModal();
  });
}

if (addToPlaylistClose) {
  addToPlaylistClose.addEventListener('click', closeAddToPlaylistModal);
}
if (modalBtnCreateInline) {
  modalBtnCreateInline.addEventListener('click', () => {
    state._pendingTrackForNewPlaylist = state.trackForPicker;
    closeAddToPlaylistModal();
    openPlaylistModal('create');
  });
}

if (playlistModal) {
  playlistModal.addEventListener('click', (e) => {
    if (e.target === playlistModal) closePlaylistModal();
  });
}
if (addToPlaylistModal) {
  addToPlaylistModal.addEventListener('click', (e) => {
    if (e.target === addToPlaylistModal) closeAddToPlaylistModal();
  });
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

function init() {
  // Apply saved volume
  applyVolume(state.volume);

  // Load saved playlists from localStorage (with auto-migration)
  state.playlists = loadPlaylists();
  try {
    const savedActiveId = localStorage.getItem(state.activePlaylistKey);
    if (savedActiveId && state.playlists.some(p => p.id === savedActiveId)) {
      state.activePlaylistId = savedActiveId;
    } else if (state.playlists.length > 0) {
      state.activePlaylistId = state.playlists[0].id;
    }
  } catch {}

  renderPlaylistsBar();
  updatePlaylistBadges();

  // Check URL hash for direct playlist view (e.g. player.html#playlist)
  if (window.location.hash === '#playlist') {
    switchTab('playlist');
  }

  // Disable prev/next until something plays
  btnPrev.disabled = true;
  btnNext.disabled = true;
  fpPrev.disabled  = true;
  fpNext.disabled  = true;

  // Enable prev/next once we have a queue
  audio.addEventListener('play', () => {
    const hasQueue = state.queue.length > 1;
    btnPrev.disabled = !hasQueue;
    btnNext.disabled = !hasQueue;
    fpPrev.disabled  = !hasQueue;
    fpNext.disabled  = !hasQueue;
  });

  // Safe image fallback listeners (no inline onerror needed)
  if (npArtwork) {
    npArtwork.addEventListener('error', () => {
      npArtwork.src = createArtworkFallback(300);
    });
  }
  if (fpArtwork) {
    fpArtwork.addEventListener('error', () => {
      fpArtwork.src = createArtworkFallback(52);
    });
  }

  // Load trending on startup
  loadTrending();

  // Restore recommendations from history if available
  const history = loadHistory();
  if (history.length > 0) {
    recTitle.textContent    = `Because you listened to ${history[0].artist.split(',')[0].trim()}`;
    recSubtitle.textContent = '';
    loadRecommendations(history[0]);
  }

  // Focus search input on load (after brief delay for page paint)
  setTimeout(() => searchInput.focus(), 300);
}

init();
