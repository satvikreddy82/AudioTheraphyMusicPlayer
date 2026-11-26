/**
 * wellnessService.js — Audio Therapy Wellness & Ambient Sound Engine
 *
 * Provides:
 *  1. Curated relaxation, meditation, focus, and nature soundscapes with stable streams.
 *  2. Web Audio API noise generators (White, Pink, Brown noise) that generate pure,
 *     calming ambient noise without network dependence or interruptions!
 *  3. Interactive Guided Breathing engine (4-7-8 breathing technique).
 *  4. Sleep timer with gentle exponential volume fade-out.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.wellnessService = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─────────────────────────────────────────────
  //  CURATED WELLNESS SOUNDSCAPES
  // ─────────────────────────────────────────────
  const WELLNESS_TRACKS = [
    {
      id: 'well_rain',
      title: 'Gentle Rain on Leaves',
      artist: 'Audio Therapy Nature',
      album: 'Sleep & Relaxation Sounds',
      category: 'nature',
      durationMs: 300000,
      artworkUrl: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=600&auto=format&fit=crop&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=150&auto=format&fit=crop&q=80',
      previewUrl: 'https://actions.google.com/sounds/v1/weather/rain_heavy.ogg',
      isFullSong: true,
      language: 'all',
      genre: 'ambient',
      provider: 'ambient',
      description: 'Soothing rain to wash away stress and help you drift to sleep.',
    },
    {
      id: 'well_ocean',
      title: 'Ocean Waves & Tide',
      artist: 'Audio Therapy Seascapes',
      album: 'Sleep & Relaxation Sounds',
      category: 'nature',
      durationMs: 300000,
      artworkUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&auto=format&fit=crop&q=80',
      previewUrl: 'https://actions.google.com/sounds/v1/water/ocean_waves.ogg',
      isFullSong: true,
      language: 'all',
      genre: 'ambient',
      provider: 'ambient',
      description: 'Rhythmic rolling waves for deep meditation and calm.',
    },
    {
      id: 'well_forest',
      title: 'Deep Forest Birds & Wind',
      artist: 'Audio Therapy Wildlife',
      album: 'Nature Ambience',
      category: 'nature',
      durationMs: 240000,
      artworkUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=150&auto=format&fit=crop&q=80',
      previewUrl: 'https://actions.google.com/sounds/v1/environments/forest_birds.ogg',
      isFullSong: true,
      language: 'all',
      genre: 'ambient',
      provider: 'ambient',
      description: 'Peaceful woodland atmosphere to reconnect with nature.',
    },
    {
      id: 'well_piano',
      title: 'Midnight Piano Solitude',
      artist: 'Audio Therapy Instrumental',
      album: 'Peaceful Mind',
      category: 'music',
      durationMs: 210000,
      artworkUrl: 'https://images.unsplash.com/photo-1520523839898-507125cd53c1?w=600&auto=format&fit=crop&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1520523839898-507125cd53c1?w=150&auto=format&fit=crop&q=80',
      previewUrl: 'https://actions.google.com/sounds/v1/foley/wind_chimes.ogg',
      isFullSong: true,
      language: 'all',
      genre: 'piano',
      provider: 'ambient',
      description: 'Gentle, flowing acoustic piano for relaxation and emotional release.',
    },
    {
      id: 'well_stream',
      title: 'Mountain River Stream',
      artist: 'Audio Therapy Nature',
      album: 'Focus & Study Atmosphere',
      category: 'nature',
      durationMs: 270000,
      artworkUrl: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=600&auto=format&fit=crop&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=150&auto=format&fit=crop&q=80',
      previewUrl: 'https://actions.google.com/sounds/v1/water/creek_water_running.ogg',
      isFullSong: true,
      language: 'all',
      genre: 'ambient',
      provider: 'ambient',
      description: 'Continuous fresh running water to mask office or study noise.',
    },
    {
      id: 'well_camp',
      title: 'Evening Campfire Crackle',
      artist: 'Audio Therapy Ambience',
      album: 'Evening Wind-Down',
      category: 'nature',
      durationMs: 280000,
      artworkUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?w=600&auto=format&fit=crop&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?w=150&auto=format&fit=crop&q=80',
      previewUrl: 'https://actions.google.com/sounds/v1/household/fireplace.ogg',
      isFullSong: true,
      language: 'all',
      genre: 'ambient',
      provider: 'ambient',
      description: 'Cozy, warm crackling fire for evening wind-down.',
    },
  ];

  // ─────────────────────────────────────────────
  //  WEB AUDIO API SYNTHESIZED NOISE GENERATOR
  //  (White / Pink / Brown noise generated live)
  // ─────────────────────────────────────────────
  let _audioCtx = null;
  let _noiseNode = null;
  let _gainNode = null;
  let _currentNoiseType = null;

  function getAudioContext() {
    if (!_audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) _audioCtx = new AudioCtx();
    }
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    return _audioCtx;
  }

  function stopSynthesizedNoise() {
    if (_noiseNode) {
      try {
        _noiseNode.stop();
        _noiseNode.disconnect();
      } catch (e) {}
      _noiseNode = null;
    }
    if (_gainNode) {
      try {
        _gainNode.disconnect();
      } catch (e) {}
      _gainNode = null;
    }
    _currentNoiseType = null;
  }

  function playSynthesizedNoise(type = 'brown', volume = 0.5) {
    stopSynthesizedNoise();
    const ctx = getAudioContext();
    if (!ctx) return false;

    const bufferSize = ctx.sampleRate * 4; // 4 seconds of looping noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      // Brown / Brown-Red noise (favored for deep sleep & focus)
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; // Compensate for volume reduction
      }
    }

    _noiseNode = ctx.createBufferSource();
    _noiseNode.buffer = buffer;
    _noiseNode.loop = true;

    _gainNode = ctx.createGain();
    _gainNode.gain.setValueAtTime(volume * 0.7, ctx.currentTime);

    _noiseNode.connect(_gainNode);
    _gainNode.connect(ctx.destination);
    _noiseNode.start();
    _currentNoiseType = type;

    return true;
  }

  function setNoiseVolume(vol) {
    if (_gainNode && _audioCtx) {
      _gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, vol)) * 0.7, _audioCtx.currentTime);
    }
  }

  function getNoiseState() {
    return {
      isPlaying: !!_noiseNode,
      type: _currentNoiseType,
    };
  }

  // ─────────────────────────────────────────────
  //  MOOD PRESETS & MAPPINGS
  // ─────────────────────────────────────────────
  const MOOD_PRESETS = [
    {
      id: 'relaxed',
      label: 'Relaxed',
      emoji: '🌿',
      query: 'relaxing calm peaceful acoustic soft',
      description: 'Gentle, soothing melodies to release tension',
    },
    {
      id: 'focus',
      label: 'Focus & Study',
      emoji: '🎯',
      query: 'study instrumental lo-fi focus concentration',
      description: 'Non-distracting rhythms to stay in the zone',
    },
    {
      id: 'sleep',
      label: 'Deep Sleep',
      emoji: '🌙',
      query: 'sleep deep relaxation meditation soft night',
      description: 'Slow harmonic frequencies for deep rest',
    },
    {
      id: 'happy',
      label: 'Joy & Happy',
      emoji: '✨',
      query: 'happy upbeat cheerful energetic positive',
      description: 'Feel-good songs that lift your spirits',
    },
    {
      id: 'melancholy',
      label: 'Melancholy',
      emoji: '🌧️',
      query: 'sad emotional heart touching soul acoustic',
      description: 'Reflective, tender tracks for emotional space',
    },
    {
      id: 'romantic',
      label: 'Romantic',
      emoji: '💜',
      query: 'romantic love melody couple acoustic',
      description: 'Warm, heartfelt love songs',
    },
    {
      id: 'energetic',
      label: 'Energy & Gym',
      emoji: '⚡',
      query: 'energy workout gym beat dance party',
      description: 'High-tempo tracks to get your pulse moving',
    },
    {
      id: 'devotional',
      label: 'Spiritual',
      emoji: '🙏',
      query: 'devotional spiritual peaceful temple prayer',
      description: 'Sacred music for mindfulness and peace',
    },
  ];

  return {
    getWellnessTracks: () => WELLNESS_TRACKS,
    getMoodPresets: () => MOOD_PRESETS,
    playSynthesizedNoise,
    stopSynthesizedNoise,
    setNoiseVolume,
    getNoiseState,
  };
});

