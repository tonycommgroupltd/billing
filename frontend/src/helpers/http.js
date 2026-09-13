import axios from 'axios';
import Swal from 'sweetalert2';
import store from '../store';
import ActionTypes from '../store/action-types';
import { attachApiFallback, isEmergencyBypassRequest, isProductionOnlyMicroserviceUrl, isStandbyLaravelApi } from './apiBase';

const http = axios.create({
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

attachApiFallback(http);

http.interceptors.response.use(
  (response) => {
    const method = String(response.config?.method || '').toLowerCase();
    if (
      method === 'delete' &&
      (response.status === 202 || response.data?.requires_approval)
    ) {
      const msg =
        response.data?.message ||
        'Delete requires Super Admin approval. Your request was submitted.';
      Swal.fire({
        icon: 'info',
        title: 'Approval required',
        text: msg,
      });
      // Prevent list pages that key off response.data.message from showing "Deleted!".
      return {
        ...response,
        data: {
          ...(response.data || {}),
          message: null,
          requires_approval: true,
          deletion_pending: true,
        },
      };
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const config = error.config || {};
    const url = `${config.baseURL || ''}${config.url || ''}`;

    if (status === 401 && !isEmergencyBypassRequest(config)) {
      // Standby JWT is invalid on production-only microservices — do not log out of TonyComm.
      if (isProductionOnlyMicroserviceUrl(url)) {
        return Promise.reject(error);
      }
      // On standby Laravel, ticket/notification gaps are expected — only logout for core API 401.
      if (isStandbyLaravelApi() && (url.includes('tickets-auth') || url.includes('/notifications'))) {
        return Promise.reject(error);
      }
      store.dispatch({ type: ActionTypes.LOGOUT_USER });
    }
    return Promise.reject(error);
  }
);

export { http };
