import React, { useState, useEffect, useCallback, useRef } from "react";
import { DropdownToggle, DropdownMenu, UncontrolledDropdown } from "reactstrap";
import { Link } from "react-router-dom";
import { connect } from "react-redux";
import { formatDistanceToNow } from "date-fns";
import Icon from "../../../../components/icon/Icon";
import NotificationsAPI from "../../../../helpers/NotificationsAPI";
import { useNotificationRefresh } from "../../../notification/NotificationRefreshProvider";
import { STAFF_NOTIFICATION_REFRESH, STAFF_NOTIFICATION_SOUND } from "../../../../utils/staffNotifications";

const POLL_MS = 20000;
const POLL_MS_HIDDEN = 60000;
const NOTIFICATION_SOUND = `${process.env.PUBLIC_URL || ""}/mixkit-bell-notification-933.wav`;

const ICON_MAP = {
  wifi: { icon: "wifi", bg: "bg-primary-dim" },
  "package-fill": { icon: "package-fill", bg: "bg-success-dim" },
  inventory: { icon: "package-fill", bg: "bg-success-dim" },
  info: { icon: "info", bg: "bg-info-dim" },
  warning: { icon: "alert-circle", bg: "bg-warning-dim" },
  ha: { icon: "alert-circle", bg: "bg-warning-dim" },
  mpesa: { icon: "wallet", bg: "bg-success-dim" },
  ticket: { icon: "ticket", bg: "bg-primary-dim" },
  error: { icon: "cross-circle", bg: "bg-danger-dim" },
};

function getIconMeta(n) {
  return ICON_MAP[n.icon] || ICON_MAP[n.type] || { icon: "bell", bg: "bg-secondary-dim" };
}

function safeAgo(str) {
  if (!str) return "";
  try {
    return formatDistanceToNow(new Date(str), { addSuffix: true });
  } catch {
    return "";
  }
}

const Notification = ({ user }) => {
  const refreshCtx = useNotificationRefresh();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const mountedRef = useRef(false);
  const baselineRef = useRef(false);
  const seenIdsRef = useRef(new Set());
  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.preload = "auto";
    audio.volume = 0.75;
    audioRef.current = audio;

    const unlockAudio = () => {
      if (!audioRef.current || audioUnlockedRef.current) return;
      const sound = audioRef.current;
      const previousVolume = sound.volume;
      sound.volume = 0;
      sound
        .play()
        .then(() => {
          sound.pause();
          sound.currentTime = 0;
          sound.volume = previousVolume;
          audioUnlockedRef.current = true;
        })
        .catch(() => {
          sound.volume = previousVolume;
        });
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    const sound = audioRef.current;
    if (!sound) return;
    sound.currentTime = 0;
    sound.play().catch(() => {
      // Browser may block sound until the first click/key press.
    });
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await NotificationsAPI.getNotifications();
      if (!mountedRef.current) return;
      const nextNotifications = res.data || [];
      const nextIds = new Set(nextNotifications.map((item) => String(item.id)));

      if (!baselineRef.current) {
        baselineRef.current = true;
        seenIdsRef.current = nextIds;
      } else {
        const newExternalTicketEvents = nextNotifications.filter((item) => {
          const id = String(item.id);
          if (seenIdsRef.current.has(id)) return false;
          const type = String(item.type || "").toLowerCase();
          const title = String(item.title || "").toLowerCase();
          return type === "ticket" || title.includes("ticket");
        });

        // Mark all returned rows as seen before playback to prevent duplicates.
        seenIdsRef.current = new Set([...seenIdsRef.current, ...nextIds]);
        if (newExternalTicketEvents.length > 0) {
          playNotificationSound();
        }
      }

      setNotifications(nextNotifications);
      setUnread(res.unread || 0);
    } catch {
      /* silent */
    }
  }, [playNotificationSound, user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    baselineRef.current = false;
    seenIdsRef.current = new Set();
    load();

    const schedule = () => {
      clearInterval(timerRef.current);
      const ms = document.hidden ? POLL_MS_HIDDEN : POLL_MS;
      timerRef.current = setInterval(() => {
        if (!document.hidden) load();
      }, ms);
    };

    schedule();
    const onVisibility = () => {
      if (!document.hidden) load();
      schedule();
    };
    const onFocus = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (refreshCtx?.tick) load();
  }, [refreshCtx?.tick, load]);

  useEffect(() => {
    const onRefresh = () => load();
    const onSound = () => playNotificationSound();
    window.addEventListener(STAFF_NOTIFICATION_REFRESH, onRefresh);
    window.addEventListener(STAFF_NOTIFICATION_SOUND, onSound);
    return () => {
      window.removeEventListener(STAFF_NOTIFICATION_REFRESH, onRefresh);
      window.removeEventListener(STAFF_NOTIFICATION_SOUND, onSound);
    };
  }, [load, playNotificationSound]);

  const handleRead = async (n) => {
    if (!n.is_read) {
      try {
        await NotificationsAPI.markRead(n.id);
        if (!mountedRef.current) return;
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
        setUnread((prev) => Math.max(0, prev - 1));
      } catch {
        /* silent */
      }
    }
    if (n.link) setOpen(false);
  };

  const handleMarkAll = async (e) => {
    e.preventDefault();
    try {
      await NotificationsAPI.markAllRead();
      if (!mountedRef.current) return;
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: 1 })));
      setUnread(0);
    } catch {
      /* silent */
    }
  };

  return (
    <UncontrolledDropdown className="user-dropdown" isOpen={open} toggle={() => setOpen((o) => !o)}>
      <DropdownToggle
        tag="a"
        className="dropdown-toggle nk-quick-nav-icon"
        style={{ position: "relative", cursor: "pointer" }}
      >
        <div className={`icon-status ${unread > 0 ? "icon-status-danger" : "icon-status-na"}`}>
          <Icon name="bell" />
        </div>
        {unread > 0 && (
          <span className="splynx-notification-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownToggle>

      <DropdownMenu end className="dropdown-menu-xl dropdown-menu-s1">
        <div className="dropdown-head">
          <span className="sub-title nk-dropdown-title">
            Notifications
            {unread > 0 && <span className="splynx-notification-new">{unread} new</span>}
          </span>
          {unread > 0 && (
            <a href="#markall" onClick={handleMarkAll} style={{ fontSize: "0.8rem" }}>
              Mark all read
            </a>
          )}
        </div>

        <div className="dropdown-body splynx-notification-body">
          {notifications.length === 0 ? (
            <div className="text-center py-4 text-muted splynx-notification-empty">
              <Icon name="bell" style={{ fontSize: "1.8rem", display: "block", margin: "0 auto 6px", opacity: 0.3 }} />
              No notifications yet
            </div>
          ) : (
            <div className="nk-notification">
              {notifications.map((n) => {
                const meta = getIconMeta(n);
                const content = (
                  <>
                    <div className="nk-notification-icon">
                      <Icon name={meta.icon} className={`icon-circle ${meta.bg}`} />
                    </div>
                    <div className="nk-notification-content">
                      <div className={`nk-notification-text ${n.is_read ? "" : "fw-bold"}`}>{n.title}</div>
                      <div className="text-muted splynx-notification-message">{n.message}</div>
                      <div className="nk-notification-time">{safeAgo(n.created_at)}</div>
                    </div>
                  </>
                );

                return (
                  <div
                    key={n.id}
                    className={`nk-notification-item splynx-notification-item ${n.is_read ? "" : "is-unread"}`}
                    onClick={() => handleRead(n)}
                  >
                    {n.link ? (
                      <Link to={`${process.env.PUBLIC_URL}${n.link}`} className="splynx-notification-link">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DropdownMenu>
    </UncontrolledDropdown>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(Notification);
