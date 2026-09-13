import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NotificationRefreshContext = createContext(null);

export function NotificationRefreshProvider({ children }) {
  const [tick, setTick] = useState(0);

  const refreshNotifications = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({ tick, refreshNotifications }),
    [tick, refreshNotifications]
  );

  return (
    <NotificationRefreshContext.Provider value={value}>
      {children}
    </NotificationRefreshContext.Provider>
  );
}

export function useNotificationRefresh() {
  return useContext(NotificationRefreshContext);
}
