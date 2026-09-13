import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../../components/icon/Icon";

/**
 * Browser-style back/forward for the SPA (especially useful in Electron,
 * where there is no browser chrome).
 */
const HistoryNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stackRef = useRef([]);
  const indexRef = useRef(-1);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  useEffect(() => {
    const entry = `${location.pathname}${location.search}${location.hash}`;
    const stack = stackRef.current;
    const currentIndex = indexRef.current;

    // Returning to an existing entry (back/forward or same URL) — move the cursor.
    if (currentIndex >= 0 && stack[currentIndex] === entry) {
      setCanBack(currentIndex > 0);
      setCanForward(currentIndex < stack.length - 1);
      return;
    }

    const existing = stack.lastIndexOf(entry);
    if (existing >= 0 && existing <= currentIndex) {
      indexRef.current = existing;
      setCanBack(existing > 0);
      setCanForward(existing < stack.length - 1);
      return;
    }

    // Fresh push: drop any forward entries, then append.
    const next = stack.slice(0, Math.max(currentIndex, -1) + 1);
    next.push(entry);
    stackRef.current = next;
    indexRef.current = next.length - 1;
    setCanBack(next.length > 1);
    setCanForward(false);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="splynx-history-nav" role="group" aria-label="Page history">
      <button
        type="button"
        className="splynx-history-nav__btn"
        title="Back"
        aria-label="Go back"
        disabled={!canBack}
        onClick={() => canBack && navigate(-1)}
      >
        <Icon name="arrow-left" />
      </button>
      <button
        type="button"
        className="splynx-history-nav__btn"
        title="Forward"
        aria-label="Go forward"
        disabled={!canForward}
        onClick={() => canForward && navigate(1)}
      >
        <Icon name="arrow-right" />
      </button>
    </div>
  );
};

export default HistoryNav;
