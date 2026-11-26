/**
 * authService.js — Audio Therapy User Authentication & Personal Library
 *
 * Implements a dual-mode authentication & cloud/local persistence engine:
 * 1. Supabase Cloud Mode: When Supabase URL & Anon Key are configured in
 *    window.AT_CONFIG or localStorage('at_supabase_config'), connects directly
 *    to Supabase Auth and PostgreSQL with Row Level Security.
 * 2. Standalone Secure Local Mode: Works immediately out-of-the-box without
 *    any external setup! Stores accounts, sessions, favorites, custom playlists,
 *    listening history, and preferences with multi-account isolation.
 * 3. Guest-to-Account Migration: Automatically imports guest favorites and playlists
 *    when a user registers or logs in.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.authService = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Storage keys for local mode
  const KEYS = {
    CURRENT_USER: 'at_auth_current_user',
    ACCOUNTS: 'at_auth_accounts_db',
    GUEST_FAVORITES: 'at_guest_favorites',
    GUEST_PLAYLISTS: 'audiotheraphy_playlists_v2',
    GUEST_HISTORY: 'at_history',
    GUEST_PREFERENCES: 'at_preferences',
    SUPABASE_CONFIG: 'at_supabase_config',
  };

  // State
  let _currentUser = null;
  let _authListeners = [];

  // Safe storage wrapper
  const _memStorage = {};
  const storageApi = {
    getItem: (key) => {
      try {
        if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
      } catch (e) {}
      return _memStorage[key] || null;
    },
    setItem: (key, val) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, val);
          return;
        }
      } catch (e) {}
      _memStorage[key] = String(val);
    },
    removeItem: (key) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
          return;
        }
      } catch (e) {}
      delete _memStorage[key];
    },
  };

  // Helper: Read JSON from storage
  function getJson(key, defaultValue) {
    try {
      const item = storageApi.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  // Helper: Save JSON to storage
  function setJson(key, value) {
    try {
      storageApi.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[AuthService] Storage write failed:', e);
      return false;
    }
  }

  // Simple string hash (for demo password hashing in local mode)
  function hashPassword(pwd) {
    let hash = 0;
    const str = 'at_salt_' + pwd;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(36) + '_' + pwd.length;
  }

  // Generate unique ID
  function uid(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // Get user-scoped storage key
  function userKey(baseKey, userId) {
    return userId ? `${baseKey}_user_${userId}` : baseKey;
  }

  // Notify auth state subscribers
  function notifyAuth(user) {
    _currentUser = user;
    if (user) {
      setJson(KEYS.CURRENT_USER, user);
    } else {
      storageApi.removeItem(KEYS.CURRENT_USER);
    }
    _authListeners.forEach((fn) => {
      try {
        fn(user);
      } catch (err) {
        console.error('[AuthService] Listener error:', err);
      }
    });
  }

  // ─────────────────────────────────────────────
  //  SUPABASE CLIENT (Optional Cloud Mode)
  // ─────────────────────────────────────────────
  function getSupabaseConfig() {
    if (typeof window !== 'undefined' && window.AT_CONFIG?.supabaseUrl && window.AT_CONFIG?.supabaseAnonKey) {
      return window.AT_CONFIG;
    }
    return getJson(KEYS.SUPABASE_CONFIG, null);
  }

  function isSupabaseConfigured() {
    const cfg = getSupabaseConfig();
    return !!(cfg && cfg.supabaseUrl && cfg.supabaseAnonKey && typeof window !== 'undefined' && window.supabase);
  }

  function getSupabaseClient() {
    if (!isSupabaseConfigured()) return null;
    if (!window._supabaseClientInstance) {
      const cfg = getSupabaseConfig();
      window._supabaseClientInstance = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
    return window._supabaseClientInstance;
  }

  // ─────────────────────────────────────────────
  //  CORE AUTH METHODS
  // ─────────────────────────────────────────────

  /**
   * Initialize Auth Service
   */
  function init() {
    // Check if user is already logged in
    const saved = getJson(KEYS.CURRENT_USER, null);
    if (saved) {
      _currentUser = saved;
    }

    // If Supabase is active, listen to its auth changes
    const sb = getSupabaseClient();
    if (sb) {
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const user = {
            id: session.user.id,
            email: session.user.email,
            displayName: session.user.user_metadata?.display_name || session.user.email.split('@')[0],
            preferredLanguage: session.user.user_metadata?.preferred_language || 'all',
            provider: 'supabase',
          };
          notifyAuth(user);
        }
      });

      sb.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          const user = {
            id: session.user.id,
            email: session.user.email,
            displayName: session.user.user_metadata?.display_name || session.user.email.split('@')[0],
            preferredLanguage: session.user.user_metadata?.preferred_language || 'all',
            provider: 'supabase',
          };
          notifyAuth(user);
        } else if (event === 'SIGNED_OUT') {
          notifyAuth(null);
        }
      });
    }

    return _currentUser;
  }

  /**
   * Subscribe to auth state changes
   */
  function onAuthStateChange(callback) {
    if (typeof callback === 'function') {
      _authListeners.push(callback);
      // Immediately invoke with current state
      callback(_currentUser);
    }
    return () => {
      _authListeners = _authListeners.filter((fn) => fn !== callback);
    };
  }

  /**
   * Sign Up
   */
  async function signUp(email, password, displayName = '') {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (displayName || '').trim() || cleanEmail.split('@')[0];

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    // Try Supabase if available
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            display_name: cleanName,
            preferred_language: 'all',
          },
        },
      });
      if (error) throw error;
      const user = {
        id: data.user.id,
        email: data.user.email,
        displayName: cleanName,
        preferredLanguage: 'all',
        provider: 'supabase',
      };
      notifyAuth(user);
      migrateGuestData(user.id);
      return user;
    }

    // Standalone Local Mode
    const accounts = getJson(KEYS.ACCOUNTS, []);
    const existing = accounts.find((a) => a.email === cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const newUser = {
      id: uid('usr'),
      email: cleanEmail,
      passwordHash: hashPassword(password),
      displayName: cleanName,
      preferredLanguage: 'all',
      createdAt: new Date().toISOString(),
      provider: 'local',
    };

    accounts.push(newUser);
    setJson(KEYS.ACCOUNTS, accounts);

    const sessionUser = {
      id: newUser.id,
      email: newUser.email,
      displayName: newUser.displayName,
      preferredLanguage: newUser.preferredLanguage,
      provider: 'local',
    };

    notifyAuth(sessionUser);

    // Auto-migrate any guest favorites or playlists into the new account
    migrateGuestData(sessionUser.id);

    return sessionUser;
  }

  /**
   * Sign In
   */
  async function signIn(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error('Please enter both email and password.');
    }

    // Try Supabase if available
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;
      const user = {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata?.display_name || cleanEmail.split('@')[0],
        preferredLanguage: data.user.user_metadata?.preferred_language || 'all',
        provider: 'supabase',
      };
      notifyAuth(user);
      return user;
    }

    // Standalone Local Mode
    const accounts = getJson(KEYS.ACCOUNTS, []);
    const account = accounts.find((a) => a.email === cleanEmail);
    if (!account) {
      throw new Error('No account found with this email address.');
    }

    if (account.passwordHash !== hashPassword(password)) {
      throw new Error('Incorrect password. Please try again.');
    }

    const sessionUser = {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      preferredLanguage: account.preferredLanguage || 'all',
      provider: 'local',
    };

    notifyAuth(sessionUser);
    return sessionUser;
  }

  /**
   * Sign Out
   */
  async function signOut() {
    const sb = getSupabaseClient();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch (e) {
        console.warn('[AuthService] Supabase signout error:', e);
      }
    }
    notifyAuth(null);
  }

  /**
   * Get Current User (or null if guest)
   */
  function getCurrentUser() {
    return _currentUser;
  }

  /**
   * Update Profile
   */
  async function updateProfile(updates = {}) {
    if (!_currentUser) throw new Error('Must be signed in to update profile.');

    const newName = updates.displayName ? updates.displayName.trim() : _currentUser.displayName;
    const newLang = updates.preferredLanguage || _currentUser.preferredLanguage;

    _currentUser.displayName = newName;
    _currentUser.preferredLanguage = newLang;

    // Update in local accounts list
    const accounts = getJson(KEYS.ACCOUNTS, []);
    const idx = accounts.findIndex((a) => a.id === _currentUser.id);
    if (idx >= 0) {
      accounts[idx].displayName = newName;
      accounts[idx].preferredLanguage = newLang;
      setJson(KEYS.ACCOUNTS, accounts);
    }

    // Update in Supabase if active
    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.updateUser({
        data: {
          display_name: newName,
          preferred_language: newLang,
        },
      });
    }

    notifyAuth(_currentUser);
    return _currentUser;
  }

  /**
   * Delete Account
   */
  async function deleteAccount() {
    if (!_currentUser) return;
    const userId = _currentUser.id;

    // Remove user library data
    storageApi.removeItem(userKey('at_favorites', userId));
    storageApi.removeItem(userKey('at_playlists', userId));
    storageApi.removeItem(userKey('at_history', userId));
    storageApi.removeItem(userKey('at_preferences', userId));

    // Remove from local accounts db
    const accounts = getJson(KEYS.ACCOUNTS, []).filter((a) => a.id !== userId);
    setJson(KEYS.ACCOUNTS, accounts);

    await signOut();
  }

  // ─────────────────────────────────────────────
  //  PERSONAL USER LIBRARY (FAVORITES)
  // ─────────────────────────────────────────────

  function getFavorites() {
    const key = _currentUser ? userKey('at_favorites', _currentUser.id) : KEYS.GUEST_FAVORITES;
    return getJson(key, []);
  }

  function isFavorite(trackId) {
    if (!trackId) return false;
    const favs = getFavorites();
    return favs.some((t) => String(t.id) === String(trackId));
  }

  function addFavorite(track) {
    if (!track || !track.id) return;
    const key = _currentUser ? userKey('at_favorites', _currentUser.id) : KEYS.GUEST_FAVORITES;
    let favs = getJson(key, []);
    if (!favs.some((t) => String(t.id) === String(track.id))) {
      // Save sanitized track metadata
      const cleanTrack = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        artworkUrl: track.artworkUrl || track.thumbnailUrl || '',
        thumbnailUrl: track.thumbnailUrl || '',
        durationMs: track.durationMs || 0,
        isFullSong: track.isFullSong !== false,
        encryptedUrl: track.encryptedUrl || '',
        previewUrl: track.previewUrl || null,
        language: track.language || 'unknown',
        genre: track.genre || '',
        provider: track.provider || 'jiosaavn',
        savedAt: new Date().toISOString(),
      };
      favs.unshift(cleanTrack);
      setJson(key, favs);
    }
  }

  function removeFavorite(trackId) {
    if (!trackId) return;
    const key = _currentUser ? userKey('at_favorites', _currentUser.id) : KEYS.GUEST_FAVORITES;
    let favs = getJson(key, []);
    favs = favs.filter((t) => String(t.id) !== String(trackId));
    setJson(key, favs);
  }

  function toggleFavorite(track) {
    if (!track) return false;
    if (isFavorite(track.id)) {
      removeFavorite(track.id);
      return false;
    } else {
      addFavorite(track);
      return true;
    }
  }

  // ─────────────────────────────────────────────
  //  USER PLAYLISTS
  // ─────────────────────────────────────────────

  function getPlaylists() {
    const key = _currentUser ? userKey('at_playlists', _currentUser.id) : KEYS.GUEST_PLAYLISTS;
    const list = getJson(key, null);
    if (list && Array.isArray(list) && list.length > 0) return list;

    // Default playlist if empty
    const defaultList = [
      {
        id: 'pl_default',
        name: 'My Playlist',
        description: 'Your favorite curated tracks',
        createdAt: Date.now(),
        tracks: [],
      },
    ];
    setJson(key, defaultList);
    return defaultList;
  }

  function savePlaylists(playlists) {
    const key = _currentUser ? userKey('at_playlists', _currentUser.id) : KEYS.GUEST_PLAYLISTS;
    setJson(key, playlists);
  }

  function createPlaylist(name, description = '') {
    const playlists = getPlaylists();
    const cleanName = (name || '').trim() || `Playlist ${playlists.length + 1}`;
    const newPl = {
      id: uid('pl'),
      name: cleanName,
      description: description.trim(),
      createdAt: Date.now(),
      tracks: [],
    };
    playlists.push(newPl);
    savePlaylists(playlists);
    return newPl;
  }

  function renamePlaylist(id, newName) {
    const playlists = getPlaylists();
    const pl = playlists.find((p) => p.id === id);
    if (!pl) return null;
    pl.name = (newName || '').trim() || pl.name;
    savePlaylists(playlists);
    return pl;
  }

  function deletePlaylist(id) {
    let playlists = getPlaylists();
    if (playlists.length <= 1) return false; // Keep at least one
    playlists = playlists.filter((p) => p.id !== id);
    savePlaylists(playlists);
    return true;
  }

  function addTrackToPlaylist(playlistId, track) {
    const playlists = getPlaylists();
    const pl = playlists.find((p) => p.id === playlistId) || playlists[0];
    if (!pl || !track) return false;

    if (!pl.tracks.some((t) => String(t.id) === String(track.id))) {
      const cleanTrack = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        artworkUrl: track.artworkUrl || track.thumbnailUrl || '',
        thumbnailUrl: track.thumbnailUrl || '',
        durationMs: track.durationMs || 0,
        isFullSong: track.isFullSong !== false,
        encryptedUrl: track.encryptedUrl || '',
        previewUrl: track.previewUrl || null,
        language: track.language || 'unknown',
        genre: track.genre || '',
        provider: track.provider || 'jiosaavn',
        addedAt: Date.now(),
      };
      pl.tracks.unshift(cleanTrack);
      savePlaylists(playlists);
      return true;
    }
    return false;
  }

  function removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = getPlaylists();
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return false;
    pl.tracks = pl.tracks.filter((t) => String(t.id) !== String(trackId));
    savePlaylists(playlists);
    return true;
  }

  // ─────────────────────────────────────────────
  //  LISTENING HISTORY
  // ─────────────────────────────────────────────

  function getHistory() {
    const key = _currentUser ? userKey('at_history', _currentUser.id) : KEYS.GUEST_HISTORY;
    return getJson(key, []);
  }

  function addToHistory(track) {
    if (!track || !track.id) return;
    const key = _currentUser ? userKey('at_history', _currentUser.id) : KEYS.GUEST_HISTORY;
    let history = getJson(key, []);
    history = history.filter((t) => String(t.id) !== String(track.id));
    history.unshift({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      artworkUrl: track.artworkUrl || track.thumbnailUrl || '',
      thumbnailUrl: track.thumbnailUrl || '',
      language: track.language || 'unknown',
      durationMs: track.durationMs || 0,
      playedAt: new Date().toISOString(),
    });
    // Keep max 50 recent songs
    history = history.slice(0, 50);
    setJson(key, history);
  }

  function clearHistory() {
    const key = _currentUser ? userKey('at_history', _currentUser.id) : KEYS.GUEST_HISTORY;
    setJson(key, []);
  }

  // ─────────────────────────────────────────────
  //  GUEST-TO-ACCOUNT MIGRATION
  // ─────────────────────────────────────────────

  function migrateGuestData(userId) {
    if (!userId) return;

    // Migrate Guest Favorites
    const guestFavs = getJson(KEYS.GUEST_FAVORITES, []);
    if (guestFavs.length > 0) {
      const uFavKey = userKey('at_favorites', userId);
      const userFavs = getJson(uFavKey, []);
      const mergedFavs = [...userFavs];
      guestFavs.forEach((gt) => {
        if (!mergedFavs.some((ut) => String(ut.id) === String(gt.id))) {
          mergedFavs.push(gt);
        }
      });
      setJson(uFavKey, mergedFavs);
    }

    // Migrate Guest Playlists
    const guestPlaylists = getJson(KEYS.GUEST_PLAYLISTS, []);
    if (guestPlaylists.length > 0) {
      const uPlKey = userKey('at_playlists', userId);
      const userPlaylists = getJson(uPlKey, []);
      const mergedPlaylists = [...userPlaylists];
      guestPlaylists.forEach((gp) => {
        const existing = mergedPlaylists.find((up) => up.name === gp.name);
        if (!existing) {
          mergedPlaylists.push(gp);
        } else {
          // Merge tracks into existing playlist
          gp.tracks.forEach((gt) => {
            if (!existing.tracks.some((et) => String(et.id) === String(gt.id))) {
              existing.tracks.push(gt);
            }
          });
        }
      });
      setJson(uPlKey, mergedPlaylists);
    }

    // Migrate Guest History
    const guestHist = getJson(KEYS.GUEST_HISTORY, []);
    if (guestHist.length > 0) {
      const uHistKey = userKey('at_history', userId);
      const userHist = getJson(uHistKey, []);
      const mergedHist = [...guestHist, ...userHist].slice(0, 50);
      setJson(uHistKey, mergedHist);
    }
  }

  // Auto-init on load
  init();

  return {
    init,
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    onAuthStateChange,
    updateProfile,
    deleteAccount,
    getFavorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    getPlaylists,
    savePlaylists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    getHistory,
    addToHistory,
    clearHistory,
    migrateGuestData,
    isSupabaseConfigured,
  };
});
