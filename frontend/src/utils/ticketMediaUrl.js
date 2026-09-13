/**
 * Normalize ticket router image URLs (legacy /api/uploads → /tickets-api/uploads).
 */
export function normalizeTicketMediaUrl(url) {
  if (!url || typeof url !== 'string') return url;

  if (url.includes('/api/uploads/')) {
    return url.replace('/api/uploads/', '/tickets-api/uploads/');
  }

  if (url.startsWith('/uploads/')) {
    const base = (process.env.REACT_APP_TICKETS_API_URL || '/tickets-api').replace(/\/$/, '');
    return `${base}${url}`;
  }

  return url;
}

export function resolveTicketRouterImageUrl(img) {
  if (!img) return null;
  if (typeof img === 'string') return normalizeTicketMediaUrl(img);
  if (img.url) return normalizeTicketMediaUrl(img.url);
  if (img.file_path) {
    const base = (process.env.REACT_APP_TICKETS_API_URL || '/tickets-api').replace(/\/$/, '');
    const path = img.file_path.startsWith('/') ? img.file_path : `/${img.file_path}`;
    return normalizeTicketMediaUrl(`${base}${path}`);
  }
  return null;
}
