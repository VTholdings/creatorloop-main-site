/**
 * CreatorLoop™ Main JavaScript
 * Navigation, Blueprint form, Google Sheets integration
 * Analytics calls go through window.CL (analytics.js)
 *
 * Google Sheets connection:
 * Set SHEET_URL to your deployed Google Apps Script Web App URL.
 * See README.md → "Google Sheets Setup" for full instructions.
 */

// ─── Config ───────────────────────────────────────────────────────────────────
// Replace with your deployed Apps Script Web App URL after setup
const SHEET_URL = (window.CL_CONFIG && window.CL_CONFIG.sheetUrl)
  ? window.CL_CONFIG.sheetUrl
  : 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

const BLUEPRINT_VERSION = 'v3';
const BLUEPRINT_PDF_PATH = '/assets/creatorloop-blueprint.pdf';
const BLUEPRINT_PDF_FILENAME = 'CreatorLoop-Blueprint-v3.pdf';

// ─── UTM Parser ───────────────────────────────────────────────────────────────
function getUTMParams() {
  const params = new URLSearchParams(window.location.search);
  // Also check sessionStorage for UTMs set on a previous page
  const stored = JSON.parse(sessionStorage.getItem('cl_utms') || '{}');
  const utms = {
    source:   params.get('utm_source')   || stored.source   || '',
    medium:   params.get('utm_medium')   || stored.medium   || '',
    campaign: params.get('utm_campaign') || stored.campaign || '',
  };
  // Persist UTMs across pages within the session
  if (utms.source || utms.medium || utms.campaign) {
    sessionStorage.setItem('cl_utms', JSON.stringify(utms));
  }
  return utms;
}

// ─── GA4 Client ID ────────────────────────────────────────────────────────────
function getGA4ClientId() {
  return new Promise((resolve) => {
    if (typeof gtag === 'undefined') {
      resolve('');
      return;
    }
    try {
      gtag('get', window.CL_CONFIG && window.CL_CONFIG.ga4Id ? window.CL_CONFIG.ga4Id : 'G-XXXXXXXXXX', 'client_id', (clientId) => {
        resolve(clientId || '');
      });
    } catch (e) {
      resolve('');
    }
    // Timeout fallback — don't block form submission waiting for GA4
    setTimeout(() => resolve(''), 1500);
  });
}

// ─── Populate hidden fields ───────────────────────────────────────────────────
async function populateHiddenFields() {
  const utms = getUTMParams();
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('bp-utm-source', utms.source);
  setVal('bp-utm-medium', utms.medium);
  setVal('bp-utm-campaign', utms.campaign);
  setVal('bp-blueprint-version', BLUEPRINT_VERSION);
  setVal('bp-download-source', document.referrer ? 'Blueprint Page (ref: ' + document.referrer.split('/')[2] + ')' : 'Blueprint Page (direct)');

  const clientId = await getGA4ClientId();
  setVal('bp-ga-client-id', clientId);
}

// ─── Offline / retry queue ────────────────────────────────────────────────────
// If the sheet submission fails, we store the payload in localStorage
// and retry on the next page load. The user always gets their download.
const RETRY_KEY = 'cl_bp_retry_queue';

function enqueueRetry(payload) {
  try {
    const queue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
    queue.push({ payload, attempts: 0, enqueuedAt: new Date().toISOString() });
    localStorage.setItem(RETRY_KEY, JSON.stringify(queue));
  } catch (e) { /* storage full */ }
}

async function flushRetryQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      if (item.attempts >= 3) continue; // Drop after 3 attempts
      const ok = await sendToSheet(item.payload, false);
      if (!ok) {
        item.attempts++;
        remaining.push(item);
      }
    }
    localStorage.setItem(RETRY_KEY, JSON.stringify(remaining));
  } catch (e) { /* silent */ }
}

// ─── Sheet submission ─────────────────────────────────────────────────────────
async function sendToSheet(payload, enqueueOnFail = true) {
  if (SHEET_URL.includes('YOUR_SCRIPT_ID')) {
    console.warn('[CL Blueprint] Google Sheets URL not configured. Set CL_CONFIG.sheetUrl or update SHEET_URL in main.js.');
    return true; // Don't block download during development
  }
  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      mode: 'no-cors', // Google Apps Script requires no-cors
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (err) {
    console.error('[CL Blueprint] Sheet submission failed:', err);
    if (enqueueOnFail) enqueueRetry(payload);
    return false;
  }
}

async function submitToGoogleSheets(formData) {
  const payload = {
    timestamp:        new Date().toISOString(),
    firstName:        formData.firstName,
    lastName:         formData.lastName,
    email:            formData.email,
    company:          formData.company || '',
    creatorType:      formData.role || '',
    downloadSource:   formData.downloadSource || 'Blueprint Page',
    utmSource:        formData.utmSource || '',
    utmMedium:        formData.utmMedium || '',
    utmCampaign:      formData.utmCampaign || '',
    gaClientId:       formData.gaClientId || '',
    blueprintVersion: formData.blueprintVersion || BLUEPRINT_VERSION,
  };
  return sendToSheet(payload, true);
}

// ─── Blueprint Form Handler ───────────────────────────────────────────────────
function initBlueprintForm() {
  const form = document.getElementById('blueprint-form');
  if (!form) return;

  // Populate hidden tracking fields as soon as the form is ready
  populateHiddenFields();

  const submitBtn = document.getElementById('blueprint-submit');
  const requiredFieldIds = ['bp-firstname', 'bp-lastname', 'bp-email', 'bp-role'];

  function checkFields() {
    const allFilled = requiredFieldIds.every(id => {
      const el = document.getElementById(id);
      return el && el.value.trim() !== '';
    });
    if (submitBtn) submitBtn.disabled = !allFilled;
  }

  requiredFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', checkFields);
    if (el) el.addEventListener('change', checkFields);
  });
  checkFields();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError();

    const firstName      = document.getElementById('bp-firstname')?.value.trim();
    const lastName       = document.getElementById('bp-lastname')?.value.trim();
    const email          = document.getElementById('bp-email')?.value.trim();
    const company        = document.getElementById('bp-company')?.value.trim();
    const role           = document.getElementById('bp-role')?.value;
    const utmSource      = document.getElementById('bp-utm-source')?.value;
    const utmMedium      = document.getElementById('bp-utm-medium')?.value;
    const utmCampaign    = document.getElementById('bp-utm-campaign')?.value;
    const gaClientId     = document.getElementById('bp-ga-client-id')?.value;
    const downloadSource = document.getElementById('bp-download-source')?.value;
    const bpVersion      = document.getElementById('bp-blueprint-version')?.value;

    // Email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('bp-email')?.classList.add('error');
      showFormError('Please enter a valid email address.');
      return;
    }

    // Loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'PROCESSING...';
    }

    // Analytics: form submit event
    if (window.CL) CL.blueprintFormSubmit(role);

    // Submit to Google Sheets (non-blocking — download proceeds regardless)
    submitToGoogleSheets({
      firstName, lastName, email, company, role,
      utmSource, utmMedium, utmCampaign,
      gaClientId, downloadSource,
      blueprintVersion: bpVersion,
    }); // intentionally not awaited — never block the download

    // Trigger download immediately
    triggerBlueprintDownload();

    // Analytics: download event
    if (window.CL) CL.blueprintDownload(true);

    // GA4 direct event (if GA4 is active)
    if (typeof gtag !== 'undefined') {
      gtag('event', 'blueprint_download', {
        event_category: 'Lead Magnet',
        event_label: 'Blueprint v3',
        creator_type: role,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
      });
    }

    // Show success state
    showBlueprintSuccess(firstName);
  });
}

function showFormError(msg) {
  let errEl = document.getElementById('bp-form-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id = 'bp-form-error';
    errEl.setAttribute('role', 'alert');
    errEl.style.cssText = 'color:#E05555;font-size:0.8rem;margin-top:0.5rem;text-align:center;';
    const form = document.getElementById('blueprint-form');
    if (form) form.appendChild(errEl);
  }
  errEl.textContent = msg;
}

function clearFormError() {
  const errEl = document.getElementById('bp-form-error');
  if (errEl) errEl.textContent = '';
  document.getElementById('bp-email')?.classList.remove('error');
}

function triggerBlueprintDownload() {
  const link = document.createElement('a');
  link.href = BLUEPRINT_PDF_PATH;
  link.download = BLUEPRINT_PDF_FILENAME;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => document.body.removeChild(link), 1000);
}

function showBlueprintSuccess(firstName) {
  const formSection = document.getElementById('blueprint-form-section');
  const successSection = document.getElementById('blueprint-success');
  if (formSection) formSection.classList.add('hidden');
  if (successSection) {
    successSection.classList.remove('hidden');
    successSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    startTypingAnimation(firstName);
  }
}

function startTypingAnimation(firstName) {
  const el = document.getElementById('welcome-typing');
  if (!el) return;
  const name = firstName ? firstName.toUpperCase() : 'CREATOR';
  const text = `WELCOME TO CREATORLOOP™, ${name}`;
  el.textContent = '';
  let i = 0;
  const interval = setInterval(() => {
    el.textContent += text[i];
    i++;
    if (i >= text.length) clearInterval(interval);
  }, 65);
}

// ─── Navigation active state ──────────────────────────────────────────────────
function initNav() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.cl-nav-links a, .cl-mobile-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (currentPath === href || currentPath.endsWith(href))) {
      link.classList.add('active');
    }
  });
}

// ─── Smooth scroll for anchor links ──────────────────────────────────────────
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ─── Enter the Loop button ────────────────────────────────────────────────────
function initEnterLoop() {
  const btn = document.getElementById('enter-loop-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const blueprintSection = document.getElementById('blueprint-section');
    if (blueprintSection) {
      blueprintSection.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// ─── Mobile nav toggle ────────────────────────────────────────────────────────
function initMobileNav() {
  const toggle = document.getElementById('cl-nav-toggle');
  const menu = document.getElementById('cl-mobile-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const isOpen = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', String(!isOpen));
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initSmoothScroll();
  initEnterLoop();
  initMobileNav();
  initBlueprintForm();

  // Flush any queued submissions from previous sessions
  flushRetryQueue();
});
