import axios from 'axios';

const tr069Http = axios.create({
  // Direct to live TR-069 API (CORS allows localhost:3001). Dev proxy in setupProxy.js is optional fallback.
  baseURL: process.env.REACT_APP_TR069_API_URL || '/tr069-api',
  timeout: 120000,
});

tr069Http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const apiKey = process.env.REACT_APP_TR069_API_KEY;
  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }
  return config;
});

tr069Http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn(
        '[tr069Http] 401 — TR-069 API runs on production only. Use Production API mode or ignore on standby.'
      );
    }
    return Promise.reject(error);
  }
);

export { tr069Http };
