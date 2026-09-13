const crypto = require('crypto');

const SECRET = process.env.PAY_LINK_SECRET || process.env.APP_KEY || '';

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function decodeToken(token) {
  const raw = String(token || '').trim();
  if (!raw || !raw.includes('.')) return null;

  const dot = raw.indexOf('.');
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!SECRET || sign(payload) !== sig) return null;

  let encoded = payload.replace(/-/g, '+').replace(/_/g, '/');
  encoded += '='.repeat((4 - (encoded.length % 4)) % 4);
  let data;
  try {
    data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (!data?.i || !data?.s || !data?.e) return null;
  if (Number(data.e) < Math.floor(Date.now() / 1000)) return null;

  return { invoiceId: Number(data.i), serviceId: Number(data.s), exp: Number(data.e) };
}

module.exports = { decodeToken, sign };
