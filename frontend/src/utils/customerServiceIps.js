/**
 * RADIUS / session IPv4 for a customer's services (list + billing views).
 */
export function serviceSessionIp(service) {
  if (!service) return null;
  return service.mikrotik_ipv4 || service.ip_address || service.framedipaddress || null;
}

export function isServiceOnline(service) {
  return Number(service?.online) === 1;
}

/** IPs for services that are currently online (RADIUS session active). */
export function getOnlineServiceIps(services = []) {
  return (services || [])
    .filter(isServiceOnline)
    .map(serviceSessionIp)
    .filter(Boolean);
}

/** Unique online IPs, preserving order. */
export function getUniqueOnlineServiceIps(services = []) {
  const seen = new Set();
  return getOnlineServiceIps(services).filter((ip) => {
    if (seen.has(ip)) return false;
    seen.add(ip);
    return true;
  });
}
