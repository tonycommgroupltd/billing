const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.OLT_API_KEY;
  if (validKey && apiKey === validKey) return next();

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;

  if (token && secret) {
    try {
      jwt.verify(token, secret);
      return next();
    } catch (_) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  if (!validKey && !secret) {
    console.warn('[auth] OLT_API_KEY and JWT_SECRET unset — dev mode open');
    return next();
  }

  return res.status(401).json({ error: 'Invalid or missing credentials' });
}

module.exports = { authMiddleware };
