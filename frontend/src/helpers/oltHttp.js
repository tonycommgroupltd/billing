import axios from 'axios';

const oltHttp = axios.create({
  baseURL: process.env.REACT_APP_OLT_API_URL || '/olt-api',
  timeout: 180000,
});

oltHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const apiKey = process.env.REACT_APP_OLT_API_KEY;
  if (apiKey) config.headers['x-api-key'] = apiKey;
  return config;
});

oltHttp.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn(
        '[oltHttp] 401 — OLT API runs on production only. Use Production API mode or ignore on standby.'
      );
    }
    return Promise.reject(error);
  }
);

export { oltHttp };
