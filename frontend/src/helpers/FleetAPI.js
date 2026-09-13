import { ticketsHttp as http } from './ticketsHttp';

const FleetAPI = {
  getVehicles: async () => {
    const res = await http.get('/fleet/vehicles');
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return { data: res.data.data };
    }
    return { data: [] };
  },

  getDashboard: async () => {
    const res = await http.get('/fleet/dashboard');
    if (res?.data?.success && res.data.data) {
      return { data: res.data.data };
    }
    return { data: { vehicles: [], stats: {} } };
  },

  getLogs: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await http.get(`/fleet/logs${qs ? '?' + qs : ''}`);
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return { data: res.data.data };
    }
    return { data: [] };
  },

  getTodayContext: async (vehicleId, date = null) => {
    const params = new URLSearchParams({ vehicle_id: vehicleId });
    if (date) params.set('date', date);
    const res = await http.get(`/fleet/today?${params}`);
    if (res?.data?.success && res.data.data) {
      return { data: res.data.data };
    }
    return { data: null };
  },

  saveLog: async (payload) => {
    const res = await http.post('/fleet/logs', payload);
    return res?.data || { success: false };
  },

  updateVehicle: async (id, payload) => {
    const res = await http.put(`/fleet/vehicles/${id}`, payload);
    return res?.data || { success: false };
  },

  getRosterDay: async (date) => {
    const res = await http.get(`/fleet/roster-day?date=${encodeURIComponent(date)}`);
    if (res?.data?.success && res.data.data) {
      return { data: res.data.data };
    }
    return { data: null };
  },

  saveDailyAssignments: async (payload) => {
    const res = await http.post('/fleet/daily-assignments', payload);
    return res?.data || { success: false };
  },

  saveMaintenance: async (payload) => {
    const res = await http.post('/fleet/maintenance', payload);
    return res?.data || { success: false };
  },

  getMaintenance: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await http.get(`/fleet/maintenance${qs ? '?' + qs : ''}`);
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return { data: res.data.data };
    }
    return { data: [] };
  },

  getCleaningOverview: async () => {
    const res = await http.get('/fleet/cleaning');
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return { data: res.data.data };
    }
    return { data: [] };
  },

  getCareSummary: async (vehicleId = null) => {
    const qs = vehicleId ? `?vehicle_id=${encodeURIComponent(vehicleId)}` : '';
    const res = await http.get(`/fleet/care-summary${qs}`);
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return { data: res.data.data };
    }
    return { data: [] };
  },

  getFuelLogs: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await http.get(`/fleet/fuel${qs ? '?' + qs : ''}`);
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return { data: res.data.data };
    }
    return { data: [] };
  },

  saveFuelLog: async (payload) => {
    const res = await http.post('/fleet/fuel', payload);
    return res?.data || { success: false };
  },
};

export default FleetAPI;
