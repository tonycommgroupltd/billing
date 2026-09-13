import React from "react";
import ReactDOM from 'react-dom';
import { BrowserRouter } from "react-router-dom";
import "./assets/scss/dashlite.scss";
import "./assets/scss/style-email.scss";
import "./App.css";
import App from './App';
import reportWebVitals from './reportWebVitals';
import store from './store';
import { Provider } from 'react-redux';
import { http } from './helpers';
import ActionTypes from './store/action-types';

// Check both token keys for compatibility (auth_token from login, token from reducer)
let token = localStorage.getItem("auth_token") || localStorage.getItem("token");
if (token) {
  // Skip verification for mock tokens
  const mockTokenList = [
    'mock-jwt-token-for-super-admin',
    'mock-jwt-token-for-main-admin',
    'mock-jwt-token-for-administrator'
  ];
  
  if (mockTokenList.includes(token)) {
    // Mock token - skip verification and let the app render
    // Token is already set, no need to reassign
  } else {
    // Real token - verify it using backend's simple base64 format (not JWT)
    try {
      // Backend uses simple base64-encoded JSON, not JWT
      const decoded = JSON.parse(atob(token));
      
      // Check if token has required fields
      if (!decoded || !decoded.user_id || !decoded.exp) {
        throw new Error('Invalid token format');
      }
      
      // Check expiration (exp is in seconds)
      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        // Token expired - clear it
        token = null;
        localStorage.removeItem("token");
        localStorage.removeItem("auth_token");
        store.dispatch({ type: ActionTypes.LOGOUT_USER });
      }
      // Token is valid - keep it (no issuer check needed for base64 tokens)
    } catch (err) {
      // Token verification failed - but don't clear it yet
      // Let the API call determine if it's really invalid
      console.warn('Token verification warning:', err.message);
      // Keep token and let API verify it
    }
  }
}
const render = () => {
  ReactDOM.render(
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>,
    document.getElementById("root")
  );
};

// Always render immediately - don't wait for async operations
render();

if (token) {
  // Skip API call for mock tokens
  const mockTokens = {
    'mock-jwt-token-for-super-admin': {
      id: 1,
      name: 'Super Admin',
      email: 'admin@test.com',
      phone: '0712848481',
      roles: ['super-administrator', 'administrator', 'manager', 'customer-creator', 'engineer', 'financial-manager', 'technician', 'reseller', 'customer']
    },
    'mock-jwt-token-for-main-admin': {
      id: 2,
      name: 'Main Admin',
      email: 'mainadmin@test.com',
      phone: '0712345678',
      roles: ['super-administrator', 'administrator', 'manager', 'customer-creator', 'engineer', 'financial-manager', 'technician', 'reseller', 'customer']
    },
    'mock-jwt-token-for-administrator': {
      id: 3,
      name: 'Administrator',
      email: 'administrator@test.com',
      phone: '0720000000',
      roles: ['super-administrator', 'administrator', 'manager']
    }
  };

  if (mockTokens[token]) {
    // Mock user for mock token
    const mockUserData = mockTokens[token];
    const mockUser = {
      id: mockUserData.id,
      name: mockUserData.name,
      email: mockUserData.email,
      phone: mockUserData.phone,
      // Use roles from mock token configuration
      all_roles: mockUserData.roles || [
        'super-administrator',
        'administrator',
        'manager',
        'customer-creator',
        'engineer',
        'financial-manager',
        'technician',
        'reseller',
        'customer'
      ],
      reset_password: true, // Set to true to bypass password reset requirement
      reset_token: null,
    };
    store.dispatch({ type: ActionTypes.LOGIN_USER, currentUser: mockUser, token: token });
  } else {
    // Real token - fetch user profile from API
    // First, try to restore user from localStorage if available
    const storedUser = localStorage.getItem('user');
    let hasValidStoredUser = false;
    
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        // Verify token hasn't expired before using stored user
        try {
          const decoded = JSON.parse(atob(token));
          if (decoded.exp >= Math.floor(Date.now() / 1000)) {
            // Token is valid, immediately set user state
            store.dispatch({ type: ActionTypes.LOGIN_USER, currentUser: userData, token: token });
            hasValidStoredUser = true;
          }
        } catch (e) {
          console.error('Token decode error:', e);
        }
      } catch (e) {
        console.error('Failed to parse stored user:', e);
      }
    }
    
    // Only fetch from API if we don't have valid stored user data
    // This prevents 403 errors from blocking the app
    if (!hasValidStoredUser) {
      // Fetch fresh user data from API
      http.get("/user-profile").then(res => {
        // API returns {user: {...}} or just user data
        const userData = res?.data?.user || res?.data;
        if (userData) {
          // Store token in both keys for compatibility
          localStorage.setItem('token', token);
          localStorage.setItem('auth_token', token);
          // Store user data as fallback
          localStorage.setItem('user', JSON.stringify(userData));
          store.dispatch({ type: ActionTypes.LOGIN_USER, currentUser: userData, token: token });
        }
      }).catch((error) => {
        // Log the full error for debugging
        console.error('Failed to fetch user profile:', error);
        console.error('Error response:', error.response);
        console.error('Error status:', error.response?.status);
        console.error('Error data:', error.response?.data);
        console.error('Request URL:', error.config?.url);
        console.error('Request headers:', error.config?.headers);
        
        // Check if we have stored user data first
        const storedUser = localStorage.getItem('user');
        const hasStoredUser = storedUser && token;
        
        // If API call fails, check error type
        if (error.response) {
        // Server responded with an error
        if (error.response.status === 401) {
          // 401 Unauthorized - token is definitely invalid
          console.warn('401 Unauthorized - token invalid, clearing tokens');
          localStorage.removeItem("token");
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
          store.dispatch({ type: ActionTypes.LOGOUT_USER });
        } else if (error.response.status === 403) {
          // 403 Forbidden - could be server-level blocking or permission issue
          // Don't immediately logout if we have stored user data
          console.warn('403 Forbidden - server blocking or permission issue');
          if (hasStoredUser) {
            // Try to verify token is still valid
            try {
              const decoded = JSON.parse(atob(token));
              if (decoded.exp >= Math.floor(Date.now() / 1000)) {
                // Token still valid, keep using stored user
                console.log('Token valid, using stored user despite 403');
                try {
                  const userData = JSON.parse(storedUser);
                  localStorage.setItem('token', token);
                  localStorage.setItem('auth_token', token);
                  store.dispatch({ type: ActionTypes.LOGIN_USER, currentUser: userData, token: token });
                } catch (e) {
                  console.error('Failed to parse stored user:', e);
                }
              } else {
                console.warn('Token expired, clearing');
                localStorage.removeItem("token");
                localStorage.removeItem("auth_token");
                localStorage.removeItem("user");
                store.dispatch({ type: ActionTypes.LOGOUT_USER });
              }
            } catch (e) {
              console.error('Token decode error:', e);
              // If we can't decode token, clear everything
              localStorage.removeItem("token");
              localStorage.removeItem("auth_token");
              localStorage.removeItem("user");
              store.dispatch({ type: ActionTypes.LOGOUT_USER });
            }
          } else {
            // No stored user, clear tokens
            localStorage.removeItem("token");
            localStorage.removeItem("auth_token");
            store.dispatch({ type: ActionTypes.LOGOUT_USER });
          }
        } else {
          // Other HTTP error (500, 404, etc.) - keep using stored user if available
          console.warn(`HTTP ${error.response.status} error - keeping stored user if available`);
          if (hasStoredUser) {
            try {
              const userData = JSON.parse(storedUser);
              const decoded = JSON.parse(atob(token));
              if (decoded.exp >= Math.floor(Date.now() / 1000)) {
                console.log('Using stored user data as fallback');
                localStorage.setItem('token', token);
                localStorage.setItem('auth_token', token);
                store.dispatch({ type: ActionTypes.LOGIN_USER, currentUser: userData, token: token });
              }
            } catch (e) {
              console.error('Failed to use stored user:', e);
            }
          }
        }
      } else {
        // Network error or no response - keep using stored user if available
        console.warn('Network error or no response - keeping stored user if available');
        if (hasStoredUser) {
          try {
            const userData = JSON.parse(storedUser);
            const decoded = JSON.parse(atob(token));
            if (decoded.exp >= Math.floor(Date.now() / 1000)) {
              console.log('Using stored user data as fallback for network error');
              localStorage.setItem('token', token);
              localStorage.setItem('auth_token', token);
              store.dispatch({ type: ActionTypes.LOGIN_USER, currentUser: userData, token: token });
            }
          } catch (e) {
            console.error('Failed to use stored user:', e);
          }
        }
      }
      });
    }
  }
}


// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
