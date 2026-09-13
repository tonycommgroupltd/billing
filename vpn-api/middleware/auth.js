const jwt = require('jsonwebtoken');

function verifyJwt(token) {
  const secrets = [process.env.JWT_SECRET, process.env.JWT_SECRET_FALLBACK].filter(Boolean);
  for (const secret of secrets) {
    try {
      jwt.verify(token, secret);
      return true;
    } catch (_) {
      /* try next secret */
    }
  }
  return false;
}

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.VPN_API_KEY;
  if (validKey && apiKey === validKey) return next();

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (token && verifyJwt(token)) return next();
  if (token) return res.status(401).json({ error: 'Invalid or expired token' });

  if (!validKey && !process.env.JWT_SECRET && !process.env.JWT_SECRET_FALLBACK) {
    console.warn('[auth] VPN_API_KEY and JWT_SECRET unset — dev mode open');
    return next();
  }

  return res.status(401).json({ error: 'Invalid or missing credentials' });
}

module.exports = { authMiddleware };
