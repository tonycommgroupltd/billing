import { http } from '../helpers';

const API_BASE = 'user-presence.php';

const PresenceAPI = {
  heartbeat: async (payload = {}) => {
    const response = await http.post(`${API_BASE}/heartbeat`, payload);
    return response.data;
  },

  list: async () => {
    const response = await http.get(`${API_BASE}/list`);
    return response.data;
  },
};

export default PresenceAPI;
