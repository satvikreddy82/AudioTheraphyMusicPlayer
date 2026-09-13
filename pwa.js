/**
 * pwa.js — Audio Theraphy Progressive Web App Controller
 *
 * • Service Worker lifecycle management & auto-registration
 * • Native Android beforeinstallprompt handling & UI controls
 * • Standalone mode detection & installed state handling
 * • Real-time Online / Offline status notification banner
 */

'use strict';

(function () {
  let deferredPrompt = null;

  // Check if currently running as an installed PWA
  const isStandalone = () => {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true
    );
  };

  // ─────────────────────────────────────────────
  //  1. SERVICE WORKER REGISTRATION
  // ─────────────────────────────────────────────
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Workers not supported in this browser.');
      return;
    }

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[PWA] ServiceWorker registered with scope:', registration.scope);
        // Prompt immediate update check
        registration.update().catch(() => {});

        // Check for service worker updates periodically
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New update available.');
              }
            });
          }
        });
      } catch (error) {
        console.warn('[PWA] ServiceWorker registration failed:', error);
      }
    });
  }

  // ─────────────────────────────────────────────
  //  2. INSTALL PROMPT HANDLING
  // ─────────────────────────────────────────────
  function initInstallPrompt() {
    const installBtns = document.querySelectorAll('.pwa-install-btn');
    const installBanner = document.getElementById('pwa-install-banner');
    const bannerCloseBtn = document.getElementById('pwa-banner-close');

    // If already running in standalone mode, ensure all install UI is hidden
    if (isStandalone()) {
      installBtns.forEach(btn => btn.style.display = 'none');
      if (installBanner) installBanner.style.display = 'none';
      return;
    }

    // Capture the browser's install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      deferredPrompt = e;

      // Show our custom, elegant install buttons
      installBtns.forEach(btn => {
        btn.classList.add('visible');
        btn.removeAttribute('hidden');
        btn.style.display = 'inline-flex';
      });

      // Show install banner once per session if not dismissed
      const dismissed = sessionStorage.getItem('at_pwa_banner_dismissed');
      if (installBanner && !dismissed) {
        installBanner.classList.add('visible');
        installBanner.removeAttribute('hidden');
      }
    });

    // Handle install button click (works for both navbar button and banner button)
    const handleInstallClick = async () => {
      if (!deferredPrompt) return;

      // Show browser installation dialog
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      console.log('[PWA] User choice:', choice.outcome);

      // Clean up prompt
      deferredPrompt = null;
      hideInstallUI();
    };

    installBtns.forEach(btn => {
      btn.addEventListener('click', handleInstallClick);
    });

    if (bannerCloseBtn && installBanner) {
      bannerCloseBtn.addEventListener('click', () => {
        installBanner.classList.remove('visible');
        installBanner.setAttribute('hidden', '');
        sessionStorage.setItem('at_pwa_banner_dismissed', 'true');
      });
    }

    // When the app is installed, dismiss UI
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App successfully installed!');
      deferredPrompt = null;
      hideInstallUI();
    });
  }

  function hideInstallUI() {
    const installBtns = document.querySelectorAll('.pwa-install-btn');
    const installBanner = document.getElementById('pwa-install-banner');

    installBtns.forEach(btn => {
      btn.classList.remove('visible');
      btn.setAttribute('hidden', '');
      btn.style.display = 'none';
    });

    if (installBanner) {
      installBanner.classList.remove('visible');
      installBanner.setAttribute('hidden', '');
    }
  }

  // ─────────────────────────────────────────────
  //  3. NETWORK STATUS MONITOR (Online / Offline Toast)
  // ─────────────────────────────────────────────
  function initNetworkStatus() {
    let toast = document.getElementById('pwa-network-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pwa-network-toast';
      toast.className = 'pwa-network-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    let hideTimeout = null;

    const showToast = (message, isOffline = false, durationMs = 4000) => {
      if (hideTimeout) clearTimeout(hideTimeout);
      toast.innerHTML = message;
      toast.classList.toggle('offline', isOffline);
      toast.classList.add('visible');

      if (durationMs > 0) {
        hideTimeout = setTimeout(() => {
          toast.classList.remove('visible');
        }, durationMs);
      }
    };

    window.addEventListener('offline', () => {
      showToast(
        '<i class="fa-solid fa-wifi-slash"></i> <span>You are offline. Saved playlist and cached pages remain accessible.</span>',
        true,
        0 // Keep visible until back online
      );
    });

    window.addEventListener('online', () => {
      showToast(
        '<i class="fa-solid fa-wifi"></i> <span>Back online. Music search restored.</span>',
        false,
        3500
      );
    });

    // Check initial status on load
    if (!navigator.onLine) {
      showToast(
        '<i class="fa-solid fa-wifi-slash"></i> <span>You are offline. Saved playlist and cached pages remain accessible.</span>',
        true,
        0
      );
    }
  }

  // ─────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────
  registerServiceWorker();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initInstallPrompt();
      initNetworkStatus();
    });
  } else {
    initInstallPrompt();
    initNetworkStatus();
  }
})();
