import { http } from '../helpers';

/**
 * Hotspot API v2 — matches hotspot.php backend
 * Revenue uses status='success', location via mac_locations/nas_locations,
 * vouchers use used/use_count model, user tracker via mpesa_transactions + RADIUS
 */

const API_BASE = 'hotspot.php';

const HotspotAPI = {
  // ===== DASHBOARD =====
  getDashboardStats: async (params = {}) => {
    const qs = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const res = await http.get(`${API_BASE}?action=dashboard-stats${qs ? '&' + qs : ''}`);
    return res.data;
  },

  getRevenueChart: async (period = '7days') => {
    const res = await http.get(`${API_BASE}?action=revenue-chart&period=${period}`);
    return res.data;
  },

  getRevenueByLocation: async (date = '') => {
    const url = date
      ? `${API_BASE}?action=revenue-by-location&date=${date}`
      : `${API_BASE}?action=revenue-by-location`;
    const res = await http.get(url);
    return res.data;
  },

  getPackageBreakdown: async (period = 'today') => {
    const res = await http.get(`${API_BASE}?action=package-breakdown&period=${period}`);
    return res.data;
  },

  getRecentActivity: async (limit = 20) => {
    const res = await http.get(`${API_BASE}?action=recent-activity&limit=${limit}`);
    return res.data;
  },

  getHourlyStats: async () => {
    const res = await http.get(`${API_BASE}?action=hourly-stats`);
    return res.data;
  },

  // ===== TRANSACTIONS =====
  getTransactions: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}?action=transactions&${qs}` : `${API_BASE}?action=transactions`;
    const res = await http.get(url);
    return res.data;
  },

  getTransactionDetail: async (id) => {
    const res = await http.get(`${API_BASE}?action=transaction-detail&id=${id}`);
    return res.data;
  },

  exportTransactions: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await http.get(`${API_BASE}?action=export-transactions&${qs}`);
    return res.data;
  },

  // ===== VOUCHERS =====
  getVouchers: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}?action=vouchers&${qs}` : `${API_BASE}?action=vouchers`;
    const res = await http.get(url);
    return res.data;
  },

  createVoucher: async (data) => {
    const res = await http.post(`${API_BASE}?action=vouchers`, data);
    return res.data;
  },

  getVoucherStats: async () => {
    const res = await http.get(`${API_BASE}?action=voucher-stats`);
    return res.data;
  },

  resetVoucher: async (id) => {
    const res = await http.post(`${API_BASE}?action=voucher-reset`, { id });
    return res.data;
  },

  // Alias for backwards compat with Vouchers.js
  updateVoucher: async (id, data) => {
    if (data.status === 'unused') {
      const res = await http.post(`${API_BASE}?action=voucher-reset`, { id });
      return res.data;
    }
    return { success: false, message: 'Only reset (unused) is supported' };
  },

  // ===== USER TRACKING =====
  getUserTracker: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}?action=user-tracker&${qs}` : `${API_BASE}?action=user-tracker`;
    const res = await http.get(url);
    return res.data;
  },

  // Keep old name for compatibility
  getActiveUsers: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}?action=user-tracker&${qs}` : `${API_BASE}?action=user-tracker`;
    const res = await http.get(url);
    return res.data;
  },

  getOnlineUsers: async () => {
    const res = await http.get(`${API_BASE}?action=online-users`);
    return res.data;
  },

  getUserSessions: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await http.get(`${API_BASE}?action=user-sessions&${qs}`);
    return res.data;
  },

  getUserDetail: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await http.get(`${API_BASE}?action=user-detail&${qs}`);
    return res.data;
  },

  getUserTrackerStats: async () => {
    const res = await http.get(`${API_BASE}?action=user-tracker-stats`);
    return res.data;
  },

  getTrafficStats: async (period = '24hours') => {
    const res = await http.get(`${API_BASE}?action=traffic-stats&period=${period}`);
    return res.data;
  },

  disconnectUser: async (username) => {
    const res = await http.post(`${API_BASE}?action=disconnect-user`, { username });
    return res.data;
  },

  // ===== PACKAGES (full CRUD + RADIUS sync + tier gen) =====
  getPackages: async () => {
    const res = await http.get(`${API_BASE}?action=packages`);
    return res.data;
  },

  createPackage: async (data) => {
    const res = await http.post(`${API_BASE}?action=packages`, data);
    return res.data;
  },

  updatePackage: async (id, data) => {
    const res = await http.post(`${API_BASE}?action=packages`, { ...data, id });
    return res.data;
  },

  deletePackage: async (id) => {
    const res = await http.post(`${API_BASE}?action=package-delete`, { id });
    return res.data;
  },

  syncPackageToRadius: async (id) => {
    const res = await http.post(`${API_BASE}?action=package-sync-radius`, { id });
    return res.data;
  },

  generateTiers: async (id) => {
    const res = await http.post(`${API_BASE}?action=package-generate-tiers`, { id });
    return res.data;
  },

  // ===== LOYALTY =====
  getLoyaltyData: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}?action=loyalty-data&${qs}` : `${API_BASE}?action=loyalty-data`;
    const res = await http.get(url);
    return res.data;
  },
};

export default HotspotAPI;
