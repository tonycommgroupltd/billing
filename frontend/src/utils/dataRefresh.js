import { useCallback, useEffect, useRef } from "react";

export const DATA_REFRESH_EVENT = "tcom-data-refresh";

/**
 * Broadcast that app data changed so open list/detail views can refetch.
 * @param {string|string[]} scopes e.g. 'customers', ['tickets', 'finance']
 */
export function triggerDataRefresh(scopes = ["*"]) {
  const list = Array.isArray(scopes) ? scopes : [scopes];
  window.dispatchEvent(
    new CustomEvent(DATA_REFRESH_EVENT, { detail: { scopes: list } })
  );
}

function scopesMatch(incoming, mine) {
  if (!incoming?.length || incoming.includes("*") || mine.includes("*")) return true;
  return incoming.some((s) => mine.includes(s));
}

/**
 * Subscribe to data-refresh events (and optionally tab visibility).
 * Keeps lists in sync after create/update/delete without a manual Refresh click.
 */
export function useDataRefresh(onRefresh, options = {}) {
  const { scopes = ["*"], onVisible = true, visibleDebounceMs = 800 } = options;
  const scopeKey = (Array.isArray(scopes) ? scopes : [scopes]).join("|");
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;
  const timerRef = useRef(null);

  const run = useCallback(() => {
    if (typeof cbRef.current === "function") cbRef.current();
  }, []);

  useEffect(() => {
    const scopeList = scopeKey.split("|");
    const onEvent = (event) => {
      if (scopesMatch(event.detail?.scopes, scopeList)) run();
    };

    const onVisibility = () => {
      if (!onVisible || document.hidden) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(run, visibleDebounceMs);
    };

    window.addEventListener(DATA_REFRESH_EVENT, onEvent);
    if (onVisible) document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener(DATA_REFRESH_EVENT, onEvent);
      if (onVisible) document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timerRef.current);
    };
  }, [run, onVisible, visibleDebounceMs, scopeKey]);
}
