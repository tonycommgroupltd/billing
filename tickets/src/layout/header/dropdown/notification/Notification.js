import React, { useState, useEffect, useCallback, useRef } from "react";
import { DropdownToggle, DropdownMenu, UncontrolledDropdown } from "reactstrap";
import { Link } from "react-router-dom";
import { connect } from "react-redux";
import { formatDistanceToNow } from "date-fns";
import Icon from "../../../../components/icon/Icon";
import NotificationsAPI from "../../../../helpers/NotificationsAPI";

const POLL_MS = 30000; // refresh every 30 s

const ICON_MAP = {
  wifi:         { icon: "wifi",         bg: "bg-primary-dim"  },
  "package-fill":{ icon: "package-fill", bg: "bg-success-dim"  },
  inventory:    { icon: "package-fill", bg: "bg-success-dim"  },
  info:         { icon: "info",         bg: "bg-info-dim"     },
  warning:      { icon: "alert-circle", bg: "bg-warning-dim"  },
  error:        { icon: "cross-circle", bg: "bg-danger-dim"   },
};

function getIconMeta(n) {
  return ICON_MAP[n.icon] || ICON_MAP[n.type] || { icon: "bell", bg: "bg-secondary-dim" };
}

function safeAgo(str) {
  if (!str) return "";
  try { return formatDistanceToNow(new Date(str), { addSuffix: true }); } catch { return ""; }
}

const Notification = ({ user }) => {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread]               = useState(0);
  const [open, setOpen]                   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await NotificationsAPI.getNotifications(user.id);
      setNotifications(res.data || []);
      setUnread(res.unread || 0);
    } catch { /* silent */ }
  }, [user?.id]);

  // Initial load + polling
  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // Mark one as read and update local state
  const handleRead = async (n) => {
    if (!n.is_read) {
      try {
        await NotificationsAPI.markRead(n.id);
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
        setUnread(prev => Math.max(0, prev - 1));
      } catch { /* silent */ }
    }
  };

  // Mark all as read
  const handleMarkAll = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    try {
      await NotificationsAPI.markAllRead(user.id);
      setNotifications(prev => prev.map(x => ({ ...x, is_read: 1 })));
      setUnread(0);
    } catch { /* silent */ }
  };

  return (
    <UncontrolledDropdown className="user-dropdown" isOpen={open} toggle={() => setOpen(o => !o)}>
      <DropdownToggle tag="a" className="dropdown-toggle nk-quick-nav-icon" style={{ position: "relative", cursor: "pointer" }}>
        <div className={`icon-status ${unread > 0 ? "icon-status-danger" : "icon-status-na"}`}>
          <Icon name="bell" />
        </div>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#e85347", color: "#fff",
            borderRadius: "50%", fontSize: "0.6rem", fontWeight: 700,
            minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", lineHeight: 1, pointerEvents: "none",
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownToggle>

      <DropdownMenu end className="dropdown-menu-xl dropdown-menu-s1">
        {/* Header */}
        <div className="dropdown-head">
          <span className="sub-title nk-dropdown-title">
            Notifications
            {unread > 0 && (
              <span style={{
                marginLeft: 8, background: "#e85347", color: "#fff",
                borderRadius: 10, padding: "1px 7px", fontSize: "0.7rem", fontWeight: 700,
              }}>
                {unread} new
              </span>
            )}
          </span>
          {unread > 0 && (
            <a href="#markall" onClick={handleMarkAll} style={{ fontSize: "0.8rem" }}>
              Mark all read
            </a>
          )}
        </div>

        {/* Body */}
        <div className="dropdown-body" style={{ maxHeight: 380, overflowY: "auto" }}>
          {notifications.length === 0 ? (
            <div className="text-center py-4 text-muted" style={{ fontSize: "0.85rem" }}>
              <em className="icon ni ni-bell" style={{ fontSize: "1.8rem", display: "block", marginBottom: 6, opacity: 0.3 }} />
              No notifications yet
            </div>
          ) : (
            <div className="nk-notification">
              {notifications.map((n) => {
                const meta = getIconMeta(n);
                return (
                  <div
                    key={n.id}
                    className="nk-notification-item"
                    style={{
                      background: n.is_read ? "transparent" : "#f4f6ff",
                      cursor: "pointer",
                      borderLeft: n.is_read ? "3px solid transparent" : "3px solid #6576ff",
                      transition: "background 0.15s",
                    }}
                    onClick={() => handleRead(n)}
                  >
                    <div className="nk-notification-icon">
                      <Icon
                        name={meta.icon}
                        className={`icon-circle ${meta.bg}`}
                      />
                    </div>
                    <div className="nk-notification-content">
                      <div className="nk-notification-text" style={{ fontWeight: n.is_read ? 400 : 600 }}>
                        {n.title}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
                        {n.message}
                      </div>
                      <div className="nk-notification-time" style={{ marginTop: 3 }}>
                        {safeAgo(n.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dropdown-foot center">
          <Link to="/admin/inventory/my-inventory" onClick={() => setOpen(false)} style={{ fontSize: "0.85rem" }}>
            View My Inventory
          </Link>
        </div>
      </DropdownMenu>
    </UncontrolledDropdown>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(Notification);
