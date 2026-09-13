import React, { useCallback, useEffect, useRef, useState } from "react";
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

const money = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

/**
 * Shows where a customer authenticated / paid (router_name from captive portal),
 * plus who is online on which hotspot right now.
 * Live polling is non-blocking and budget-limited so unreachable routers cannot freeze the CRM.
 */
const HotspotAuthLocations = () => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState([]);
  const [activations, setActivations] = useState([]);
  const [online, setOnline] = useState([]);
  const [routerErrors, setRouterErrors] = useState([]);
  const [liveMeta, setLiveMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const mounted = useRef(true);
  const liveInFlight = useRef(false);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await HotspotAPI.getAuthLocations({
        search: query || undefined,
        limit: 80,
      });
      if (!mounted.current) return;
      const data = response.data || {};
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      setActivations(Array.isArray(data.activations) ? data.activations : []);
    } catch (requestError) {
      if (mounted.current) {
        setError(requestError.response?.data?.error || "Could not load auth locations.");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [query]);

  const loadLive = useCallback(async (quiet = false) => {
    if (liveInFlight.current) return;
    liveInFlight.current = true;
    if (!quiet) setLiveLoading(true);
    try {
      const response = await HotspotAPI.getLiveAuth({
        search: query || undefined,
        budget: 10,
      });
      if (!mounted.current) return;
      const data = response.data || {};
      setOnline(Array.isArray(data.online) ? data.online : []);
      setRouterErrors(Array.isArray(data.router_errors) ? data.router_errors : []);
      setLiveMeta({
        polled: data.polled,
        skipped: data.skipped,
        elapsed_ms: data.elapsed_ms,
      });
    } catch (requestError) {
      if (mounted.current && !quiet) {
        // Keep payment history usable even if live poll times out.
        setRouterErrors([{ router: "live poll", error: requestError.response?.data?.error || "timeout" }]);
      }
    } finally {
      liveInFlight.current = false;
      if (mounted.current && !quiet) setLiveLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Live poll after history paints — never block the page on router reachability.
  useEffect(() => {
    const timer = setTimeout(() => loadLive(false), 100);
    return () => clearTimeout(timer);
  }, [loadLive]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => loadLive(true), 90000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadLive]);

  const onSearch = (event) => {
    event.preventDefault();
    setQuery(search.trim());
  };

  return (
    <>
      <Head title="Hotspot auth locations" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>Authenticated where</BlockTitle>
          </BlockHeadContent>
        </BlockHead>
        <HotspotNav />
        {error && <Alert color="danger">{error}</Alert>}

        <Card className="hotspot-panel-card mb-4">
          <CardBody>
            <form className="d-flex flex-wrap gap-2 align-items-center" onSubmit={onSearch}>
              <Input
                className="flex-grow-1"
                style={{ minWidth: 220, maxWidth: 420 }}
                placeholder="Search phone, username, receipt, site…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button color="primary" type="submit">
                <Icon name="search" />
                <span>Search</span>
              </Button>
              <Button
                color="light"
                type="button"
                onClick={() => {
                  loadHistory();
                  loadLive(false);
                }}
              >
                <Icon name="reload" />
                <span>Refresh</span>
              </Button>
              <label className="d-flex align-items-center gap-2 mb-0 text-soft small ms-md-2">
                <Input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh live (90s)
              </label>
            </form>
          </CardBody>
        </Card>

        <div className="hotspot-section-head">
          <div>
            <h6 className="hotspot-section-title">Online now</h6>
            <span className="text-soft small">
              Live MikroTik sessions
              {liveMeta?.polled != null
                ? ` · polled ${liveMeta.polled} router(s)${liveMeta.skipped ? `, skipped ${liveMeta.skipped}` : ""}`
                : ""}
            </span>
          </div>
          <Badge color="primary" pill>
            {liveLoading ? "…" : `${online.length} online`}
          </Badge>
        </div>
        {routerErrors.length > 0 && (
          <Alert color="warning" className="mb-3">
            {routerErrors[0]?.router === "live poll"
              ? `Live poll issue: ${routerErrors[0].error}`
              : `Could not reach ${routerErrors.length} router(s): ${routerErrors
                  .map((r) => r.router)
                  .filter((name) => name !== "live poll")
                  .join(", ")}`}
          </Alert>
        )}
        <Card className="hotspot-panel-card mb-4">
          <CardBody className="p-0">
            <div className="table-responsive">
              <Table hover className="hotspot-table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Hotspot site</th>
                    <th>User</th>
                    <th>MAC</th>
                    <th>IP</th>
                    <th>Server</th>
                    <th>Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {liveLoading && online.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-5">
                        <Spinner color="primary" size="sm" /> Polling routers…
                      </td>
                    </tr>
                  ) : online.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center text-soft py-5">
                        No active sessions{query ? " matching search" : ""}.
                      </td>
                    </tr>
                  ) : (
                    online.map((row) => (
                      <tr key={`${row.router_id}-${row.session_id}-${row.mac}`}>
                        <td>
                          <div className="fw-semibold">{row.router}</div>
                          <small className="text-soft">{row.identity}</small>
                        </td>
                        <td>
                          <code>{row.user || "-"}</code>
                        </td>
                        <td>{row.mac || "-"}</td>
                        <td>{row.address || "-"}</td>
                        <td>{row.hotspot_server || "-"}</td>
                        <td>{row.uptime || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </CardBody>
        </Card>

        <Row className="g-4">
          <Col xl="7">
            <div className="hotspot-section-head">
              <div>
                <h6 className="hotspot-section-title">Paid / authenticated at</h6>
                <span className="text-soft small">M-Pesa payments tagged with captive-portal site</span>
              </div>
            </div>
            <Card className="hotspot-panel-card">
              <CardBody className="p-0">
                <div className="table-responsive">
                  <Table hover className="hotspot-table mb-0">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Customer</th>
                        <th>Site</th>
                        <th>Package</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan="5" className="text-center py-4">
                            <Spinner color="primary" size="sm" />
                          </td>
                        </tr>
                      ) : payments.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center text-soft py-4">
                            No payments found.
                          </td>
                        </tr>
                      ) : (
                        payments.map((row) => (
                          <tr key={`p-${row.id}`}>
                            <td className="text-soft">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                            </td>
                            <td>
                              <div>{row.phone_number || "-"}</div>
                              {row.username && (
                                <small className="text-soft">
                                  <code>{row.username}</code>
                                </small>
                              )}
                            </td>
                            <td>
                              <Badge color={row.authenticated_at === "(not captured)" ? "secondary" : "info"} pill>
                                {row.authenticated_at}
                              </Badge>
                            </td>
                            <td>{row.package_type || "-"}</td>
                            <td className="fw-bold text-success">{money(row.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </CardBody>
            </Card>
          </Col>
          <Col xl="5">
            <div className="hotspot-section-head">
              <div>
                <h6 className="hotspot-section-title">Activations</h6>
                <span className="text-soft small">Hotspot user created / renewed with site tag</span>
              </div>
            </div>
            <Card className="hotspot-panel-card">
              <CardBody className="p-0">
                <div className="table-responsive">
                  <Table hover className="hotspot-table mb-0">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>User</th>
                        <th>Site</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan="3" className="text-center py-4">
                            <Spinner color="primary" size="sm" />
                          </td>
                        </tr>
                      ) : activations.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="text-center text-soft py-4">
                            No activations found.
                          </td>
                        </tr>
                      ) : (
                        activations.map((row) => (
                          <tr key={`a-${row.id}`}>
                            <td className="text-soft">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                            </td>
                            <td>
                              <code>{row.username || "-"}</code>
                              <div className="small text-soft">{row.phone_number || row.mac_address || ""}</div>
                            </td>
                            <td>
                              <Badge color={row.authenticated_at === "(not captured)" ? "secondary" : "info"} pill>
                                {row.authenticated_at}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Content>
    </>
  );
};

export default HotspotAuthLocations;
