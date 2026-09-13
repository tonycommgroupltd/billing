// ============================================
// TCOM Mobile — API Client (Real endpoints)
// ============================================

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// On web production, use relative URL (Apache proxies /api/ to Node backend).
// In dev, use production API by default (local API needs MySQL — see api/.env).
// Override: EXPO_PUBLIC_API_URL=http://localhost:3500/api
const PROD_API = 'http://78.159.111.191:3500/api';
const DEV_API = process.env.EXPO_PUBLIC_API_URL || PROD_API;
export const BASE_URL = Platform.OS === 'web'
  ? (__DEV__ ? DEV_API : '/api')
  : (__DEV__ ? DEV_API : PROD_API);

// Create axios instance
const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// --- Token helpers ---
const TOKEN_KEY = 'tcom_access_token';
const REFRESH_KEY = 'tcom_refresh_token';

// In-memory fallback (SecureStore can fail on web or with long values)
let _memAccessToken = null;
let _memRefreshToken = null;

export async function getStoredToken() {
  try {
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    if (t) return t;
  } catch { /* fall through */ }
  return _memAccessToken;
}
export async function getStoredRefresh() {
  try {
    const t = await SecureStore.getItemAsync(REFRESH_KEY);
    if (t) return t;
  } catch { /* fall through */ }
  return _memRefreshToken;
}
export async function storeTokens(access, refresh) {
  // Always store in memory first
  _memAccessToken = access;
  if (refresh) _memRefreshToken = refresh;
  // Then try SecureStore
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, access);
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  } catch (e) { console.warn('SecureStore save failed (using memory fallback)', e); }
}
export async function clearTokens() {
  _memAccessToken = null;
  _memRefreshToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch (e) { /* ignore */ }
}

// --- Interceptor: attach token to every request ---
http.interceptors.request.use(async (config) => {
  // Skip auth header for auth routes
  const isAuthRoute = config.url?.startsWith('/auth/');
  if (!isAuthRoute) {
    const token = await getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// --- Interceptor: auto-refresh on 401 ---
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return http(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getStoredRefresh();
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        if (data.success) {
          await storeTokens(data.accessToken, data.refreshToken);
          processQueue(null, data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return http(originalRequest);
        }
        throw new Error('Refresh failed');
      } catch (refreshError) {
        processQueue(refreshError, null);
        await clearTokens();
        throw refreshError;
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// --- Helper: extract error message ---
function getError(err) {
  const data = err.response?.data;
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  return err.message || 'Something went wrong';
}

// ==================================================
// API Methods
// ==================================================
const api = {
  // --- AUTH ---
  login: async (phone, password) => {
    try {
      const { data } = await http.post('/auth/login', { phone, password });
      if (data.success) {
        await storeTokens(data.accessToken, data.refreshToken);
      }
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  requestOtp: async (phone) => {
    try {
      const { data } = await http.post('/auth/request-otp', { phone });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  verifyOtp: async (phone, code) => {
    try {
      const { data } = await http.post('/auth/verify-otp', { phone, code });
      if (data.success && data.accessToken) {
        await storeTokens(data.accessToken, data.refreshToken);
      }
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  setPassword: async (tempToken, password) => {
    try {
      const { data } = await http.post('/auth/set-password', { tempToken, password });
      if (data.success) {
        await storeTokens(data.accessToken, data.refreshToken);
      }
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  // Forgot password — request OTP for password reset
  forgotPassword: async (phone) => {
    try {
      const { data } = await http.post('/auth/forgot-password', { phone });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  // Reset password — verify OTP + set new password (auto-login)
  resetPassword: async (phone, code, newPassword) => {
    try {
      const { data } = await http.post('/auth/reset-password', { phone, code, newPassword });
      if (data.success && data.accessToken) {
        await storeTokens(data.accessToken, data.refreshToken);
      }
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  logout: async () => {
    try {
      const refreshToken = await getStoredRefresh();
      const accessToken = await getStoredToken();
      // Explicitly pass access token since interceptor skips /auth/ routes
      await http.post('/auth/logout', { refreshToken }, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        timeout: 5000, // Short timeout — don't block logout on network issues
      });
    } catch { /* ignore */ }
    await clearTokens();
  },

  // --- CUSTOMER (will be wired to real endpoints later) ---
  getProfile: async () => {
    try {
      const { data } = await http.get('/customer/profile');
      return data;
    } catch { return null; }
  },

  updateProfile: async ({ name, phone, address, city }) => {
    try {
      const { data } = await http.put('/customer/profile', { name, phone, address, city });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  // --- DASHBOARD — single endpoint for all dashboard data ---
  getDashboard: async () => {
    try {
      const { data } = await http.get('/customer/dashboard');
      return data;
    } catch { return null; }
  },

  // --- SERVICE ---
  getService: async () => {
    try {
      const dash = await api.getDashboard();
      return dash?.service || null;
    } catch { return null; }
  },

  getConnectionStatus: async () => {
    try {
      const dash = await api.getDashboard();
      return dash?.service ? { status: dash.service.connectionStatus } : null;
    } catch { return null; }
  },

  // --- BILLING (placeholders — will be implemented) ---
  getInvoices: async () => {
    try {
      const { data } = await http.get('/billing/invoices');
      return data;
    } catch { return []; }
  },

  getPayments: async () => {
    try {
      const { data } = await http.get('/billing/payments');
      return data;
    } catch { return []; }
  },

  getStatement: async (startDate, endDate) => {
    try {
      const { data } = await http.get('/billing/statement', { params: { startDate, endDate } });
      return data;
    } catch (err) {
      console.warn('Statement error:', err?.response?.data || err.message);
      return null;
    }
  },

  // --- MPESA ---
  initiatePayment: async (invoiceId, amount, phone, serviceId) => {
    try {
      const { data } = await http.post('/mpesa/pay', { invoiceId, amount, phone, serviceId });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  checkPaymentStatus: async (checkoutRequestId) => {
    try {
      const { data } = await http.get(`/mpesa/status/${checkoutRequestId}`);
      return data;
    } catch { return { status: 'unknown' }; }
  },

  // --- SMARTOLT ---
  getConnectionInfo: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/connection/service', { params });
      return data;
    } catch (err) {
      return { error: getError(err) };
    }
  },

  // Full ONU details: device info, signal, connected devices, LAN/WAN, optical
  getOnuDetails: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/connection/onu-details', { timeout: 30000, params });
      return data;
    } catch (err) {
      return { error: getError(err) };
    }
  },

  /** Connected devices only — faster for web/desktop dashboard */
  getConnectedDevices: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/connection/connected-devices', { timeout: 20000, params });
      return data;
    } catch (err) {
      return { error: getError(err) };
    }
  },

  changePppoePassword: async (newPassword) => {
    try {
      const { data } = await http.post('/connection/pppoe-password', { newPassword });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  changeWifiPassword: async (ssid, newPassword, serviceId) => {
    try {
      // SmartOLT WiFi change can take 30-60s
      const { data } = await http.post('/connection/wifi-password', { ssid, newPassword, serviceId }, { timeout: 60000 });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  getWifiStatus: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/connection/wifi-status', { params });
      return data;
    } catch (err) {
      return { canControl: false, error: getError(err) };
    }
  },

  setWifiControl: async (enabled, serviceId) => {
    try {
      const { data } = await http.post('/connection/wifi-control', { enabled, serviceId }, { timeout: 60000 });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  changeAppPassword: async (currentPassword, newPassword) => {
    try {
      const { data } = await http.post('/auth/change-password', { currentPassword, newPassword });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  getPlans: async () => {
    try {
      const { data } = await http.get('/plans');
      return data;
    } catch { return []; }
  },

  // --- PLAN UPGRADE / DOWNGRADE ---
  getAvailablePlans: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/plans/available', { params });
      return data;
    } catch (err) {
      return { error: getError(err) };
    }
  },

  calculatePlanChange: async (newPlanId, serviceId) => {
    try {
      const { data } = await http.post('/plans/calculate', { newPlanId, serviceId });
      return data;
    } catch (err) {
      return { error: getError(err) };
    }
  },

  initiatePlanChange: async (newPlanId, serviceId, phone) => {
    try {
      const { data } = await http.post('/plans/change', { newPlanId, serviceId, phone });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  getPlanChangeStatus: async (requestId) => {
    try {
      const { data } = await http.get(`/plans/change/${requestId}`);
      return data;
    } catch (err) {
      return { error: getError(err) };
    }
  },

  getPlanChangeHistory: async () => {
    try {
      const { data } = await http.get('/plans/history');
      return data;
    } catch { return []; }
  },

  // --- AI CHAT ---
  sendChatMessage: async (message) => {
    try {
      const { data } = await http.post('/chat/send', { message });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  getChatHistory: async () => {
    try {
      const { data } = await http.get('/chat/history');
      return data;
    } catch { return { messages: [] }; }
  },

  clearChatHistory: async () => {
    try {
      await http.delete('/chat/history');
    } catch { /* ignore */ }
  },

  // --- SUPPORT TICKETS ---
  createTicket: async ({ subject, category, priority, message }) => {
    try {
      const { data } = await http.post('/tickets', { subject, category, priority, message });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  getTickets: async (params = {}) => {
    try {
      const { data } = await http.get('/tickets', { params });
      return data;
    } catch { return { tickets: [] }; }
  },

  getTicket: async (id) => {
    try {
      const { data } = await http.get(`/tickets/${id}`);
      return data;
    } catch { return null; }
  },

  replyToTicket: async (id, message) => {
    try {
      const { data } = await http.post(`/tickets/${id}/reply`, { message });
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  closeTicket: async (id) => {
    try {
      const { data } = await http.put(`/tickets/${id}/close`);
      return data;
    } catch (err) {
      return { success: false, error: getError(err) };
    }
  },

  // --- LOYALTY REWARDS ---
  getLoyaltyBalance: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/loyalty/balance', { params });
      return data;
    } catch { return null; }
  },

  getLoyaltyHistory: async (serviceId) => {
    try {
      const params = serviceId ? { serviceId } : {};
      const { data } = await http.get('/loyalty/history', { params });
      return data;
    } catch { return { history: [] }; }
  },

  checkLoyaltyTokens: async () => {
    try {
      const { data } = await http.post('/loyalty/check');
      return data;
    } catch (err) {
      return { awarded: 0, error: getError(err) };
    }
  },

  redeemTokens: async (days, serviceId) => {
    try {
      const { data } = await http.post('/loyalty/redeem', { days, serviceId });
      return data;
    } catch (err) {
      const data = err.response?.data;
      return {
        success: false,
        error: getError(err),
        message: data?.message,
        code: data?.code,
      };
    }
  },

  // --- NOTIFICATIONS ---
  getNotifications: async (page = 1) => {
    try {
      const { data } = await http.get(`/notifications?page=${page}&limit=50`);
      return data;
    } catch { return { notifications: [] }; }
  },

  getUnreadCount: async () => {
    try {
      const { data } = await http.get('/notifications/unread-count');
      return data.count || 0;
    } catch { return 0; }
  },

  markNotificationRead: async (id) => {
    try {
      const { data } = await http.put(`/notifications/${id}/read`);
      return data;
    } catch { return { success: false }; }
  },

  markAllNotificationsRead: async () => {
    try {
      const { data } = await http.put('/notifications/read-all');
      return data;
    } catch { return { success: false }; }
  },

  registerPushToken: async (token, platform = 'android') => {
    try {
      const { data } = await http.post('/notifications/register-token', { token, platform });
      return data;
    } catch { return { success: false }; }
  },

  // --- DATA USAGE ---
  getDataUsage: async (days = 30, serviceId) => {
    try {
      const params = { days };
      if (serviceId) params.serviceId = serviceId;
      const { data } = await http.get('/customer/data-usage', { params });
      return data;
    } catch (err) {
      console.warn('Data usage error:', err?.response?.data || err.message);
      return null;
    }
  },
};

export default api;
