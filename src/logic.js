'use strict';

/**
 * Basilei Design Tool — Core Logic
 *
 * Pure functions extracted from basilei-design.html for standalone
 * testability. Every function matches the contract of its in-browser
 * counterpart. mockApiSubmit accepts an optional dependency-injection
 * bag so tests can control randomness and timing without fake timers.
 */

// ─── Static data ─────────────────────────────────────────────────────────────

const PALETTE = [
  { id: 'rose',       name: 'Rose',        fill: '#E8B4C8', accent: '#993556' },
  { id: 'mustard',    name: 'Mustard',     fill: '#D4A24C', accent: '#854F0B' },
  { id: 'powder',     name: 'Powder',      fill: '#BFD3DB', accent: '#0C447C' },
  { id: 'lavender',   name: 'Lavender',    fill: '#C8B8D6', accent: '#3C3489' },
  { id: 'terracotta', name: 'Terracotta',  fill: '#C77B5C', accent: '#4A1B0C' },
  { id: 'cream',      name: 'Cream',       fill: '#F0E6D6', accent: '#4A3A2E' },
  { id: 'sage',       name: 'Sage',        fill: '#A8B89A', accent: '#27500A' },
  { id: 'charcoal',   name: 'Charcoal',    fill: '#3C3530', accent: '#D4A24C' },
];

const ROUTE_LABELS = {
  canvas:  'The Canvas',
  atelier: 'Atelier Edition',
  upload:  'Designer Upload',
};

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate the design state before submission.
 *
 * @param {{ brandName: string, quantity: number }} state
 * @returns {Record<string, string>}  Empty object means valid; each key is a
 *                                   field name mapping to a user-facing error.
 */
function validate(state) {
  const errors = {};

  if (!state.brandName.trim()) {
    errors.brandName = 'Please enter a brand or recipient name.';
  }

  if (!state.quantity || isNaN(state.quantity) || state.quantity < 12) {
    errors.quantity = (state.quantity > 0 && state.quantity < 12)
      ? `Minimum order is 12 boxes — you entered ${state.quantity}.`
      : 'Please enter a valid quantity (minimum 12).';
  }

  return errors;
}

// ─── XML utilities ────────────────────────────────────────────────────────────

/**
 * Escape XML / SVG special characters.
 *
 * @param {*} s  — coerced to string via String()
 * @returns {string}
 */
function escapeXml(s) {
  return String(s).replace(
    /[<>&'"]/g,
    c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])
  );
}

// ─── SVG label helpers ────────────────────────────────────────────────────────

/**
 * Word-wrap a flavour name into at most 3 SVG <text> lines, each fewer than
 * 14 characters.  Words are uppercased and & is HTML-escaped before wrapping.
 *
 * @param {string} flavour
 * @returns {string[]}  1–3 elements
 */
function flavourLines(flavour) {
  return flavour
    .toUpperCase()
    .replace(/&/g, '&amp;')
    .split(/\s+/)
    .reduce((acc, w) => {
      const last = acc[acc.length - 1];
      if (last && (last + ' ' + w).length < 14) {
        acc[acc.length - 1] = last + ' ' + w;
      } else {
        acc.push(w);
      }
      return acc;
    }, [])
    .slice(0, 3);
}

// ─── Mock API ─────────────────────────────────────────────────────────────────

/**
 * Simulate an order-submission API call.
 *
 * In production the defaults produce realistic 1.5–2.4 s latency and a ~12%
 * failure rate.  In tests, pass `_random` and `_delay` to get deterministic,
 * instant behaviour without fake timer setup.
 *
 * RNG call sequence (when _delay = 0):
 *   call 1  → failure-check  (< 0.12 → reject)
 *   call 2  → orderId suffix generation
 *
 * RNG call sequence (when _delay = null, i.e. production):
 *   call 1  → delay ms = 1500 + _random() * 900
 *   call 2  → failure-check
 *   call 3  → orderId suffix
 *
 * @param {object} payload
 * @param {{ _random?: () => number, _delay?: number|null }} [opts]
 * @returns {Promise<{ orderId: string, estimatedDate: string }>}
 */
function mockApiSubmit(payload, { _random = Math.random, _delay = null } = {}) {
  const ms = _delay !== null ? _delay : 1500 + _random() * 900;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (_random() < 0.12) {
        reject(new Error('Network error — please check your connection and try again.'));
        return;
      }
      const orderId      = 'BSL-' + _random().toString(36).slice(2, 8).toUpperCase();
      const ready        = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const estimatedDate = ready.toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      resolve({ orderId, estimatedDate });
    }, ms);
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { PALETTE, ROUTE_LABELS, validate, escapeXml, flavourLines, mockApiSubmit };
