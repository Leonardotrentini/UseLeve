(function () {
  var VESTO_KEY = 'vpk_af945dce6931b1fcf08bb9f012a0766b';
  var ATTRIBUTION_URL =
    'https://backend-production-7a466.up.railway.app/api/public/meta/attribution?key=' +
    encodeURIComponent(VESTO_KEY);
  var NEXT_SELLER_URL = '/api/next-seller';
  var FALLBACK_PHONE = '554792066309';
  var FALLBACK_MSG = 'Olá, quero conhecer a UseLeve!';
  var AUTO_REDIRECT_MS = 5000;

  var busy = false;
  var navigated = false;
  var autoTimer = null;

  function buildRef() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var suffix = '';
    for (var i = 0; i < 8; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'vst_' + suffix;
  }

  function readMeta() {
    try {
      return JSON.parse(sessionStorage.getItem('vesto_meta') || '{}');
    } catch (_) {
      return {};
    }
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function sendAttribution(meta, ref, contactEventId) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, 4000)
      : null;
    return fetch(ATTRIBUTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vesto-Key': VESTO_KEY },
      body: JSON.stringify({
        vestoPublicKey: VESTO_KEY,
        ref: ref,
        contactEventId: contactEventId,
        fbclid: meta.fbclid || null,
        fbc: meta.fbc || null,
        fbp: meta.fbp || null,
        clickAt: meta.clickAt,
        pageUrl: meta.pageUrl,
        userAgent: meta.userAgent,
        utm_source: meta.utm_source || '',
        utm_medium: meta.utm_medium || '',
        utm_campaign: meta.utm_campaign || '',
        utm_content: meta.utm_content || '',
        utm_term: meta.utm_term || '',
      }),
      credentials: 'omit',
      keepalive: true,
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('vesto_attribution_' + res.status);
        return res.json();
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function nextSeller() {
    return fetch(NEXT_SELLER_URL, { method: 'GET', cache: 'no-store', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('next_seller_' + res.status);
        return res.json();
      })
      .catch(function () {
        return {
          ok: true,
          phone: FALLBACK_PHONE,
          message: FALLBACK_MSG,
        };
      });
  }

  function buildWhatsAppUrl(phone, message) {
    return (
      'https://wa.me/' +
      String(phone || FALLBACK_PHONE).replace(/\D/g, '') +
      '?text=' +
      encodeURIComponent(message || FALLBACK_MSG)
    );
  }

  /* Sempre same-tab: window.open é bloqueado no navegador in-app do Meta Ads */
  function openWhatsApp(phone, message) {
    var url = buildWhatsAppUrl(phone, message);
    navigated = true;
    window.location.href = url;
  }

  function clearAutoRedirect() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function runWhatsAppFlow() {
    if (busy || navigated) return Promise.resolve(false);

    clearAutoRedirect();
    busy = true;

    var meta = readMeta();
    meta.clickAt = Date.now();
    meta.pageUrl = location.href;
    meta.userAgent = navigator.userAgent || '';
    var ref = buildRef();
    var contactEventId = 'vst_contact_' + ref.toLowerCase();

    try {
      sessionStorage.setItem('vesto_ref', ref);
    } catch (_) {}
    try {
      sessionStorage.setItem('vesto_contact_event_id', contactEventId);
    } catch (_) {}

    if (typeof fbq === 'function') {
      fbq('track', 'Contact', {}, { eventID: contactEventId });
    }

    /* Attribution em paralelo com timeout curto; não trava o redirect */
    var attributionWait = Promise.race([sendAttribution(meta, ref, contactEventId), wait(1200)]);

    return Promise.all([nextSeller(), attributionWait])
      .then(function (results) {
        var seller = results[0] || {};
        var phone = seller.phone ? String(seller.phone) : FALLBACK_PHONE;
        openWhatsApp(phone, seller.message || FALLBACK_MSG);
        return true;
      })
      .catch(function (err) {
        console.error('[Vesto] Fallback WhatsApp após erro.', err);
        openWhatsApp(FALLBACK_PHONE, FALLBACK_MSG);
        return true;
      })
      .finally(function () {
        busy = false;
      });
  }

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-vesto-whatsapp]');
      if (!btn || busy || navigated) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      runWhatsAppFlow();
    },
    true
  );

  autoTimer = setTimeout(function () {
    runWhatsAppFlow();
  }, AUTO_REDIRECT_MS);
})();
