'use strict';
/**
 * First-party, cookie-free funnel instrumentation. No PII is sent; only the
 * landing attribution, path and a random session id are stored.
 */
(function () {
  var KEY = 'kiln.attribution.v1';
  var SESSION_KEY = 'kiln.session.v1';
  var params = new URLSearchParams(window.location.search);
  var stored = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {};
  } catch (error) {
    stored = {};
  }
  var tracked = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];
  var fresh = {};
  tracked.forEach(function (key) {
    var value = params.get(key);
    if (value) fresh[key] = String(value).slice(0, 160);
  });
  if (fresh.ref) fresh.ref = fresh.ref.toUpperCase().slice(0, 40);
  var attribution = Object.assign({}, stored, fresh);
  if (!attribution.landing) attribution.landing = window.location.pathname;
  if (!attribution.referrer && document.referrer) attribution.referrer = document.referrer.slice(0, 300);
  if (!attribution.firstSeen) attribution.firstSeen = new Date().toISOString();
  try {
    window.localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch (error) {
    /* storage may be unavailable in private mode */
  }
  var sessionId = '';
  try {
    sessionId = window.sessionStorage.getItem(SESSION_KEY) || '';
    if (!sessionId) {
      sessionId = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (error) {
    sessionId = 's_ephemeral';
  }

  function track(event, props) {
    if (!event) return;
    var payload = {
      event: String(event).slice(0, 80),
      props: Object.assign({}, props || {}, {
        attribution: attribution,
        sessionId: sessionId,
        path: window.location.pathname + window.location.search,
        title: document.title,
      }),
    };
    try {
      fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (error) {
      /* analytics must never break the page */
    }
  }

  window.kilnTrack = track;
  window.kilnAttribution = attribution;
  track('page_view', { referrer: document.referrer || null });

  document.addEventListener('click', function (event) {
    var target = event.target.closest ? event.target.closest('[data-analytics], a.btn, a.text-link, button.btn') : null;
    if (!target) return;
    track(target.getAttribute('data-analytics') || 'cta_click', {
      label: String(target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      href: target.getAttribute('href') || null,
      section: target.closest && target.closest('section') ? (target.closest('section').id || null) : null,
    });
  }, { passive: true });
})();
