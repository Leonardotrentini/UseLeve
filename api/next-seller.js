/** @type {import('@vercel/node').VercelRequest} */
/** @type {import('@vercel/node').VercelResponse} */

const WHATSAPP_MESSAGE = 'Olá, quero conhecer a UseLeve!';
const KV_KEY = 'useleve:next-seller-seq';

/* Fonte da verdade da LP: 1 clique → próximo número, em sequência. */
const SELLERS = [
  {
    label: 'Rafael',
    phone: '5547991795290',
  },
  {
    label: 'Felipe',
    phone: '554792066309',
  },
];

let memorySeq = 0;
let memoryLock = Promise.resolve();

async function incrViaRest(base, token, key) {
  const res = await fetch(base.replace(/\/$/, '') + '/incr/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('kv_incr_' + res.status);
  const data = await res.json();
  const seq = Number(data && (data.result ?? data));
  if (Number.isFinite(seq) && seq > 0) return seq;
  throw new Error('kv_incr_invalid');
}

async function incrementGlobalSeq() {
  const kvBase = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvBase && kvToken) {
    return incrViaRest(kvBase, kvToken, KV_KEY);
  }

  const upstashBase = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashBase && upstashToken) {
    return incrViaRest(upstashBase, upstashToken, KV_KEY);
  }

  /* Fallback sem Redis: sequencial na mesma instância (warm). */
  let next;
  memoryLock = memoryLock.then(function () {
    memorySeq += 1;
    next = memorySeq;
  });
  await memoryLock;
  return next;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const total = SELLERS.length;
    if (!total) {
      return res.status(500).json({ ok: false, error: 'no_sellers' });
    }

    const seq = await incrementGlobalSeq();
    const index = (seq - 1) % total;
    const seller = SELLERS[index];

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
