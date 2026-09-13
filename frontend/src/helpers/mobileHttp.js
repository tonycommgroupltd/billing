import axios from 'axios';

/**
 * Mobile / OTP admin API on the Node host (same as finance: :3500).
 * Dev/desktop: /finance-api → /api on that host.
 */
const getMobileApiBase = () => {
  try {
    if (process.env.REACT_APP_FINANCE_API_URL) {
      return process.env.REACT_APP_FINANCE_API_URL.replace(/\/$/, '');
    }
  } catch (e) {
    /* ignore */
  }
  return '/finance-api';
};

const mobileHttp = axios.create({
  baseURL: getMobileApiBase(),
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

mobileHttp.interceptors.request.use((config) => {
  const apiKey =
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.REACT_APP_OTP_ADMIN_API_KEY || process.env.REACT_APP_NODE_API_KEY)) ||
    'tcom-api-key-2024';
  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const MobileAdminAPI = {
  getOverview: () => mobileHttp.get('/otp-admin/overview').then((r) => r.data),
  getOtpStats: () => mobileHttp.get('/otp-admin/stats').then((r) => r.data),
  getRecentOtps: (limit = 40) =>
    mobileHttp.get('/otp-admin/recent', { params: { limit } }).then((r) => r.data),
  getUsers: (params = {}) =>
    mobileHttp.get('/otp-admin/users', { params }).then((r) => r.data),
  getSessions: (params = {}) =>
    mobileHttp.get('/otp-admin/sessions', { params }).then((r) => r.data),
  revokeSession: (id, note = '') =>
    mobileHttp.post(`/otp-admin/sessions/${id}/revoke`, { note }).then((r) => r.data),
  revokeUserSessions: (id, note = '') =>
    mobileHttp.post(`/otp-admin/users/${id}/revoke-sessions`, { note }).then((r) => r.data),
  getAudit: (params = {}) =>
    mobileHttp.get('/otp-admin/audit', { params }).then((r) => r.data),
  getCustomer: (phone) =>
    mobileHttp.get('/otp-admin/customer', { params: { phone } }).then((r) => r.data),
  resendOtp: (payload) => mobileHttp.post('/otp-admin/resend', payload).then((r) => r.data),
  invalidateOtp: (payload) =>
    mobileHttp.post('/otp-admin/invalidate', payload).then((r) => r.data),
  resetAttempts: (otpId) =>
    mobileHttp.post('/otp-admin/reset-attempts', { otpId }).then((r) => r.data),
  markVerified: (phone) =>
    mobileHttp.post('/otp-admin/mark-verified', { phone }).then((r) => r.data),
};

export { mobileHttp, getMobileApiBase, MobileAdminAPI };
export default MobileAdminAPI;
