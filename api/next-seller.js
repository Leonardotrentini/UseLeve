/** @type {import('@vercel/node').VercelRequest} */
/** @type {import('@vercel/node').VercelResponse} */

const { Redis } = require('@upstash/redis');

const WHATSAPP_MESSAGE = 'Olá, quero conhecer a UseLeve!';
const KV_KEY = 'useleve:next-seller-seq';

const SELLERS = [
  { label: 'Rafael', phone: '5547991795290' },
  { label: 'Felipe', phone: '554792066309' },
];

function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('missing_upstash_redis_env');
  }
  return new Redis({ url, token });
}

async function incrementGlobalSeq() {
  const redis = getRedis();
  const seq = await redis.incr(KV_KEY);
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) throw new Error('redis_incr_invalid');
  return n;
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
    const seq = await incrementGlobalSeq();
    const index = (seq - 1) % total;
    const seller = SELLERS[index];

    return res.status(200).json({
      ok: true,
      phone: seller.phone,
      label: seller.label,
      index,
      total,
      seq,
      message: WHATSAPP_MESSAGE,
    });
  } catch (err) {
    console.error('[next-seller]', err && err.message ? err.message : err);
    return res.status(500).json({
      ok: false,
      error: 'next_seller_failed',
      detail: err && err.message ? String(err.message) : 'unknown',
    });
  }
};
