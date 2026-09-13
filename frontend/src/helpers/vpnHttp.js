import axios from 'axios';
import { attachVpnApiFallback } from './apiBase';

const vpnHttp = axios.create({
  timeout: 120000,
});

vpnHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const apiKey = process.env.REACT_APP_VPN_API_KEY;
  if (apiKey) config.headers['x-api-key'] = apiKey;
  return config;
});

attachVpnApiFallback(vpnHttp);

vpnHttp.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn(
        '[vpnHttp] 401 — VPN token rejected. Log out/in if peers fail to load; this does not log you out of TonyComm.'
      );
    }
    return Promise.reject(error);
  }
);

export { vpnHttp };
