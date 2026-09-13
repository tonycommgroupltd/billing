import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "react-data-table-component";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Alert, Badge, Col, Progress, Row, Spinner } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  BackTo,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";
import {
  PRIMARY,
  FALLBACK,
  MODES,
  getApiMode,
  setApiMode,
  getApiBase,
  clearAutoFallback,
  probeApi,
} from "../../helpers/apiBase";
import {
  fetchEmergencyBypassStatus,
  fetchEmergencyBypassSyncProgress,
  setEmergencyBypassMode,
  syncEmergencyBypassSecrets,
} from "../../helpers/emergencyBypassApi";
import { http } from "../../helpers";
import { triggerStaffNotificationRefresh } from "../../utils/staffNotifications";

const modeLabel = {
  [MODES.AUTO]: "Auto",
  [MODES.PRODUCTION]: "Production",
  [MODES.STANDBY]: "Standby",
};

const modeDescription = {
  [MODES.AUTO]: "Use Contabo first; fall back to the local hub if unreachable.",
  [MODES.PRODUCTION]: "Contabo VPS only — normal day-to-day operation.",
  [MODES.STANDBY]: "Local hub only — use when Contabo is down.",
};

const syncStatusLabel = {
  pending: "Waiting",
  running: "Syncing",
  done: "Done",
  done_with_errors: "Done (errors)",
};

function apiErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.includes("not logged in")) {
    return "Session expired or API auth failed — log in again, then retry.";
  }
  if (data?.message) return data.message;
  if (data?.error && typeof data.error === "string") return data.error;
  return err?.message || fallback;
}

function displayEndpoint(url) {
  if (!url) return "—";
  if (url.includes("isp.tonycommgroupltd.com")) return "isp.tonycommgroupltd.com";
  if (url.includes("acs.tcom.co.ke")) return "acs.tcom.co.ke";
  if (url.includes("102.0.15.254")) return "102.0.15.254";
  if (url.startsWith("/production-api")) return "Contabo (dev proxy)";
  if (url.startsWith("/standby-api")) return "Standby hub (dev proxy)";
  return url.replace(/^https?:\/\//, "").replace(/\/api\/v1\/?$/, "");
}

const SyncGauge = ({ row }) => {
  if (!row) {
    return <span className="text-soft">—</span>;
  }

  const percent = Math.max(0, Math.min(100, Number(row.percent) || 0));
  const total = Number(row.total) || 0;
  const processed = Number(row.processed) || 0;
  const status = row.status || "pending";
  const isActive = status === "running" || status === "pending";
  const barColor =
    status === "done_with_errors"
      ? "warning"
      : status === "done"
        ? "success"
        : isActive
          ? "info"
          : "secondary";

  return (
    <div style={{ minWidth: 150 }}>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="text-soft" style={{ fontSize: "11px" }}>
          {syncStatusLabel[status] || status}
        </span>
        <strong style={{ fontSize: "11px" }}>{percent}%</strong>
      </div>
      <Progress value={percent} color={barColor} style={{ height: 7 }} />
      <div className="text-soft mt-1" style={{ fontSize: "10px" }}>
        {processed.toLocaleString()}
        {total > 0 ? ` / ${total.toLocaleString()}` : ""} secrets
        {(row.failed || 0) > 0 ? ` · ${row.failed} failed` : ""}
      </div>
    </div>
  );
};

const HaAvailability = () => {
  const mountedRef = useRef(true);
  const [mode, setMode] = useState(getApiMode());
  const [prodHealth, setProdHealth] = useState(null);
  const [standbyHealth, setStandbyHealth] = useState(null);
  const [checking, setChecking] = useState(false);

  const [pppAuth, setPppAuth] = useState(null);
  const [pppSyncProgress, setPppSyncProgress] = useState(null);
  const [pppLoading, setPppLoading] = useState(false);
  const [pppBusy, setPppBusy] = useState(false);
  const [pppError, setPppError] = useState("");
  const [replStatus, setReplStatus] = useState(null);

  const loadSyncProgress = useCallback(async () => {
    try {
      const data = await fetchEmergencyBypassSyncProgress();
      if (!mountedRef.current) return data;
      setPppSyncProgress(data?.routers ? data : null);
      return data;
    } catch {
      return null;
    }
  }, []);

  const runChecks = useCallback(async () => {
    if (mountedRef.current) setChecking(true);
    const mode = getApiMode();
    if (mode === MODES.PRODUCTION) {
      const p = await probeApi(PRIMARY);
      if (!mountedRef.current) return;
      setProdHealth(p);
      setStandbyHealth(null);
    } else if (mode === MODES.STANDBY) {
      const s = await probeApi(FALLBACK);
      if (!mountedRef.current) return;
      setProdHealth(null);
      setStandbyHealth(s);
    } else {
      const p = await probeApi(PRIMARY);
      if (!mountedRef.current) return;
      setProdHealth(p);
      const s = await probeApi(FALLBACK);
      if (!mountedRef.current) return;
      setStandbyHealth(s);
    }
    if (mountedRef.current) setChecking(false);
  }, []);

  const loadPppStatus = useCallback(async () => {
    if (mountedRef.current) {
      setPppLoading(true);
      setPppError("");
    }
    try {
      const data = await fetchEmergencyBypassStatus();
      if (!mountedRef.current) return;
      setPppAuth(data);
      setPppSyncProgress(data?.sync_progress?.routers ? data.sync_progress : null);
    } catch (err) {
      if (mountedRef.current) {
        setPppError(apiErrorMessage(err, "Failed to load PPP auth status"));
      }
    } finally {
      if (mountedRef.current) setPppLoading(false);
    }
  }, []);

  const loadReplStatus = useCallback(async () => {
    try {
      const { data } = await http.get("/dashboard-stats");
      if (!mountedRef.current) return;
      const server = data?.server || {};
      setReplStatus({
        ok: server.standby_replication_ok,
        lag: server.standby_replication_lag,
        label: server.standby_replication_label,
        alert: server.standby_replication_alert,
      });
    } catch {
      /* keep previous repl status */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([runChecks(), loadPppStatus(), loadReplStatus()]);
  }, [runChecks, loadPppStatus, loadReplStatus]);

  useEffect(() => {
    mountedRef.current = true;
    refreshAll();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshAll]);

  useEffect(() => {
    if (!pppBusy && !pppSyncProgress?.active) return undefined;

    loadSyncProgress();
    const timer = setInterval(() => {
      if (mountedRef.current) loadSyncProgress();
    }, 1500);
    return () => clearInterval(timer);
  }, [pppBusy, pppSyncProgress?.active, loadSyncProgress]);

  const progressByRouterId = pppSyncProgress?.routers || {};
  const showSyncProgress = Boolean(
    pppSyncProgress?.routers && (pppBusy || pppSyncProgress.active || pppSyncProgress.finished_at)
  );

  const selectMode = (next) => {
    setApiMode(next);
    clearAutoFallback();
    setMode(next);
    // Re-probe only the selected hub so Production does not hit standby.
    setTimeout(() => {
      runChecks();
    }, 0);
  };

  const togglePppAuth = async () => {
    const nextMode = pppAuth?.ppp_auth_mode === "api" ? "radius" : "api";
    const label = nextMode === "api" ? "Mikrotik API (local PPP secrets)" : "RADIUS";
    if (!window.confirm(`Switch PPP authentication to ${label}?`)) return;

    setPppBusy(true);
    setPppError("");
    setPppSyncProgress(null);
    try {
      const result = await setEmergencyBypassMode(nextMode);
      if (mountedRef.current) setPppAuth(result.data);
      triggerStaffNotificationRefresh();
    } catch (err) {
      if (mountedRef.current) setPppError(apiErrorMessage(err, "Mode switch failed"));
    } finally {
      if (mountedRef.current) setPppBusy(false);
      loadSyncProgress();
    }
  };

  const runPppSync = async () => {
    setPppBusy(true);
    setPppError("");
    setPppSyncProgress(null);
    try {
      const result = await syncEmergencyBypassSecrets();
      if (mountedRef.current) setPppAuth(result.data?.status || result.data);
    } catch (err) {
      if (mountedRef.current) setPppError(apiErrorMessage(err, "Sync failed"));
    } finally {
      if (mountedRef.current) setPppBusy(false);
      loadSyncProgress();
    }
  };

  const activeBase = getApiBase();
  const isApiMode = pppAuth?.ppp_auth_mode === "api";
  const allHealthy = pppAuth?.ready && (isApiMode ? pppAuth?.all_local_auth : true);

  const routerRows = useMemo(
    () =>
      (pppAuth?.routers || []).map((r) => ({
        ...r,
        syncRow: progressByRouterId[String(r.id)],
      })),
    [pppAuth?.routers, progressByRouterId]
  );

  const routerColumns = useMemo(
    () => [
      {
        name: "Router",
        minWidth: "180px",
        wrap: true,
        cell: (row) => (
          <div>
            <div className="fw-medium">{row.title}</div>
            <code style={{ fontSize: "10px" }}>{row.host}</code>
          </div>
        ),
      },
      {
        name: "API",
        width: "110px",
        cell: (row) => (
          <Badge color={row.api_ok ? "success" : "danger"} pill>
            {row.api_ok ? row.identity || "OK" : "Fail"}
          </Badge>
        ),
      },
      {
        name: "use-radius",
        width: "100px",
        selector: (row) => (row.use_radius === null ? "—" : row.use_radius ? "yes" : "no"),
      },
      {
        name: "Sync progress",
        minWidth: "180px",
        cell: (row) => <SyncGauge row={row.syncRow} />,
      },
      {
        name: "Last sync",
        minWidth: "120px",
        wrap: true,
        selector: (row) =>
          row.last_sync
            ? `+${row.last_sync.added || 0} / ~${row.last_sync.updated || 0}`
            : "—",
      },
    ],
    []
  );

  return (
    <React.Fragment>
      <Head title="High availability" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BackTo link="/admin/administration" icon="arrow-left">
                Administration
              </BackTo>
              <BlockTitle page tag="h3" className="mt-2">
                High availability
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="toggle-wrap nk-block-tools-toggle">
                <Button
                  color="primary"
                  outline
                  disabled={checking || pppLoading || pppBusy}
                  onClick={refreshAll}
                >
                  <Icon name="reload" className={checking || pppLoading ? "spinning" : ""} />
                  <span className="d-none d-sm-inline ms-1">Refresh all</span>
                </Button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          {replStatus?.alert || replStatus?.ok === false ? (
            <Alert color="danger" className="mb-4">
              <strong>Standby replication alert:</strong>{" "}
              {replStatus.alert || replStatus.label || "Replication is not healthy"}
              {replStatus.lag != null ? ` · lag ${replStatus.lag}s` : ""}
            </Alert>
          ) : replStatus?.ok ? (
            <Alert color="success" className="mb-4">
              Standby replication OK{replStatus.label ? ` — ${replStatus.label}` : ""}.
            </Alert>
          ) : null}

          <Row className="g-gs mb-4">
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">API routing</span>
                <h4 className="title">{modeLabel[mode] || mode}</h4>
                <span className="text-soft" style={{ fontSize: "12px" }}>
                  Active: {displayEndpoint(activeBase)}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Production (Contabo)</span>
                <h4 className={`title ${prodHealth?.ok ? "text-success" : prodHealth ? "text-danger" : ""}`}>
                  {checking && !prodHealth ? (
                    <Spinner size="sm" />
                  ) : prodHealth ? (
                    prodHealth.ok ? "Reachable" : "Down"
                  ) : (
                    "—"
                  )}
                </h4>
                <span className="text-soft" style={{ fontSize: "12px" }}>
                  {displayEndpoint(PRIMARY)}
                  {prodHealth?.status ? ` · HTTP ${prodHealth.status}` : ""}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Standby (local hub)</span>
                <h4 className={`title ${standbyHealth?.ok ? "text-success" : standbyHealth ? "text-danger" : ""}`}>
                  {checking && !standbyHealth ? (
                    <Spinner size="sm" />
                  ) : standbyHealth ? (
                    standbyHealth.ok ? "Reachable" : "Down"
                  ) : (
                    "—"
                  )}
                </h4>
                <span className="text-soft" style={{ fontSize: "12px" }}>
                  {displayEndpoint(FALLBACK)}
                  {standbyHealth?.status ? ` · HTTP ${standbyHealth.status}` : ""}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">DB replication</span>
                <h4
                  className={`title ${
                    replStatus?.ok ? "text-success" : replStatus?.ok === false ? "text-danger" : ""
                  }`}
                >
                  {replStatus == null ? (
                    <Spinner size="sm" />
                  ) : replStatus.ok ? (
                    "In sync"
                  ) : (
                    "Alert"
                  )}
                </h4>
                <span className="text-soft" style={{ fontSize: "12px" }}>
                  {replStatus?.label || "Loading…"}
                </span>
              </PreviewCard>
            </Col>
          </Row>

          <Row className="g-gs mb-4">
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">PPP authentication</span>
                <h4 className={`title ${isApiMode ? "text-warning" : "text-success"}`}>
                  {pppLoading && !pppAuth ? (
                    <Spinner size="sm" />
                  ) : pppAuth ? (
                    isApiMode ? "Mikrotik API" : "RADIUS"
                  ) : (
                    "—"
                  )}
                </h4>
                <span className="text-soft" style={{ fontSize: "12px" }}>
                  {pppAuth
                    ? allHealthy
                      ? "All routers ready"
                      : "Check router table below"
                    : "Loading status…"}
                </span>
              </PreviewCard>
            </Col>
          </Row>

          <Row className="g-gs mb-4">
            <Col lg="7">
              <PreviewCard className="h-100">
                <BlockHeadContent className="mb-3">
                  <BlockTitle tag="h6">API routing mode</BlockTitle>
                </BlockHeadContent>

                <Row className="g-3">
                  {Object.values(MODES).map((m) => {
                    const selected = mode === m;
                    return (
                      <Col md="4" key={m}>
                        <button
                          type="button"
                          className={`btn w-100 text-start p-3 ${
                            selected ? "btn-primary" : "btn-outline-light border"
                          }`}
                          onClick={() => selectMode(m)}
                        >
                          <div className="fw-bold mb-1">{modeLabel[m]}</div>
                          <div
                            className={selected ? "text-white-50" : "text-soft"}
                            style={{ fontSize: "12px", lineHeight: 1.4 }}
                          >
                            {modeDescription[m]}
                          </div>
                        </button>
                      </Col>
                    );
                  })}
                </Row>

                <Alert color="light" className="mt-3 mb-0 py-2" style={{ fontSize: "12px" }}>
                  Active endpoint: <code>{activeBase}</code>
                  <br />
                  <span className="text-soft">
                    Health probe: HTTP 401/422 = alive · timeout or 5xx = unreachable
                  </span>
                </Alert>
              </PreviewCard>
            </Col>

            <Col lg="5">
              <PreviewCard className="h-100">
                <BlockHeadContent className="mb-3">
                  <BlockTitle tag="h6">Failover runbook</BlockTitle>
                </BlockHeadContent>
                <ol className="mb-3 ps-3" style={{ fontSize: "13px", lineHeight: 1.7 }}>
                  <li>
                    <strong>Contabo down</strong> → set mode to <strong>Standby</strong> (or leave on Auto).
                  </li>
                  <li>
                    <strong>RADIUS down</strong> → switch PPP auth to <strong>API mode</strong> below (secrets sync automatically).
                  </li>
                  <li>
                    <strong>Contabo restored</strong> → switch PPP back to RADIUS, run{" "}
                    <code>resync-contabo-from-standby.sh</code>, then set API mode to Production.
                  </li>
                </ol>
                <div className="border-top pt-3">
                  <div className="text-soft mb-2" style={{ fontSize: "12px" }}>
                    Production-only on Contabo:
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <Badge color="light" className="text-dark">
                      OLT monitoring
                    </Badge>
                    <Badge color="light" className="text-dark">
                      TR-069
                    </Badge>
                    <Badge color="light" className="text-dark">
                      Tickets (cPanel)
                    </Badge>
                    <Link
                      to={`${process.env.PUBLIC_URL}/admin/networking/vpn/dashboard`}
                      className="badge bg-primary-dim text-primary"
                    >
                      VPN dashboard →
                    </Link>
                  </div>
                </div>
              </PreviewCard>
            </Col>
          </Row>

          <PreviewCard>
            <BlockBetween className="mb-3">
              <BlockHeadContent>
                <BlockTitle tag="h6">PPP authentication (RADIUS ↔ API)</BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent>
                <div className="d-flex align-items-center gap-3">
                  {pppLoading ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <Badge color={isApiMode ? "warning" : "success"} pill>
                        {isApiMode ? "Mikrotik API" : "RADIUS"}
                      </Badge>
                      <div className="form-check form-switch mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="ppp-auth-switch"
                          checked={isApiMode}
                          disabled={pppBusy || pppLoading}
                          onChange={togglePppAuth}
                        />
                        <label className="form-check-label" htmlFor="ppp-auth-switch">
                          {isApiMode ? "API mode" : "RADIUS mode"}
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </BlockHeadContent>
            </BlockBetween>

            {pppError && (
              <Alert color="danger" className="py-2 mb-3" style={{ fontSize: "13px" }}>
                {pppError}
              </Alert>
            )}

            {pppBusy && (
              <Alert color="info" className="py-2 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
                <Spinner size="sm" />
                {showSyncProgress && pppSyncProgress
                  ? `Syncing PPP secrets… ${pppSyncProgress.percent ?? 0}% overall`
                  : "Working… this can take a few minutes for large syncs."}
              </Alert>
            )}

            {showSyncProgress && pppSyncProgress && (
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-soft" style={{ fontSize: "12px" }}>
                    Overall sync
                    {pppSyncProgress.operation === "switch_api" ? " (API mode switch)" : ""}
                  </span>
                  <strong style={{ fontSize: "12px" }}>{pppSyncProgress.percent ?? 0}%</strong>
                </div>
                <Progress
                  value={pppSyncProgress.percent ?? 0}
                  color={pppSyncProgress.active ? "info" : "success"}
                  style={{ height: 10 }}
                />
                <div className="text-soft mt-1" style={{ fontSize: "11px" }}>
                  {(pppSyncProgress.processed ?? 0).toLocaleString()}
                  {(pppSyncProgress.total ?? 0) > 0
                    ? ` / ${(pppSyncProgress.total ?? 0).toLocaleString()} secrets`
                    : ""}
                </div>
              </div>
            )}

            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button size="sm" outline disabled={pppBusy || pppLoading} onClick={loadPppStatus}>
                Refresh status
              </Button>
              <Button size="sm" color="primary" disabled={pppBusy || pppLoading} onClick={runPppSync}>
                Sync secrets now
              </Button>
            </div>

            {pppAuth && (
              <>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <Badge color={pppAuth.ready ? "success" : "danger"} pill>
                    Router API: {pppAuth.ready ? "All reachable" : "Some unreachable"}
                  </Badge>
                  {isApiMode && (
                    <Badge color={pppAuth.all_local_auth ? "success" : "warning"} pill>
                      use-radius: {pppAuth.all_local_auth ? "off on all routers" : "check routers below"}
                    </Badge>
                  )}
                  {allHealthy && <Badge color="success" pill>Ready</Badge>}
                </div>

                {pppLoading ? (
                  <div className="text-center py-4">
                    <Spinner color="primary" />
                  </div>
                ) : (
                  <DataTable
                    columns={routerColumns}
                    data={routerRows}
                    highlightOnHover
                    responsive
                    dense
                    noDataComponent="No Mikrotik routers configured for emergency bypass"
                    customStyles={{
                      headCells: { style: { fontSize: "12px", fontWeight: 600 } },
                      cells: { style: { fontSize: "12px" } },
                    }}
                  />
                )}
              </>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default HaAvailability;
