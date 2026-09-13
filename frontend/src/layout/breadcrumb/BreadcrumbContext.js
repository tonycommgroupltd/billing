import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const BreadcrumbContext = createContext(null);

export function BreadcrumbProvider({ children }) {
  const [override, setOverrideState] = useState(null);

  const setOverride = useCallback((value) => {
    setOverrideState(value);
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideState(null);
  }, []);

  const value = useMemo(
    () => ({ override, setOverride, clearOverride }),
    [override, setOverride, clearOverride]
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbContext() {
  return useContext(BreadcrumbContext);
}

/** Set dynamic breadcrumb title/extra crumbs on detail pages. */
export function usePageBreadcrumb(config) {
  const ctx = useBreadcrumbContext();

  React.useEffect(() => {
    if (!ctx || !config) return undefined;
    ctx.setOverride(config);
    return () => ctx.clearOverride();
  }, [ctx, config?.title, config?.items, config?.icon, config?.sectionColor]);
}
