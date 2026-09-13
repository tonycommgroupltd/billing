import React, { useState, useEffect } from "react";
import Head from "../layout/head/Head";
import Content from "../layout/content/Content";
import { Card, Collapse, Modal, ModalBody } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Icon,
  Row,
  Col,
} from "../components/Component";
import { Link } from "react-router-dom";
import { http } from '../helpers';
import { socket } from '../socket';
import { PlugDisconnected24Regular, Edit20Regular } from "@fluentui/react-icons";
import { ensureTicketsAuth } from '../helpers/ticketsAuth';
import { tr069Http } from '../helpers/tr069Http';
import { oltHttp } from '../helpers/oltHttp';
import { isStandbyLaravelApi } from '../helpers/apiBase';
import { connect } from 'react-redux';
import {
  parseTicketStatsResponse,
  userHasTicketDashboardAccess,
} from '../utils/ticketDashboardStats';

const DASHBOARD_STATS_CACHE_KEY = 'app_tcom_dashboard_stats_v1';

function loadCachedDashboardStats() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function saveCachedDashboardStats(payload) {
  try {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      sessionStorage.setItem(DASHBOARD_STATS_CACHE_KEY, JSON.stringify(payload));
    }
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function formatDashboardCount(value, loading) {
  if (loading) return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

function formatDashboardMoney(value, loading) {
  if (loading) return '—';
  if (value == null || value === '') return '0.00';
  const normalized = String(value).replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}

// Available dashboard shortcuts. `roles: []` means visible to any admin-area user.
const SHORTCUTS_CATALOG = [
  { id: "add-lead", label: "Add lead", link: "/admin/leads/add", icon: "user-add", color: "button-success", roles: ["super-administrator", "administrator", "manager", "customer-care", "technician", "engineer", "customer-creator"] },
  { id: "leads", label: "Leads", link: "/admin/leads/list", icon: "user-list", color: "button-purple", roles: ["super-administrator", "administrator", "manager", "customer-care", "technician", "engineer", "customer-creator"] },
  { id: "add-customer", label: "Add customer", link: "/admin/customers/add", icon: "user-add", color: "button-purple", roles: [] },
  { id: "customers", label: "Customers", link: "/admin/customers/list", icon: "users", color: "button-info", roles: [] },
  { id: "online-customers", label: "Online customers", link: "/admin/customers/online", icon: "signal", color: "button-success", roles: [] },
  { id: "add-ticket", label: "Add ticket", link: "/admin/tickets/create", icon: "ticket", color: "button-info", roles: ["super-administrator", "administrator", "manager", "technician", "engineer", "customer-creator"] },
  { id: "tickets", label: "Tickets", link: "/admin/tickets/list", icon: "ticket", color: "button-purple", roles: ["super-administrator", "administrator", "manager", "technician", "engineer", "customer-creator"] },
  { id: "send-sms", label: "Send message", link: "/admin/sms/send-single", icon: "msg", color: "button-info", roles: ["super-administrator", "administrator", "manager", "financial-manager"] },
  { id: "whatsapp", label: "WhatsApp", link: "/admin/whatsapp/outbox", icon: "whatsapp", color: "button-success", roles: ["super-administrator", "administrator"] },
  { id: "add-router", label: "Add router", link: "/admin/networking/routers/add", icon: "network", color: "button-success", roles: ["super-administrator", "administrator"] },
  { id: "add-tariff", label: "Add internet tariff plan", link: "/admin/tariffs/internet--add", icon: "coins", color: "button-success", roles: ["super-administrator", "administrator", "manager", "financial-manager"] },
  { id: "add-hardware", label: "Add hardware", link: "/admin/company/tr069", icon: "hard-drive", color: "button-success", roles: ["super-administrator", "administrator"] },
  { id: "invoices", label: "Invoices", link: "/admin/finance/invoices", icon: "file-text", color: "button-info", roles: ["super-administrator", "administrator", "manager", "financial-manager"] },
  { id: "olt-monitoring", label: "OLT monitoring", link: "/admin/company/olt-monitoring", icon: "network", color: "button-success", roles: ["super-administrator", "administrator"] },
  { id: "tr069", label: "TR-069 devices", link: "/admin/company/tr069", icon: "globe", color: "button-info", roles: ["super-administrator", "administrator"] },
  { id: "configure-system", label: "Configure the system", link: "/admin/administration", icon: "setting", color: "button-secondary", roles: ["super-administrator", "administrator"] },
  { id: "configure-modules", label: "Configure modules", link: "/admin/administration", icon: "setting", color: "button-secondary", roles: ["super-administrator", "administrator"] },
];

const DEFAULT_SHORTCUT_IDS = [
  "add-lead",
  "leads",
  "add-customer",
  "add-ticket",
  "send-sms",
  "add-router",
  "add-hardware",
  "add-tariff",
  "configure-system",
  "configure-modules",
];
const SHORTCUTS_STORAGE_PREFIX = "dashboard_shortcuts_v1";

function loadSavedShortcutIds(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function resolveShortcutIds(savedIds, availableShortcuts) {
  const availableIds = new Set(availableShortcuts.map((s) => s.id));
  const fromSaved = (savedIds || []).filter((id) => availableIds.has(id));
  if (fromSaved.length > 0) return fromSaved;

  return DEFAULT_SHORTCUT_IDS.filter((id) => availableIds.has(id));
}

const Homepage = ({ user }) => {
  const [data, setData] = useState(() => loadCachedDashboardStats() || {});
  const [statsLoading, setStatsLoading] = useState(() => !loadCachedDashboardStats());
  const [statsError, setStatsError] = useState(null);
  const [cpuUsage, setCpuUsage] = useState(null);
  const [iowait, setIowait] = useState(null);
  const [ticketStats, setTicketStats] = useState({
    newTickets: 0,
    workInProgress: 0,
    resolved: 0,
    waitingOnAgent: 0,
    installations: 0,
  });
  const [devicesDown, setDevicesDown] = useState(0);
  const [monitoringDevices, setMonitoringDevices] = useState(0);
  const [monitoringSnmpDown, setMonitoringSnmpDown] = useState(0);

  const [isCpuOpen, setIsCpuOpen] = useState(true);
  const toggleCpu = () => setIsCpuOpen(!isCpuOpen);

  const [isNetOpen, setIsNetOpen] = useState(true);
  const toggleNet = () => setIsNetOpen(!isNetOpen);

  const [isLeadOpen, setIsLeadOpen] = useState(true);
  const toggleLead = () => setIsLeadOpen(!isLeadOpen);

  const [isCustOpen, setIsCustOpen] = useState(true);
  const toggleCust = () => setIsCustOpen(!isCustOpen);

  const [isFinOpen, setIsFinOpen] = useState(true);
  const toggleFin = () => setIsFinOpen(!isFinOpen);

  const [isTickOpen, setIsTickOpen] = useState(true);
  const toggleTick = () => setIsTickOpen(!isTickOpen);

  const { all_roles } = user;
  const showTicketStats = userHasTicketDashboardAccess(all_roles || []);
  const isTicketAdmin = (all_roles || []).some((r) =>
    ['super-administrator', 'administrator', 'manager'].includes(r)
  );

  const shortcutStorageKey = `${SHORTCUTS_STORAGE_PREFIX}_${user?.id ?? "default"}`;

  const availableShortcuts = SHORTCUTS_CATALOG.filter(
    (s) => s.roles.length === 0 || s.roles.some((r) => (all_roles || []).includes(r))
  );

  const [enabledShortcutIds, setEnabledShortcutIds] = useState(() =>
    resolveShortcutIds(loadSavedShortcutIds(shortcutStorageKey), availableShortcuts)
  );
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [draftShortcutIds, setDraftShortcutIds] = useState([]);

  const activeShortcuts = enabledShortcutIds
    .map((id) => availableShortcuts.find((s) => s.id === id))
    .filter(Boolean);

  const rolesKey = (all_roles || []).slice().sort().join(",");

  const displayCpuUsage = cpuUsage ?? data?.server?.cpu_usage ?? 0;
  const displayIowait = iowait ?? data?.server?.iowait ?? 0;
  const count = (value) => formatDashboardCount(value, statsLoading);
  const money = (value) => formatDashboardMoney(value, statsLoading);

  useEffect(() => {
    if (!user?.id) return;

    const roles = user.all_roles || [];
    const shortcuts = SHORTCUTS_CATALOG.filter(
      (s) => s.roles.length === 0 || s.roles.some((r) => roles.includes(r))
    );
    const key = `${SHORTCUTS_STORAGE_PREFIX}_${user.id}`;
    const saved =
      loadSavedShortcutIds(key)
      || loadSavedShortcutIds(`${SHORTCUTS_STORAGE_PREFIX}_default`);

    setEnabledShortcutIds((prev) => {
      const next = resolveShortcutIds(saved, shortcuts);
      if (prev.length === next.length && prev.every((id, index) => id === next[index])) {
        return prev;
      }
      return next;
    });
  }, [user?.id, rolesKey]);

  const openShortcutEditor = () => {
    setDraftShortcutIds(enabledShortcutIds);
    setShortcutModalOpen(true);
  };

  const toggleDraftShortcut = (id) => {
    setDraftShortcutIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveShortcuts = () => {
    const validIds = draftShortcutIds.filter((id) =>
      availableShortcuts.some((s) => s.id === id)
    );
    setEnabledShortcutIds(validIds);
    try {
      localStorage.setItem(shortcutStorageKey, JSON.stringify(validIds));
    } catch (_) {
      /* ignore storage errors */
    }
    setShortcutModalOpen(false);
  };

  useEffect(() => {
    let cancelled = false;

    socket.connect();

    const fetchDashboardStats = async () => {
      try {
        const response = await http.get('/dashboard-stats', { timeout: 60000 });
        if (!cancelled && response.data) {
          setData(response.data);
          saveCachedDashboardStats(response.data);
          setStatsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const status = error.response?.status;
          if (status === 403) {
            setStatsError('Dashboard stats are not available for your role.');
          } else if (!loadCachedDashboardStats()) {
            setStatsError('Could not load dashboard stats. Retrying…');
          }
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    const fetchTicketAndDeviceStats = async () => {
      const onStandby = isStandbyLaravelApi();

      if (!onStandby) {
        try {
          await ensureTicketsAuth();
          if (!cancelled) {
            const { default: TicketsAPI } = await import('../helpers/TicketsAPI');
            // Stats endpoint only — do not pull the full ticket list (was ~10k rows).
            const statsResp = await TicketsAPI.getStats();
            if (!cancelled) {
              const apiStats = parseTicketStatsResponse(statsResp);
              setTicketStats({
                newTickets: apiStats.newTickets,
                workInProgress: apiStats.workInProgress,
                resolved: apiStats.resolved,
                waitingOnAgent: apiStats.waitingOnAgent,
                installations: apiStats.installations,
              });
            }
          }
        } catch (_) {
          /* keep last ticket stats on screen */
        }
      }

      if (!onStandby) {
        try {
          const tr069Resp = await tr069Http.get('/stats');
          if (!cancelled) {
            const offline = tr069Resp.data?.offline;
            const total = tr069Resp.data?.total;
            const online = tr069Resp.data?.online;
            setDevicesDown(
              offline != null
                ? Number(offline) || 0
                : Math.max(0, (Number(total) || 0) - (Number(online) || 0)),
            );
          }
        } catch (_) {
          if (!cancelled) setDevicesDown(0);
        }

        try {
          const oltResp = await oltHttp.get('/olts');
          if (!cancelled) {
            const total = Number(oltResp.data?.total) || 0;
            const online = Number(oltResp.data?.online) || 0;
            setMonitoringDevices(total);
            setMonitoringSnmpDown(Math.max(0, total - online));
          }
        } catch (_) {
          if (!cancelled) {
            setMonitoringDevices(0);
            setMonitoringSnmpDown(0);
          }
        }
      }
    };

    const onNotification = (payload) => {
      if (cancelled) return;
      if (payload.params[1] === 'usage:::') {
        setCpuUsage(payload.params[2]);
        setIowait(payload.params[3]);
      }
    };

    fetchDashboardStats();
    fetchTicketAndDeviceStats();
    const statsTimer = setInterval(() => {
      if (document.hidden) return;
      fetchDashboardStats();
    }, 30000);
    const miscTimer = setInterval(() => {
      if (document.hidden) return;
      fetchTicketAndDeviceStats();
    }, 60000);
    socket.on('notification', onNotification);

    return () => {
      cancelled = true;
      socket.off('notification', onNotification);
      socket.disconnect();
      clearInterval(statsTimer);
      clearInterval(miscTimer);
    };
  }, []);

  return (
    <React.Fragment>
      <Head title="Dashboard"></Head>
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">
              Dashboard
            </BlockTitle>
            {statsError ? (
              <p className="text-soft mb-0" style={{ fontSize: '13px' }}>{statsError}</p>
            ) : null}
          </BlockHeadContent>
        </BlockHead>
        <Block>
          <Row className="g-gs dashboard-top">
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="users" />
                    </span>
                    <span className="text">Online customers</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">View</span>
                    <span id="dashboard_top_online" className="count">{count(data?.online_customers)}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/customers/online`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner dashboards-top-block-item p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="user-add" />
                    </span>
                    <span className="text">New customers</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">View</span>
                    <span className="count">{count(data?.new_customers)}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/customers/list?status=new`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner dashboards-top-block-item p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="ticket" />
                    </span>
                    <span className="text">New tickets</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{ticketStats.newTickets}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/tickets/list?status=new`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner dashboards-top-block-item p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <PlugDisconnected24Regular />
                    </span>
                    <span className="text">Devices down</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">View</span>
                    <span className="count">{devicesDown}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/company/tr069`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>
          </Row>
          <div className="shortcuts-wrap dashboard-shortcut mt-0 mb-24">
            <strong className="heading">Shortcuts</strong>
            <button
              type="button"
              className="shortcuts-edit-btn"
              title="Edit shortcuts"
              aria-label="Edit shortcuts"
              onClick={openShortcutEditor}
            >
              <Edit20Regular />
            </button>
            <div className="shortcuts-list">
              {activeShortcuts.length === 0 ? (
                <span className="text-soft" style={{ marginTop: "12px", fontSize: "13px" }}>
                  No shortcuts yet — click the pencil to add some.
                </span>
              ) : (
                activeShortcuts.map((s) => (
                  <div className="shortcuts-button" key={s.id}>
                    <Link to={`${process.env.PUBLIC_URL}${s.link}`} className={s.color} title={s.label}>
                      <span className="icon-wrap me-4">
                        <Icon name={s.icon} />
                      </span>
                      <span className="button-title"><span>{s.label}</span></span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          <Modal isOpen={shortcutModalOpen} toggle={() => setShortcutModalOpen(false)} size="md">
            <ModalBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Edit shortcuts</h5>
                <a
                  href="#close"
                  className="close"
                  onClick={(ev) => { ev.preventDefault(); setShortcutModalOpen(false); }}
                >
                  <Icon name="cross-sm" />
                </a>
              </div>
              <p className="text-soft" style={{ fontSize: "13px" }}>
                Choose which quick actions appear on your dashboard.
              </p>
              <ul className="list-group list-group-flush">
                {availableShortcuts.map((s) => (
                  <li key={s.id} className="list-group-item" style={{ padding: "10px 4px" }}>
                    <div className="form-check mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`shortcut-${s.id}`}
                        checked={draftShortcutIds.includes(s.id)}
                        onChange={() => toggleDraftShortcut(s.id)}
                      />
                      <label className="form-check-label d-flex align-items-center w-100" htmlFor={`shortcut-${s.id}`}>
                        <span className="icon-wrap me-2" style={{ minWidth: "22px" }}>
                          <Icon name={s.icon} />
                        </span>
                        <span>{s.label}</span>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="d-flex justify-content-end mt-3" style={{ gap: "8px" }}>
                <button type="button" className="btn btn-outline-light" onClick={() => setShortcutModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={saveShortcuts}>
                  Save
                </button>
              </div>
            </ModalBody>
          </Modal>
          <Row className="g-gs">
            <Col sm="6">
              {(all_roles.includes("super-administrator") || all_roles.includes("administrator")) ?
                <>
                  <Card className="dashboard-status spl-collapsed-panel">
                    <div className="card-header dropup" onClick={toggleCpu}>
                      <span className="icon-wrap">
                        <Icon name="server" />
                      </span>
                      <strong>System status</strong>
                      <div className="pull-right">
                        <span className="close-card-btn icon-wrap">
                          {isCpuOpen ? <Icon name="downward-ios" /> : <Icon name="upword-ios" />}
                        </span>
                      </div>
                    </div>
                    <Collapse isOpen={isCpuOpen}>
                      <div className="card-body">
                        <ul className="list-group list-group-striped">
                          <li className="list-group-item"> CPU cores
                            <span className="list-group-item-value">{data?.server?.cores ?? 0}</span>
                          </li>
                          <li className="list-group-item"> Load average (1,5,15 min)
                            <span id="dashboard_status_load_average" className="list-group-item-value">{data?.server?.load_average ?? 0}</span>
                          </li>
                          <li className="list-group-item"> CPU usage
                            <div className="progressBarHolder">
                              <div id="dashboard_status_cpu_usage_progress" className="progress progress-free">
                                <div role="progressbar" className="progress-bar bg-warning" style={{ width: displayCpuUsage + '%' }}>
                                  <span id="dashboard_status_cpu_usage" className="progress-value">{statsLoading && cpuUsage == null && data?.server?.cpu_usage == null ? '—' : `${displayCpuUsage} %`}</span>
                                </div>
                              </div>
                            </div>
                          </li>
                          <li className="list-group-item"> Memory: {data?.server?.memory?.total ?? 0} (Free {data?.server?.memory?.percent ?? 0} %)
                            <div className="progressBarHolder">
                              <div id="dashboard_status_memory_progress" className="progress">
                                <div title={data?.server?.memory?.used ?? 0} role="progressbar" className="progress-bar bg-warning" style={{ width: (100 - data?.server?.memory?.percent ?? 0) + '%' }}>
                                  <span className="progress-value">Used</span>
                                </div>
                                <div title={data?.server?.memory?.free ?? 0} role="progressbar" className="progress-bar bg-success" style={{ width: (data?.server?.memory?.percent ?? 0) + '%' }}>
                                  <span className="progress-value">Free</span>
                                </div>
                              </div>
                            </div>
                          </li>
                          <li className="list-group-item"> I/O wait
                            <div className="progressBarHolder">
                              <div id="dashboard_status_iowait_progress" className="progress progress-free">
                                <div role="progressbar" className="progress-bar bg-warning" style={{ width: displayIowait + '%' }}>
                                  <span id="dashboard_status_iowait" className="progress-value">{statsLoading && iowait == null && data?.server?.iowait == null ? '—' : `${displayIowait} %`}</span>
                                </div>
                              </div>
                            </div>
                          </li>
                          {data?.server?.swap?.total ?
                            <li className="list-group-item"> Swap: {data?.server?.swap?.total ?? 0} (Free {data?.server?.swap?.percent ?? 0} %)
                              <div className="progressBarHolder">
                                <div id="dashboard_status_swap_progress" className="progress">
                                  <div title={data?.server?.swap?.used} role="progressbar" className="progress-bar bg-warning" style={{ width: (100 - data?.server?.swap?.percent ?? 0) + '%' }}>
                                    <span className="progress-value">Used</span>
                                  </div>
                                  <div title={data?.server?.swap?.free} role="progressbar" className="progress-bar bg-success" style={{ width: (data?.server?.swap?.percent ?? 0) + '%' }}>
                                    <span className="progress-value">Free</span>
                                  </div>
                                </div>
                              </div>
                            </li> : null}
                          <li className="list-group-item"> Disk: {data?.server?.disk?.total ?? 0} (Free {data?.server?.disk?.percent ?? 0} %)
                            <div className="progressBarHolder">
                              <div className="progress">
                                <div role="progressbar" className="progress-bar bg-warning" style={{ width: (100 - data?.server?.disk?.percent ?? 0) + '%' }}>
                                  <span className="progress-value">Used</span>
                                </div>
                                <div role="progressbar" className="progress-bar bg-success" style={{ width: (data?.server?.disk?.percent ?? 0) + '%' }}>
                                  <span className="progress-value">Free</span>
                                </div>
                              </div>
                            </div>
                          </li>
                          <li className="list-group-item"> Last DB backup
                            <span className="list-group-item-value" style={data?.server?.backup_time ? {} : { color: 'red', fontWeight: 'bold' }}>
                              <time className="timeago" title={data?.server?.backup_time ?? 'Never'}>{data?.server?.backup_time_ago ?? 'Never'}</time>  {data?.server?.backup_time ? '(' + (data?.server?.backup_size + ')' ?? '') : ''}
                            </span>
                          </li>
                          <li className="list-group-item"> Last remote backup
                            <span className="list-group-item-value" style={data?.server?.remote_backup_time ? {} : { color: 'red', fontWeight: 'bold' }}>
                              <time className="timeago" title={data?.server?.remote_backup_time ?? 'Never'}>{data?.server?.remote_backup_time_ago ?? 'Never'}</time>  {data?.server?.remote_backup_time ? '(' + (data?.server?.remote_backup_size + ')' ?? '') : ''}
                            </span>
                          </li>
                          <li className="list-group-item"> Last standby sync
                            <span className="list-group-item-value" style={data?.server?.standby_sync_time ? {} : { color: 'red', fontWeight: 'bold' }}>
                              <time className="timeago" title={data?.server?.standby_sync_time ?? 'Never'}>{data?.server?.standby_sync_time_ago ?? 'Never'}</time>
                              {data?.server?.standby_sync_size ? ` (${data.server.standby_sync_size})` : ''}
                            </span>
                          </li>
                          <li className="list-group-item"> Standby replication
                            <span
                              className="list-group-item-value"
                              style={
                                data?.server?.standby_replication_ok
                                  ? { color: '#16a34a', fontWeight: 'bold' }
                                  : { color: 'red', fontWeight: 'bold' }
                              }
                            >
                              {data?.server?.standby_replication_label ?? 'Unknown'}
                            </span>
                          </li>
                        </ul>
                      </div>
                    </Collapse>
                  </Card>
                  <Card className="dashboard-status spl-collapsed-panel">
                    <div className="card-header dropup" onClick={toggleNet}>
                      <span className="icon-wrap color-success">
                        <Icon name="network" />
                      </span>
                      <strong>Networking</strong>
                      <div className="pull-right">
                        <span className="close-card-btn icon-wrap">
                          {isNetOpen ? <Icon name="downward-ios" /> : <Icon name="upword-ios" />}
                        </span>
                      </div>
                    </div>
                    <Collapse isOpen={isNetOpen}>
                      <div className="card-body">
                        <ul className="list-group list-group-striped">
                          <li className="list-group-item"> Routers
                            <span id="admin_dashboard_panels_networking_routers" className="list-group-item-value">{count(data?.all_routers)}</span>
                          </li>
                          <li className="list-group-item"> Monitoring devices
                            <span id="admin_dashboard_panels_networking_monitoring" className="list-group-item-value">{monitoringDevices}</span>
                          </li>
                          <li className="list-group-item"> Devices down (SNMP)
                            <span id="admin_dashboard_panels_networking_monitoring_snmp" className="list-group-item-value">{monitoringSnmpDown}</span>
                          </li>
                          <li className="list-group-item"> Devices down (TR-069)
                            <span id="admin_dashboard_panels_networking_monitoring_ping" className="list-group-item-value">{devicesDown}</span>
                          </li>
                          <li className="list-group-item"> IPv4 networks
                            <span id="admin_dashboard_panels_networking_networks" className="list-group-item-value">{count(data?.ipv4_networks)}</span>
                          </li>
                          <li className="list-group-item"> Total private addresses
                            <span id="admin_dashboard_panels_networking_private_total" className="list-group-item-value">{count(data?.private_addresses_total)}</span>
                          </li>
                          <li className="list-group-item"> Private addresses used
                            <span id="admin_dashboard_panels_networking_private_used" className="list-group-item-value">{count(data?.private_addresses_used)}</span>
                          </li>
                          <li className="list-group-item"> Total public addresses
                            <span id="admin_dashboard_panels_networking_public_total" className="list-group-item-value">{count(data?.public_addresses_total)}</span>
                          </li>
                          <li className="list-group-item"> Public addresses used
                            <span id="admin_dashboard_panels_networking_public_used" className="list-group-item-value">{count(data?.public_addresses_used)}</span>
                          </li>
                        </ul>
                      </div>
                    </Collapse>
                  </Card>
                </> :
                <Card className="dashboard-status spl-collapsed-panel">
                  <div className="card-header dropup" onClick={toggleCust}>
                    <span className="icon-wrap color-purple">
                      <Icon name="users" />
                    </span>
                    <strong>Customers</strong>
                    <div className="pull-right">
                      <span className="close-card-btn icon-wrap">
                        {isCustOpen ? <Icon name="downward-ios" /> : <Icon name="upword-ios" />}
                      </span>
                    </div>
                  </div>
                  <Collapse isOpen={isCustOpen}>
                    <div className="card-body">
                      <ul className="list-group list-group-striped">
                        <li className="list-group-item"> Total <span id="admin_dashboard_panels_customers_total"
                          className="list-group-item-value">{count(data?.all_customers)}</span></li>
                        <li className="list-group-item"> New <span id="admin_dashboard_panels_customers_new"
                          className="list-group-item-value">{count(data?.new_customers)}</span></li>
                        <li className="list-group-item"> Active <span id="admin_dashboard_panels_customers_active"
                          className="list-group-item-value">{count(data?.active_customers)}</span></li>
                        <li className="list-group-item"> Online <span id="admin_dashboard_panels_customers_online"
                          className="list-group-item-value">{count(data?.online_customers)}</span></li>
                        <li className="list-group-item"> Online today <span id="admin_dashboard_panels_customers_onlineToday"
                          className="list-group-item-value">{count(data?.online_today_customers)}</span></li>
                        <li className="list-group-item"> Blocked <span id="admin_dashboard_panels_customers_blocked"
                          className="list-group-item-value">{count(data?.blocked_customers)}</span></li>
                        <li className="list-group-item"> Inactive <span id="admin_dashboard_panels_customers_disabled"
                          className="list-group-item-value">{count(data?.inactive_customers)}</span></li>
                        <li className="list-group-item"> Added last month <span id="admin_dashboard_panels_customers_forMonth"
                          className="list-group-item-value">{count(data?.last_month_customers)}</span></li>
                        <li className="list-group-item"> Added last year <span id="admin_dashboard_panels_customers_forYear"
                          className="list-group-item-value">{count(data?.last_year_customers)}</span></li>
                      </ul>
                    </div>
                  </Collapse>
                </Card>
              }
            </Col>
            <Col sm="6">
              {(all_roles.includes("super-administrator") || all_roles.includes("administrator")) &&
                <Card className="dashboard-status spl-collapsed-panel">
                  <div className="card-header dropup" onClick={toggleCust}>
                    <span className="icon-wrap color-purple">
                      <Icon name="users" />
                    </span>
                    <strong>Customers</strong>
                    <div className="pull-right">
                      <span className="close-card-btn icon-wrap">
                        {isCustOpen ? <Icon name="downward-ios" /> : <Icon name="upword-ios" />}
                      </span>
                    </div>
                  </div>
                  <Collapse isOpen={isCustOpen}>
                    <div className="card-body">
                      <ul className="list-group list-group-striped">
                        <li className="list-group-item"> Total <span id="admin_dashboard_panels_customers_total"
                          className="list-group-item-value">{count(data?.all_customers)}</span></li>
                        <li className="list-group-item"> New <span id="admin_dashboard_panels_customers_new"
                          className="list-group-item-value">{count(data?.new_customers)}</span></li>
                        <li className="list-group-item"> Active <span id="admin_dashboard_panels_customers_active"
                          className="list-group-item-value">{count(data?.active_customers)}</span></li>
                        <li className="list-group-item"> Online <span id="admin_dashboard_panels_customers_online"
                          className="list-group-item-value">{count(data?.online_customers)}</span></li>
                        <li className="list-group-item"> Online today <span id="admin_dashboard_panels_customers_onlineToday"
                          className="list-group-item-value">{count(data?.online_today_customers)}</span></li>
                        <li className="list-group-item"> Blocked <span id="admin_dashboard_panels_customers_blocked"
                          className="list-group-item-value">{count(data?.blocked_customers)}</span></li>
                        <li className="list-group-item"> Inactive <span id="admin_dashboard_panels_customers_disabled"
                          className="list-group-item-value">{count(data?.inactive_customers)}</span></li>
                        <li className="list-group-item"> Added last month <span id="admin_dashboard_panels_customers_forMonth"
                          className="list-group-item-value">{count(data?.last_month_customers)}</span></li>
                        <li className="list-group-item"> Added last year <span id="admin_dashboard_panels_customers_forYear"
                          className="list-group-item-value">{count(data?.last_year_customers)}</span></li>
                      </ul>
                    </div>
                  </Collapse>
                </Card>
              }
              {(all_roles.includes("super-administrator") || all_roles.includes("administrator") || all_roles.includes("financial-manager") || all_roles.includes("ict")) &&
                <Card className="dashboard-status spl-collapsed-panel">
                  <div className="card-header dropup" onClick={toggleFin}>
                    <span className="icon-wrap color-purple">
                      <Icon name="wallet" />
                    </span>
                    <strong>Finance</strong>
                    <div className="pull-right">
                      <span className="close-card-btn icon-wrap">
                        {isFinOpen ? <Icon name="downward-ios" /> : <Icon name="upword-ios" />}
                      </span>
                    </div>
                  </div>
                  <Collapse isOpen={isFinOpen}>
                    <div className="card-body">
                      <ul className="list-group list-group-striped">
                        <li className="list-group-item list-group-item-heading color-success"> Current month </li>
                        <li className="list-group-item"> Payments <span id="admin_dashboard_panels_finance_current_payments"
                          className="list-group-item-value">{count(data?.this_month_payments)} ({money(data?.sum_this_month_payments)}&nbsp;Sh)</span></li>
                        <li className="list-group-item"> Paid invoices <span id="admin_dashboard_panels_finance_current_paid_invoices"
                          className="list-group-item-value">{count(data?.this_month_paid_invoices)} ({money(data?.this_month_paid_invoices_sum)}&nbsp;Sh)</span></li>
                        <li className="list-group-item"> Unpaid invoices <span
                          id="admin_dashboard_panels_finance_current_unpaid_invoices" className="list-group-item-value">{count(data?.this_month_unpaid_invoices)} ({money(data?.this_month_unpaid_invoices_sum)}&nbsp;Sh)</span></li>
                        {/*<li className="list-group-item"> Credit notes <span id="admin_dashboard_panels_finance_current_credit_notes"
                        className="list-group-item-value">0 (0.00&nbsp;Sh)</span></li>*/}
                      </ul>
                      <ul className="list-group list-group-striped">
                        <li className="list-group-item list-group-item-heading color-warning"> Last month </li>
                        <li className="list-group-item"> Payments <span id="admin_dashboard_panels_finance_last_payments"
                          className="list-group-item-value">{count(data?.last_month_payments)} ({money(data?.sum_last_month_payments)}&nbsp;Sh)</span></li>
                        <li className="list-group-item"> Paid invoices <span id="admin_dashboard_panels_finance_last_paid_invoices"
                          className="list-group-item-value">{count(data?.last_month_paid_invoices)} ({money(data?.last_month_paid_invoices_sum)}&nbsp;Sh)</span></li>
                        <li className="list-group-item"> Unpaid invoices <span id="admin_dashboard_panels_finance_last_unpaid_invoices"
                          className="list-group-item-value">{count(data?.last_month_unpaid_invoices)} ({money(data?.last_month_unpaid_invoices_sum)}&nbsp;Sh)</span></li>
                        {/*<li className="list-group-item"> Credit notes <span id="admin_dashboard_panels_finance_last_credit_notes"
                        className="list-group-item-value">0 (0.00&nbsp;Sh)</span></li>*/}
                      </ul>
                    </div>
                  </Collapse>
                </Card>
              }
              {showTicketStats &&
                <Card className="dashboard-status spl-collapsed-panel">
                  <div className="card-header dropup" onClick={toggleTick}>
                    <span className="icon-wrap color-purple">
                      <Icon name="ticket" />
                    </span>
                    <strong>Tickets</strong>
                    <div className="pull-right">
                      <span className="close-card-btn icon-wrap">
                        {isTickOpen ? <Icon name="downward-ios" /> : <Icon name="upword-ios" />}
                      </span>
                    </div>
                  </div>
                  <Collapse isOpen={isTickOpen}>
                    <div className="card-body">
                      <ul className="list-group list-group-striped">
                        <li className="list-group-item">
                          New
                          <span className="list-group-item-value">{ticketStats.newTickets}</span>
                        </li>
                        <li className="list-group-item">
                          Work in progress
                          <span className="list-group-item-value">{ticketStats.workInProgress}</span>
                        </li>
                        <li className="list-group-item">
                          Resolved
                          <span className="list-group-item-value">{ticketStats.resolved}</span>
                        </li>
                        {isTicketAdmin && (
                          <li className="list-group-item">
                            Installation
                            <span className="list-group-item-value">{ticketStats.installations}</span>
                          </li>
                        )}
                        <li className="list-group-item">
                          Waiting on agent
                          <span className="list-group-item-value">{ticketStats.waitingOnAgent}</span>
                        </li>
                        <li className="list-group-item">
                          <Link to={`${process.env.PUBLIC_URL}/admin/tickets/dashboard`}>
                            Open tickets dashboard
                          </Link>
                        </li>
                      </ul>
                    </div>
                  </Collapse>
                </Card>
              }
            </Col>
          </Row>
        </Block>
      </Content>
    </React.Fragment >
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser
});

export default connect(mapStateToProps)(Homepage);
