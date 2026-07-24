/**
 * CreatorLoop™ Main JavaScript
 * Navigation, forms, Google Sheets integration
 * Analytics calls go through window.CL (analytics.js)
 */

// ─── Google Sheets Blueprint Form ─────────────────────────────────────────
// Replace SHEET_URL with your Google Apps Script Web App URL after setup
// See README.md for full Google Sheets setup instructions
const SHEET_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

async function submitToGoogleSheets(formData) {
  const payload = {
    timestamp: new Date().toISOString(),
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    role: formData.role,
    source: 'Blueprint Download',
    leadMagnet: 'Blueprint v3',
    status: 'New',
    notes: '',
  };

  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { success: true };
  } catch (err) {
    console.error('[CL Form] Sheet submission error:', err);
    // Still allow download even if sheet fails — never block the user
    return { success: true, sheetError: true };
  }
}

// ─── Blueprint Form Handler ────────────────────────────────────────────────
function initBlueprintForm() {
  const form = document.getElementById('blueprint-form');
  if (!form) return;

  const submitBtn = document.getElementById('blueprint-submit');
  const requiredFields = ['bp-firstname', 'bp-lastname', 'bp-email', 'bp-role'];

  // Enable/disable submit button based on required field completion
  function checkFields() {
    const allFilled = requiredFields.every(id => {
      const el = document.getElementById(id);
      return el && el.value.trim() !== '';
    });
    if (submitBtn) submitBtn.disabled = !allFilled;
  }

  requiredFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', checkFields);
  });
  checkFields();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('bp-firstname')?.value.trim();
    const lastName  = document.getElementById('bp-lastname')?.value.trim();
    const email     = document.getElementById('bp-email')?.value.trim();
    const role      = document.getElementById('bp-role')?.value;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const emailInput = document.getElementById('bp-email');
      if (emailInput) emailInput.classList.add('error');
      showFormError('Please enter a valid email address.');
      return;
    }

    // Loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'PROCESSING...';
    }

    // Submit to Google Sheets
    const result = await submitToGoogleSheets({ firstName, lastName, email, role });

    // Track form submission
    if (window.CL) CL.blueprintFormSubmit(role);

    if (result.success) {
      // Trigger download
      triggerBlueprintDownload();

      // Track download
      if (window.CL) CL.blueprintDownload(true);

      // Show success state
      showBlueprintSuccess();
    } else {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'DOWNLOAD BLUEPRINT';
      }
      showFormError('Something went wrong. Please try again.');
    }
  });
}

function showFormError(msg) {
  let errEl = document.getElementById('bp-form-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id = 'bp-form-error';
    errEl.style.cssText = 'color:#E05555;font-size:0.8rem;margin-top:0.5rem;text-align:center;';
    const form = document.getElementById('blueprint-form');
    if (form) form.appendChild(errEl);
  }
  errEl.textContent = msg;
}

function triggerBlueprintDownload() {
  const link = document.createElement('a');
  link.href = '/assets/creatorloop-blueprint.pdf';
  link.download = 'CreatorLoop-Blueprint-v3.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function showBlueprintSuccess() {
  const formSection = document.getElementById('blueprint-form-section');
  const successSection = document.getElementById('blueprint-success');
  if (formSection) formSection.classList.add('hidden');
  if (successSection) {
    successSection.classList.remove('hidden');
    startTypingAnimation();
  }
}

function startTypingAnimation() {
  const el = document.getElementById('welcome-typing');
  if (!el) return;
  const text = 'WELCOME TO CREATORLOOP™';
  el.textContent = '';
  let i = 0;
  const interval = setInterval(() => {
    el.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(interval);
      setTimeout(() => {
        const redirectBtn = document.getElementById('success-redirect-btn');
        if (redirectBtn) redirectBtn.classList.remove('hidden');
      }, 800);
    }
  }, 80);
}

// ─── Navigation active state ───────────────────────────────────────────────
function initNav() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.cl-nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (currentPath === href || currentPath === href.replace(/\/$/, ''))) {
      link.classList.add('active');
    }
  });
}

// ─── Smooth scroll for anchor links ───────────────────────────────────────
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

// ─── ENTER THE LOOP button ─────────────────────────────────────────────────
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

// ─── Mobile nav toggle ─────────────────────────────────────────────────────
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

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initSmoothScroll();
  initEnterLoop();
  initMobileNav();
  initBlueprintForm();
});
