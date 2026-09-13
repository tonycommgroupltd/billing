/** Same-origin tickets API path in dev (setupProxy) and production (.htaccess proxy). */
export function getTicketsApiBase() {
  const base = process.env.REACT_APP_API_URL || '/api';
  return base.replace(/\/$/, '');
}

export function ticketsApiUrl(path = '') {
  const normalized = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return `${getTicketsApiBase()}${normalized}`;
}
