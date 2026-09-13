import axios from 'axios';
import {
  ensureTicketsAuth,
  getTicketsAuthToken,
  isBotProtectionResponse,
  resetTicketsAuthExchangeState,
} from './ticketsAuth';
import { getTicketsApiBase } from './ticketsApiBase';

const ticketsHttp = axios.create({
  baseURL: getTicketsApiBase(),
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true,
});

ticketsHttp.interceptors.request.use(async (config) => {
  if (!getTicketsAuthToken()) {
    await ensureTicketsAuth();
  }

  const ticketsToken = getTicketsAuthToken();
  if (ticketsToken) {
    config.headers.Authorization = `Bearer ${ticketsToken}`;
  } else {
    delete config.headers.Authorization;
  }

  return config;
});

ticketsHttp.interceptors.response.use(
  (response) => {
    const data = response?.data;
    if (typeof data === 'string' && isBotProtectionResponse(response, data)) {
      return Promise.reject(
        new Error('Tickets API blocked by bot protection — use /tickets-api proxy and log in again.')
      );
    }
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const body = error.response?.data;
    const bodyText = typeof body === 'string' ? body : '';

    if (isBotProtectionResponse(error.response, bodyText)) {
      return Promise.reject(
        new Error('Tickets API blocked by bot protection — use /tickets-api proxy and log in again.')
      );
    }

    if ((status === 401 || status === 403) && original && !original.__ticketsAuthRetried) {
      original.__ticketsAuthRetried = true;
      resetTicketsAuthExchangeState();
      const refreshed = await ensureTicketsAuth({ force: true });
      if (refreshed) {
        original.headers.Authorization = `Bearer ${refreshed}`;
        return ticketsHttp.request(original);
      }
    }

    if (status === 401 || status === 403) {
      console.warn('[ticketsHttp] Auth failed — log out and log in again to refresh tickets token.');
    }

    return Promise.reject(error);
  }
);

export { ticketsHttp };
