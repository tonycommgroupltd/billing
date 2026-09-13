import axios from 'axios';
import store from '../store';
import ActionTypes from '../store/action-types';

// Safely get environment variable with fallback
const getApiUrl = () => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
            return process.env.REACT_APP_API_URL;
        }
    } catch (e) {
        // process is not defined, use default
    }
    // Default fallback for local/proxied API in development
    return '/api';
};

// Get Node.js API URL for finance endpoints
const getNodeApiUrl = () => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_NODE_API_URL) {
            return process.env.REACT_APP_NODE_API_URL;
        }
    } catch (e) {
        // process is not defined, use default
    }
    // Default fallback to same-origin /api; setupProxy routes /api/finance to Node API in dev.
    return '/api';
};

const http = axios.create({
    baseURL: getApiUrl(),
    headers: {
        'Content-Type': 'application/json'
    }
});

http.interceptors.request.use(function (config) {
    // Try new database auth token first, then fall back to old token key
    let token = localStorage.getItem("auth_token") || localStorage.getItem("token");
    
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
});

http.interceptors.response.use(
    response => response,
    (error) => {
        // Only handle 401 (Unauthorized) as definitive auth failure
        // 403 (Forbidden) might be server-level blocking or permission issue,
        // not necessarily an invalid token - let the calling code handle it
        if (error.response && error.response.status === 401) {
            const url = String(error.config?.url || '');
            if (url.includes('/kra-etims')) {
                return Promise.reject(error);
            }
            console.warn('HTTP Interceptor: 401 Unauthorized - token invalid');
            // Token expired or invalid - clear auth
            localStorage.removeItem("auth_token");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            store.dispatch({ type: ActionTypes.LOGOUT_USER });
        }
        // For 403, don't automatically logout - let the calling code decide
        // based on whether we have stored user data
        return Promise.reject(error);
    }
);

// Node.js API instance for finance endpoints
const httpNode = axios.create({
    baseURL: getNodeApiUrl(),
});

httpNode.interceptors.request.use(function (config) {
    let token = localStorage.getItem("auth_token") || localStorage.getItem("token");
    const nodeApiKey = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_NODE_API_KEY)
        ? process.env.REACT_APP_NODE_API_KEY
        : 'tcom-api-key-2024';

    if (nodeApiKey) {
        config.headers['x-api-key'] = nodeApiKey;
    }

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

httpNode.interceptors.response.use(
    response => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            console.warn('HTTP Node Interceptor: 401 Unauthorized');
            localStorage.removeItem("auth_token");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            store.dispatch({ type: ActionTypes.LOGOUT_USER });
        }
        return Promise.reject(error);
    }
);

export { http, httpNode };
