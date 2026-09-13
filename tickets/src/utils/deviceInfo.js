/**
 * Parse browser / OS / device type from user agent (client-side).
 */
export function getDeviceInfo() {
  if (typeof navigator === 'undefined') {
    return {
      device_type: 'desktop',
      device_label: 'Unknown',
      browser: 'Unknown',
      os: 'Unknown',
    };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = navigator.maxTouchPoints || 0;

  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  const isMobileUa = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad/i.test(ua) || (maxTouch > 1 && /MacIntel/i.test(platform) && !/iPhone/i.test(ua));
  const narrow = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  let device_type = 'desktop';
  if (isTablet) device_type = 'tablet';
  else if (isMobileUa || narrow) device_type = 'mobile';

  const typeLabel = device_type === 'mobile' ? 'Mobile' : device_type === 'tablet' ? 'Tablet' : 'Desktop';
  const device_label = `${typeLabel} · ${browser}`;

  return { device_type, device_label, browser, os };
}
