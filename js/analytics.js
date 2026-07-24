/**
 * CreatorLoop™ Analytics Engine
 * Provider-agnostic event tracking system
 *
 * Architecture:
 * - All events go through CL.track() — one call, all providers fire
 * - Add new providers by registering them in CL.providers
 * - No rewriting needed when adding GA4, Plausible, Mixpanel, etc.
 *
 * Providers supported out of the box:
 * - Cloudflare Web Analytics (auto-injected via Pages)
 * - Google Analytics 4 (activate by setting CL_CONFIG.ga4Id)
 * - Plausible (activate by setting CL_CONFIG.plausibleDomain)
 * - Console (always active in dev, silent in prod)
 * - localStorage (always active — stores event history for debugging)
 *
 * To add a new provider later:
 *   CL.registerProvider('myProvider', (name, props) => { ... });
 */

(function () {
  'use strict';

  // ─── Configuration ─────────────────────────────────────────────────────────
  // Set these values in a <script> block BEFORE loading analytics.js
  // Example: <script>window.CL_CONFIG = { ga4Id: 'G-XXXXXXXXXX' };</script>
  const config = window.CL_CONFIG || {};

  const CL = {
    providers: {},
    sessionId: generateSessionId(),
    pageLoadTime: Date.now(),

    // ─── Register a provider ────────────────────────────────────────────────
    registerProvider(name, fn) {
      this.providers[name] = fn;
    },

    // ─── Fire an event to all registered providers ──────────────────────────
    track(eventName, properties) {
      const enriched = {
        ...properties,
        page: window.location.pathname,
        referrer: document.referrer || 'direct',
        session_id: this.sessionId,
        timestamp: new Date().toISOString(),
      };

      Object.entries(this.providers).forEach(([name, fn]) => {
        try {
          fn(eventName, enriched);
        } catch (e) {
          console.warn('[CL Analytics] Provider error:', name, e);
        }
      });
    },

    // ─── Page view ──────────────────────────────────────────────────────────
    pageView(pageName) {
      this.track('page_view', {
        page_name: pageName || document.title,
        url: window.location.href,
        time_on_prev_page: this._prevPageTime
          ? Math.round((Date.now() - this._prevPageTime) / 1000)
          : null,
      });
      this._prevPageTime = Date.now();
    },

    // ─── Button click ────────────────────────────────────────────────────────
    buttonClick(label, destination) {
      this.track('button_click', {
        button_label: label,
        destination: destination || null,
      });
    },

    // ─── Navigation ─────────────────────────────────────────────────────────
    navigate(from, to) {
      this.track('navigation', {
        from_page: from,
        to_page: to,
      });
    },

    // ─── Blueprint events ────────────────────────────────────────────────────
    blueprintFormStart() {
      this.track('blueprint_form_start', {});
    },

    blueprintFormSubmit(role) {
      this.track('blueprint_form_submit', {
        user_role: role || 'unknown',
      });
    },

    blueprintDownload(success) {
      this.track('blueprint_download', {
        success: success !== false,
      });
    },

    // ─── Game events ─────────────────────────────────────────────────────────
    gameStart() {
      this.track('tetris_game_start', {
        games_played_total: parseInt(localStorage.getItem('cl_games_played') || '0'),
      });
    },

    gameEnd(score, level, lines) {
      this.track('tetris_game_end', {
        final_score: score,
        final_level: level,
        lines_cleared: lines,
        high_score: parseInt(localStorage.getItem('cl_high_score') || '0'),
      });
    },

    // ─── Mission board ────────────────────────────────────────────────────────
    missionView(missionName) {
      this.track('mission_view', { mission_name: missionName });
    },

    // ─── Enter Loop CTA ───────────────────────────────────────────────────────
    enterLoop() {
      this.track('enter_loop_click', {});
    },
  };

  // ─── Built-in Providers ─────────────────────────────────────────────────────

  // 1. Console (dev only)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    CL.registerProvider('console', (name, props) => {
      console.log('%c[CL Analytics]', 'color:#C8A84B;font-weight:bold;', name, props);
    });
  }

  // 2. localStorage event log (always active — useful for debugging)
  CL.registerProvider('localStorage', (name, props) => {
    try {
      const log = JSON.parse(localStorage.getItem('cl_event_log') || '[]');
      log.push({ event: name, ...props });
      // Keep last 100 events
      if (log.length > 100) log.splice(0, log.length - 100);
      localStorage.setItem('cl_event_log', JSON.stringify(log));
    } catch (e) { /* storage full or blocked */ }
  });

  // 3. Google Analytics 4
  // Activated when CL_CONFIG.ga4Id is set
  if (config.ga4Id) {
    // Load GA4 script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.ga4Id}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', config.ga4Id, { send_page_view: false }); // We handle page views manually

    CL.registerProvider('ga4', (name, props) => {
      if (typeof gtag === 'undefined') return;
      if (name === 'page_view') {
        gtag('event', 'page_view', {
          page_title: props.page_name,
          page_location: props.url,
        });
      } else {
        gtag('event', name, props);
      }
    });
  }

  // 4. Plausible Analytics
  // Activated when CL_CONFIG.plausibleDomain is set
  if (config.plausibleDomain) {
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', config.plausibleDomain);
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);

    CL.registerProvider('plausible', (name, props) => {
      if (typeof window.plausible === 'undefined') return;
      if (name === 'page_view') return; // Plausible auto-tracks page views
      window.plausible(name, { props });
    });
  }

  // 5. Meta Pixel
  // Activated when CL_CONFIG.metaPixelId is set
  if (config.metaPixelId) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', config.metaPixelId);

    CL.registerProvider('meta_pixel', (name, props) => {
      if (typeof fbq === 'undefined') return;
      const standardEvents = ['page_view', 'blueprint_download', 'blueprint_form_submit'];
      if (name === 'page_view') {
        fbq('track', 'PageView');
      } else if (name === 'blueprint_form_submit') {
        fbq('track', 'Lead', { content_name: 'Blueprint Download' });
      } else if (name === 'blueprint_download') {
        fbq('track', 'CompleteRegistration', { content_name: 'Blueprint v3' });
      } else {
        fbq('trackCustom', name, props);
      }
    });
  }

  // ─── Expose globally ────────────────────────────────────────────────────────
  window.CL = CL;

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function generateSessionId() {
    const stored = sessionStorage.getItem('cl_session_id');
    if (stored) return stored;
    const id = 'cl_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    sessionStorage.setItem('cl_session_id', id);
    return id;
  }

  // ─── Auto-instrument on DOM ready ───────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {

    // Auto page view
    const pageNames = {
      '/': 'Loop Entrance',
      '/index.html': 'Loop Entrance',
      '/pages/missions.html': 'Mission Control',
      '/pages/blueprint.html': 'Blueprint',
      '/404.html': '404',
    };
    const pageName = pageNames[window.location.pathname] || document.title;
    CL.pageView(pageName);

    // ─── Auto-instrument all tracked buttons via data attributes ─────────────
    // Usage: <button data-cl-event="button_click" data-cl-label="Start Game">
    document.querySelectorAll('[data-cl-event]').forEach(el => {
      el.addEventListener('click', () => {
        const eventName = el.getAttribute('data-cl-event');
        const label = el.getAttribute('data-cl-label') || el.textContent.trim().slice(0, 50);
        const dest = el.getAttribute('href') || el.getAttribute('data-cl-dest') || null;
        CL.track(eventName, { label, destination: dest });
      });
    });

    // ─── Navigation links ─────────────────────────────────────────────────────
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto') || href.startsWith('tel')) return;
      if (href.startsWith('http') && !href.includes('creatorloop.net')) return; // external

      link.addEventListener('click', () => {
        CL.navigate(window.location.pathname, href);
      });
    });

    // ─── Blueprint form instrumentation ──────────────────────────────────────
    const bpForm = document.getElementById('blueprint-form');
    if (bpForm) {
      // Track when user starts filling the form (first input interaction)
      let formStarted = false;
      bpForm.querySelectorAll('input, select').forEach(field => {
        field.addEventListener('focus', () => {
          if (!formStarted) {
            formStarted = true;
            CL.blueprintFormStart();
          }
        });
      });
    }

    // ─── Enter Loop button ────────────────────────────────────────────────────
    const enterLoopBtn = document.getElementById('enter-loop-btn');
    if (enterLoopBtn) {
      enterLoopBtn.addEventListener('click', () => CL.enterLoop());
    }

    // ─── Start Game button ────────────────────────────────────────────────────
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => CL.buttonClick('Start Game', '#game-section'));
    }

    // ─── Mission card view tracking ───────────────────────────────────────────
    if ('IntersectionObserver' in window) {
      const missionCards = document.querySelectorAll('.mc-card');
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const title = entry.target.querySelector('.mc-card-title');
            if (title) CL.missionView(title.textContent.trim().replace(/\n/g, ' '));
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      missionCards.forEach(card => observer.observe(card));
    }

  });

})();
