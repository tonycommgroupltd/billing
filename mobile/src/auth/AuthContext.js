import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from '../api/client';
import { getStoredToken, clearTokens } from '../api/client';

// Configure how notifications are shown while app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Register for push notifications and send token to server
  const registerPushToken = async () => {
    try {
      console.log('[PUSH] Starting push token registration...');
      console.log('[PUSH] Platform:', Platform.OS);

      // Request permissions
      const { status: existing } = await Notifications.getPermissionsAsync();
      console.log('[PUSH] Existing permission status:', existing);
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log('[PUSH] Requested permission, got:', status);
      }
      if (finalStatus !== 'granted') {
        console.log('[PUSH] Permission not granted, aborting');
        return;
      }

      // Get project ID from app config or hardcode
      const projectId = Constants.expoConfig?.extra?.eas?.projectId 
        || 'd676ab3d-d9fc-4cb7-8c8a-a79907cb0a53';
      console.log('[PUSH] Using projectId:', projectId);

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const pushToken = tokenData.data;
      console.log('[PUSH] Got Expo push token:', pushToken);

      // Send to our API
      const result = await api.registerPushToken(pushToken, Platform.OS);
      console.log('[PUSH] Register result:', JSON.stringify(result));
    } catch (err) {
      console.error('[PUSH] Registration failed:', err.message, err);
    }
  };

  // On mount: check if we have a stored token → restore session
  useEffect(() => {
    (async () => {
      try {
        const token = await getStoredToken();
        if (token) {
          // Try to get profile with stored token
          const profile = await api.getProfile();
          if (profile && profile.id) {
            setUser(profile);
            // Re-register push token on session restore
            registerPushToken();
          } else {
            // Token might be expired but refresh interceptor will handle it
            // For now, clear and force re-login
            await clearTokens();
          }
        }
      } catch (e) {
        await clearTokens();
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  // Sign In (phone + password)
  const login = async (phone, password) => {
    setLoading(true);
    try {
      const result = await api.login(phone, password);
      if (result.success && result.user) {
        setUser(result.user);
        registerPushToken();
      }
      return result;
    } finally {
      setLoading(false);
    }
  };

  // Join Us — request OTP
  const requestOtp = async (phone) => {
    setLoading(true);
    try {
      const result = await api.requestOtp(phone);
      return result;
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const verifyOtp = async (phone, code) => {
    setLoading(true);
    try {
      const result = await api.verifyOtp(phone, code);
      if (result.success && !result.needsPassword && result.user) {
        setUser(result.user);
        registerPushToken();
      }
      // If needsPassword, the UI will navigate to SetPassword screen
      return result;
    } finally {
      setLoading(false);
    }
  };

  // Set password (after OTP for new users)
  const setPassword = async (tempToken, password) => {
    setLoading(true);
    try {
      const result = await api.setPassword(tempToken, password);
      if (result.success && result.user) {
        setUser(result.user);
        registerPushToken();
      }
      return result;
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    // Race the API call against a 3-second timeout so the user
    // is never stuck waiting for a slow/hung network call
    try {
      await Promise.race([
        api.logout(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (e) {
      console.warn('Logout API error (ignored):', e);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      initializing,
      login,
      requestOtp,
      verifyOtp,
      setPassword,
      logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
