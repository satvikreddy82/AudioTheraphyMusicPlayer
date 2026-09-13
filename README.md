# Audio Theraphy — Music Player (PWA)

> Quiet Minds. Louder Frequencies... Music that understands your mood.

Audio Theraphy is a modern, responsive music streaming and discovery web application converted into a production-ready **Progressive Web App (PWA)** installable on Android, desktop, and iOS.

---

## 🌟 Key Features

- 🎵 **Full-Song Playback (320kbps High Fidelity)**: High-quality audio streams powered by official streaming API integration with range seeking support.
- 📱 **Progressive Web App (PWA)**: Installable natively on Android and desktop with standalone display mode, custom app icon, and offline app shell caching.
- 📑 **Custom Named Playlists**:
  - Create and name unlimited custom playlists.
  - Rename any playlist with one click or by clicking the title.
  - Delete unwanted playlists safely.
  - Multi-playlist song picker modal to organize tracks.
- 🔍 **Universal Search & Language Filters**: Instant music search supporting Hindi, Telugu, Tamil, Punjabi, Malayalam, Kannada, English, and more.
- 🎨 **Sleek Glassmorphism UI**: Dark mode purple neon glassmorphism aesthetics, responsive mobile navigation, volume controls, and real-time audio progress bar.

---

## 🚀 Getting Started

### Option 1: Run with Node.js (Recommended)
```bash
npm start
# or: node server.js
```

### Option 2: Run with Python
```bash
python server.py
```

Then open **[http://localhost:5500](http://localhost:5500)** in your browser.

---

## 📱 Installing on Android

1. Open Chrome on Android and visit the deployed app URL or your local network IP (e.g., `http://192.168.x.x:5500`).
2. Tap the **"Install"** button in the top navigation bar.
3. Audio Theraphy will be installed as a native app on your phone's home screen.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla Glassmorphism), Modern JavaScript (ES6+)
- **Service Worker**: PWA caching shell, Network-only audio streaming bypass
- **Backend / Streaming Proxy**: Node.js (`server.js`) & Python (`server.py`), Serverless Vercel endpoints (`/api`)
