# Audio Therapy (audio.theraphy._) — Calming Music & Audio Wellness Platform

> *Quiet Minds. Louder Frequencies... Music that understands your mood.*

Audio Therapy is a modern, responsive music streaming and audio wellness web application and installable Progressive Web App (PWA). It provides high-fidelity music streaming across Indian regional and international languages, personalized mood-based recommendations, ambient relaxation soundscapes, synthesized frequencies, guided 4-7-8 breathing, and full personal user accounts with cloud/local synchronization.

---

## 🌟 Key Features & Capabilities

### 1. High-Fidelity Music Streaming & Playback Engine
- **320kbps High-Fidelity Audio**: Full-song playback powered by official JioSaavn Web API integration, with seamless Apple iTunes 30-second preview fallback.
- **Serverless Redirection Architecture**: `/api/audio` on Vercel delivers instant HTTP 302 redirects to signed CDN URLs, eliminating the 10-second serverless execution timeout on hobby tiers.
- **Centralized Playback Controller**: Protected by a generation counter (`_loadGen`) that completely prevents race conditions from rapid song switching.
- **Bounded Error Recovery**: Automatically detects broken audio streams, categorizes playback errors, retries with exponential backoff (capped at 5 attempts), and skips to the next playable track without getting stuck in infinite loops.
- **Media Session API**: Full lock-screen and wireless headset playback controls (play, pause, next, previous, seek) across iOS, Android, macOS, and Windows.

### 2. Intelligent Song Recommendations & Continuous Playback
- **Multi-Factor Recommendation Engine**: Scores tracks based on:
  - Exact language match (+50 points)
  - Artist similarity (+30 points)
  - Genre & mood congruence (+20 points)
  - Release year proximity (+10 points)
  - Penalty for recently played/skipped tracks (-40 points)
  - Heavy penalty for conflicting language (-100 points)
- **Continuous Listening**: Automatically refills the listening queue with matching songs when 3 or fewer tracks remain.
- **Deduplication Engine**: Suppresses both exact ID duplicates and normalized title/artist duplicates across all multi-track responses.

### 3. Strict Language Filtering
- **Prominent Language Chips**: Telugu, Hindi, Tamil, Malayalam, Kannada, Punjabi, English, and All.
- **Strict Enforcement**:
  - Direct searches automatically incorporate the target language hint.
  - Automatically sanitizes the active queue when switching languages, keeping only the currently playing song and matching language tracks.
  - Next-track recommendations and auto-refill strictly follow the chosen language.
  - User's preferred language is persisted in their personal account and synced across sessions.

### 4. Audio Therapy & Wellness Features
- **Nature Soundscapes**: Curated high-definition ambient tracks including *Gentle Rain on Leaves*, *Ocean Waves & Tide*, *Deep Forest Birds & Wind*, *Mountain River Stream*, *Midnight Piano Solitude*, and *Evening Campfire Crackle*.
- **Synthesized Ambient Noise Generator**: Uses the browser's Web Audio API to generate continuous, uninterrupted **Brown Noise** (deep rumble for sleep/ADHD focus), **Pink Noise** (natural waterfall frequency), and **White Noise** (full spectrum static).
- **Guided 4-7-8 Breathing**: Visual animated breathing circle with timed phases: Inhale (4s) → Hold (7s) → Exhale (8s) designed to reduce anxiety and calm the nervous system.
- **Mood-Based Listening**: Instant curated discovery for *Relaxed*, *Focus*, *Deep Sleep*, *Joy & Happy*, *Melancholy*, *Romantic*, *Energy & Gym*, and *Spiritual*.
- **Sleep Timer with Exponential Fade-Out**: Presets for 5, 10, 15, 30, 45, 60, and 90 minutes. Gently attenuates volume over the final 5 seconds before pausing to ensure peaceful sleep.

### 5. User Authentication & Personal Library
- **Dual-Mode Engine (`authService.js`)**:
  - **Supabase Cloud Mode**: Connects to Supabase Auth & PostgreSQL with Row Level Security (RLS) when configured.
  - **Standalone Secure Local Mode**: Out-of-the-box guest and multi-user storage with complete data isolation between accounts.
- **Personal Library**:
  - Unlimited custom named playlists (Create, Rename, Clear, Delete, Reorder).
  - Favorites with instant heart toggle across cards, mini-player, and expanded player.
  - Recently played listening history (capped at 50 tracks with clear history option).
- **Guest-to-Account Migration**: Automatically migrates local guest favorites and playlists when the user signs up or logs in.
- **Profile & Account Management**: Edit display name, change default language, sync guest library, sign out, and full account deletion with data cleanup.

### 6. Mobile-First Responsive UI/UX
- **Dual Player Interface**:
  - **Persistent Mini-Player**: Fixed above the bottom navigation bar; provides artwork, track info, favorite button, seekbar, play/pause, prev/next, and volume.
  - **Expanded Full-Screen Player**: Tap anywhere on the mini-player or now-playing artwork to open a full-screen mobile experience with high-resolution artwork, large seekbar, repeat/shuffle toggles, and Web Share API.
- **Mobile Bottom Navigation Bar**: One-tap access to *Explore*, *Audio Therapy*, *Library*, *Queue*, and *Account* on screens < 768px.
- **Viewport Safe-Area Inset Support**: Designed for iPhone notches, dynamic islands, and Android navigation bars using `env(safe-area-inset-bottom)`.

---

## 🚀 Running Locally

### Prerequisites
- Node.js (v18+ recommended) or Python 3.9+

### Option 1: Run with Node.js (Recommended)
```bash
# Clone the repository
git clone https://github.com/satvikreddy82/AudioTheraphyMusicPlayer.git
cd AudioTheraphyMusicPlayer

# Run the dev server
npm start
# or: node server.js
```
Then open **[http://localhost:5500](http://localhost:5500)** in your browser.

### Option 2: Run with Python
```bash
python server.py
```
Then open **[http://localhost:5500](http://localhost:5500)** in your browser.

---

## 🧪 Automated Testing

Audio Therapy includes a comprehensive automated test suite with 36 automated assertions verifying music recommendations, language filtering, auth isolation, guest migration, and playback recovery:

```bash
npm test
# or: node tests/test-suite.js
```

Test coverage includes:
- ✓ Curated fallback tracks integrity
- ✓ Title and artist deduplication logic
- ✓ Strict vs non-strict language filtering
- ✓ Multi-factor recommendation scoring (language, artist, genre, repeat penalties)
- ✓ User signup, duplicate rejection, and password validation
- ✓ Multi-user private data isolation (favorites & playlists)
- ✓ Guest-to-account library migration
- ✓ Wellness ambient sounds and mood preset queries
- ✓ Shuffle algorithm unplayed prioritization
- ✓ Bounded failure recovery simulation (skips max 5 times)
- ✓ Queue auto-refill threshold triggers

---

## ☁️ Supabase Cloud Database Configuration (Optional)

Audio Therapy runs out-of-the-box in standalone local mode. To enable cloud synchronization across multiple devices with Supabase:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Paste and run the entire script in [`supabase-schema.sql`](./supabase-schema.sql). This sets up:
   - `profiles` table with automatic user creation trigger
   - `user_preferences` table
   - `favorites` table
   - `playlists` and `playlist_tracks` tables
   - `listening_history` table
   - Row Level Security (RLS) policies guaranteeing strict data privacy between users.
4. Add your Supabase project URL and Anon Public Key to your app:
   - Create a global config in your HTML or set via browser console / settings:
   ```javascript
   window.AT_CONFIG = {
     supabaseUrl: 'https://your-project-id.supabase.co',
     supabaseAnonKey: 'your-anon-key'
   };
   ```
   Or store it in localStorage:
   ```javascript
   localStorage.setItem('at_supabase_config', JSON.stringify({
     supabaseUrl: 'https://your-project-id.supabase.co',
     supabaseAnonKey: 'your-anon-key'
   }));
   ```

---

## 🚢 Deployment to Vercel

The repository is configured for deployment on Vercel:

1. Push your repository to GitHub.
2. Import the project into Vercel.
3. Build command: `node build.js`
4. Output directory: `public` (or root with serverless functions in `/api/`)
5. The `vercel.json` file handles:
   - Clean URLs & rewrites (`/player` → `/player.html`)
   - Strict Content Security Policy (CSP) including `saavncdn.com`, `itunes.apple.com`, `actions.google.com`, and `supabase.co`
   - Strict Transport Security, X-Frame-Options, and Cache-Control headers
   - Serverless functions in `api/saavn.js` and `api/audio.js`

---

## 📁 Repository Structure

```
.
├── api/
│   ├── audio.js               # Vercel serverless redirect for JioSaavn CDN audio
│   └── saavn.js               # Vercel serverless proxy with SSRF protection
├── assets/                    # Artwork, logos & branding assets
├── icons/                     # PWA icons (192px, 512px, maskable)
├── webfonts/                  # Font Awesome icon fonts
├── tests/
│   └── test-suite.js          # Automated test runner (36 assertions)
├── authService.js             # Authentication, session & personal library engine
├── build.js                   # Build script syncing root assets to public/
├── index.html                 # Brand landing page with audio therapy spotlight
├── manifest.webmanifest       # PWA manifest
├── musicService.js            # JioSaavn & iTunes music API adapter
├── package.json               # NPM scripts & metadata
├── player.css                 # Responsive design tokens, glassmorphism & mobile styles
├── player.html                # Unified music & audio therapy web application
├── player.js                  # Central player controller & playback state machine
├── public/                    # Production distribution bundle
├── pwa.js                     # Progressive Web App installer & offline controller
├── server.js                  # Node.js dev server with audio/API proxying
├── server.py                  # Python dev server with audio/API proxying
├── style.css                  # Landing page stylesheet
├── supabase-schema.sql        # Supabase PostgreSQL schema with RLS policies
├── sw.js                      # Service Worker with intelligent app shell caching
├── vercel.json                # Vercel deployment & security headers configuration
└── wellnessService.js         # Soundscapes, noise generator & mood presets
```

---

## 🔒 Security & Privacy

- **SSRF Protection**: All server endpoints (`server.js`, `server.py`, `api/saavn.js`, `api/audio.js`) validate URLs against strict allowlists of JioSaavn and Saavn CDN hostnames, blocking local/private IPs and cloud metadata addresses.
- **Row Level Security (RLS)**: Database policies in `supabase-schema.sql` restrict reads, inserts, updates, and deletions so users can only ever access their own data.
- **Client Security**: No private keys or service roles are exposed to the client.
- **Health Disclaimer**: Audio Therapy features are designed for mindfulness, focus, relaxation, and sleep support and are not medical treatments.

---

## 📜 License
MIT License. Created with ♡ for Audio Therapy.
