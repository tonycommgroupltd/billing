import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Card, CardBody, Col, Input, Row, Spinner, Table } from "reactstrap";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";
import HotspotNav from "./HotspotNav";
import "./hotspot.css";

const bytes = (value) => {
  const amount = Number(value || 0);
  if (amount >= 1073741824) return `${(amount / 1073741824).toFixed(2)} GB`;
  if (amount >= 1048576) return `${(amount / 1048576).toFixed(2)} MB`;
  if (amount >= 1024) return `${(amount / 1024).toFixed(2)} KB`;
  return `${amount} B`;
};

const HotspotSessions = () => {
  const [routers, setRouters] = useState([]);
  const [routerId, setRouterId] = useState("all");
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [partialErrors, setPartialErrors] = useState([]);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    HotspotAPI.getRouters()
      .then((response) => {
        if (!mounted.current) return;
        const list = Array.isArray(response.data) ? response.data : [];
        setRouters(list);
      })
      .catch((requestError) => {
        if (mounted.current) setError(requestError.response?.data?.error || "Could not load routers.");
      });
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await HotspotAPI.getSessions(routerId || "all");
      if (mounted.current) {
        setSessionData(response.data || null);
        setPartialErrors(Array.isArray(response.data?.errors) ? response.data.errors : []);
      }
    } catch (requestError) {
      if (mounted.current) {
        setSessionData(null);
        setPartialErrors([]);
        setError(requestError.response?.data?.error || "Could not load active sessions.");
      }
    } finally {
      if (mounted.current && !quiet) setLoading(false);
    }
  }, [routerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const disconnect = async (session) => {
    const targetRouterId = session.router_id || routerId;
    if (!targetRouterId || targetRouterId === "all") {
      setError("Missing router for this session.");
      return;
    }
    if (!window.confirm(`Disconnect ${session.user || "this user"} from the hotspot?`)) return;
    setDisconnecting(`${targetRouterId}:${session.id}`);
    setError("");
    try {
      await HotspotAPI.disconnectSession({
        router_id: targetRouterId,
        session_id: session.id,
      });
      await load(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not disconnect this session.");
    } finally {
      setDisconnecting("");
    }
  };

  const sessions = sessionData?.sessions || [];
  const router = sessionData?.router || {};
  const showRouterCol = routerId === "all" || sessions.some((s) => s.router_name || s.router_id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((session) => {
      const hay = [
        session.user,
        session.address,
        session.mac,
        session.server,
        session.router_name,
        session.platform_label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, search]);

  return (
    <>
      <Head title="Hotspot sessions" />
      <Content>
        <BlockHead size="sm">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 w-100">
            <BlockHeadContent>
              <BlockTitle page>Active sessions</BlockTitle>
            </BlockHeadContent>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <Input
                type="select"
                value={routerId}
                onChange={(event) => setRouterId(event.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="all">All routers</option>
                {routers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name || item.name}
                  </option>
                ))}
              </Input>
              <Input
                type="search"
                placeholder="Search user, IP, MAC…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ minWidth: 180 }}
              />
              <Button color="primary" onClick={() => load()} disabled={loading}>
                <Icon name="reload" className={loading ? "spinning" : ""} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
        </BlockHead>
        <HotspotNav />
        {error && <Alert color="danger">{error}</Alert>}
        {partialErrors.length > 0 && (
          <Alert color="warning">
            Some routers did not respond:{" "}
            {partialErrors.map((item) => item.router_name || item.router_id).join(", ")}
          </Alert>
        )}

        <Row className="g-3 mb-4">
          <Col sm="6" lg="3">
            <Card className="hotspot-stat-card">
              <CardBody>
                <small className="text-soft">Active sessions</small>
                <div className="fs-4 fw-bold">{filtered.length}{search ? ` / ${sessions.length}` : ""}</div>
              </CardBody>
            </Card>
          </Col>
          <Col sm="6" lg="3">
            <Card className="hotspot-stat-card">
              <CardBody>
                <small className="text-soft">{routerId === "all" ? "Routers checked" : "Router"}</small>
                <div className="fs-5 fw-bold">
                  {routerId === "all"
                    ? (sessionData?.routers?.length ?? routers.length)
                    : (router.identity || router.name || "-")}
                </div>
              </CardBody>
            </Card>
          </Col>
          <Col sm="6" lg="3">
            <Card className="hotspot-stat-card">
              <CardBody>
                <small className="text-soft">Uptime</small>
                <div className="fs-5 fw-bold">{routerId === "all" ? "—" : (router.uptime || "-")}</div>
              </CardBody>
            </Card>
          </Col>
          <Col sm="6" lg="3">
            <Card className="hotspot-stat-card">
              <CardBody>
                <small className="text-soft">CPU load</small>
                <div className="fs-5 fw-bold">
                  {routerId === "all"
                    ? "—"
                    : (router.cpu_load != null ? `${router.cpu_load}%` : "-")}
                </div>
              </CardBody>
            </Card>
          </Col>
        </Row>

        <Card className="hotspot-stat-card">
          <CardBody>
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h6 className="title mb-0">Connected users</h6>
              <label className="d-flex align-items-center gap-2 small text-soft mb-0">
                <Input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
                Auto-refresh every 30 seconds
              </label>
            </div>
            {loading && !sessionData ? (
              <div className="text-center py-5"><Spinner color="primary" /></div>
            ) : (
              <div className="table-responsive">
                <Table hover className="hotspot-table align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      {showRouterCol && <th>Router</th>}
                      <th>User</th>
                      <th>IP</th>
                      <th>MAC</th>
                      <th>Uptime</th>
                      <th>Download</th>
                      <th>Upload</th>
                      <th>Server</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={showRouterCol ? 9 : 8} className="text-center text-soft py-5">
                          No active sessions.
                        </td>
                      </tr>
                    ) : filtered.map((session) => {
                      const key = `${session.router_id || routerId}:${session.id}`;
                      return (
                        <tr key={key}>
                          {showRouterCol && (
                            <td>
                              <div className="fw-semibold">{session.router_name || "-"}</div>
                              {session.platform_label && (
                                <small className="text-soft">{session.platform_label}</small>
                              )}
                            </td>
                          )}
                          <td className="fw-semibold">{session.user || "-"}</td>
                          <td><code>{session.address || "-"}</code></td>
                          <td><code>{session.mac || "-"}</code></td>
                          <td>{session.uptime || "-"}</td>
                          <td className="text-success">{bytes(session.bytes_out)}</td>
                          <td className="text-info">{bytes(session.bytes_in)}</td>
                          <td><Badge color="light">{session.server || "-"}</Badge></td>
                          <td className="text-end">
                            <Button
                              size="sm"
                              color="danger"
                              outline
                              disabled={disconnecting === key}
                              onClick={() => disconnect(session)}
                            >
                              {disconnecting === key ? <Spinner size="sm" /> : "Disconnect"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </Content>
    </>
  );
};

export default HotspotSessions;
