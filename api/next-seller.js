/** @type {import('@vercel/node').VercelRequest} */
/** @type {import('@vercel/node').VercelResponse} */

const VESTO_KEY = 'vpk_af945dce6931b1fcf08bb9f012a0766b';
const VESTO_CONFIG_URL =
  'https://backend-production-7a466.up.railway.app/api/public/meta/config?key=' +
  encodeURIComponent(VESTO_KEY);
const WHATSAPP_MESSAGE = 'Olá, quero conhecer a UseLeve!';
const KV_KEY = 'useleve:next-seller-seq';

const DEFAULT_SELLERS = [
  {
    label: 'Rafael',
    phone: '5547991795290',
  },
];

let cachedSellers = null;
let cacheExpiresAt = 0;

async function fetchSellersFromVesto() {
  const now = Date.now();
  if (cachedSellers && now < cacheExpiresAt) return cachedSellers;

  try {
    const res = await fetch(VESTO_CONFIG_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('vesto_config_' + res.status);
    const data = await res.json();
    const sellers = Array.isArray(data?.sellers)
      ? data.sellers
          .map(function (s) {
            return {
              label: String(s.label || s.name || '').trim(),
              phone: String(s.phone || s.whatsapp || '').replace(/\D/g, ''),
            };
          })
          .filter(function (s) {
            return s.phone.length >= 10;
          })
      : [];

    if (sellers.length) {
      cachedSellers = sellers;
      cacheExpiresAt = now + 5 * 60 * 1000;
      return sellers;
    }
  } catch (_) {
    /* fallback abaixo */
  }

  return DEFAULT_SELLERS;
}

async function incrementGlobalSeq() {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (base && token) {
    const res = await fetch(base.replace(/\/$/, '') + '/incr/' + encodeURIComponent(KV_KEY), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) throw new Error('kv_incr_' + res.status);
    const data = await res.json();
    const seq = Number(data && data.result);
    if (Number.isFinite(seq) && seq > 0) return seq;
    throw new Error('kv_incr_invalid');
  }

  /* Dev/fallback sem KV: sequência pseudo-global por timestamp (1 vendedor → ok) */
  return Math.floor(Date.now() / 1000);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const sellers = await fetchSellersFromVesto();
    const total = sellers.length;
    if (!total) {
      return res.status(500).json({ ok: false, error: 'no_sellers' });
    }

    const seq = await incrementGlobalSeq();
    const index = (seq - 1) % total;
    const seller = sellers[index];

    return res.status(200).json({
      ok: true,
      phone: seller.phone,
      label: seller.label,
      index: index,
      total: total,
      seq: seq,
      message: WHATSAPP_MESSAGE,
    });
  } catch (err) {
    console.error('[next-seller]', err);
    return res.status(500).json({ ok: false, error: 'next_seller_failed' });
  }
};
