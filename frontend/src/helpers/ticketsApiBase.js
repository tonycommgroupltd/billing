/** Same-origin tickets API path in dev (setupProxy) and production (Apache /tickets-api). */
export function getTicketsApiBase() {
  const base = process.env.REACT_APP_TICKETS_API_URL || '/tickets-api';
  return base.replace(/\/$/, '');
}

export function ticketsApiUrl(path = '') {
  const normalized = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return `${getTicketsApiBase()}${normalized}`;
}
