import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Card, CardBody, Col, Row, Spinner, Table } from "reactstrap";
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

const StatCard = ({ label, value, icon, color = "primary", hint }) => (
  <Card className={`hotspot-stat-card hotspot-stat-card-${color}`}>
    <CardBody>
      <div className="d-flex justify-content-between align-items-start">
        <div className="hotspot-stat-copy">
          <div className="hotspot-stat-label">{label}</div>
          <div className="hotspot-stat-value">{value}</div>
          {hint && <div className="hotspot-stat-hint">{hint}</div>}
        </div>
        <span className={`hotspot-stat-icon bg-${color}-dim text-${color}`}>
          <Icon name={icon} />
        </span>
      </div>
    </CardBody>
  </Card>
);

const HotspotDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [routers, setRouters] = useState([]);
  const [siteEarnings, setSiteEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, routerResponse, earnings] = await Promise.all([
        HotspotAPI.getDashboard(),
        HotspotAPI.getRouters(),
        HotspotAPI.getSiteEarnings({ days: 7 }).catch(() => null),
      ]);
      setDashboard(summary.data || {});
      setRouters(Array.isArray(routerResponse.data) ? routerResponse.data : []);
      setSiteEarnings(earnings?.data || null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load the hotspot dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recent = dashboard?.recent_transactions || [];
  const activeRouters = routers.filter((router) =>
    ["active", "online", "connected"].includes(String(router.status || "").toLowerCase())
  ).length;
  const routerHealth = routers.length ? Math.round((activeRouters / routers.length) * 100) : 0;
  const lastUpdated = dashboard ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <>
      <Head title="Hotspot dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>Hotspot management</BlockTitle>
          </BlockHeadContent>
        </BlockHead>
        <HotspotNav />
        {error && <Alert color="danger">{error}</Alert>}

        {loading && !dashboard ? (
          <Card className="hotspot-loading-card">
            <CardBody className="text-center py-5">
              <Spinner color="primary" />
              <div className="text-soft mt-3">Loading hotspot performance...</div>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card className="hotspot-hero mb-4">
              <CardBody>
                <div className="hotspot-hero-content">
                  <div>
                    <div className="hotspot-eyebrow">Network overview</div>
                    <h3 className="hotspot-hero-title">All hotspots</h3>
                    <p className="hotspot-hero-copy">
                      Mwananchi + TPay Hotspot together · {activeRouters} of {routers.length} routers online
                      {lastUpdated && ` · Last updated ${lastUpdated}`}
                    </p>
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <Badge className="hotspot-health-badge" color={routerHealth === 100 ? "success" : "warning"}>
                        <span className="hotspot-live-dot" />
                        {routerHealth}% network availability
                      </Badge>
                      <Badge className="hotspot-health-badge" color="light">
                        {dashboard?.active_users || 0} active customers
                      </Badge>
                    </div>
                  </div>
                  <div className="hotspot-hero-actions">
                    <Button color="light" onClick={load} disabled={loading}>
                      <Icon name="reload" className={loading ? "spinning" : ""} />
                      <span>{loading ? "Refreshing" : "Refresh data"}</span>
                    </Button>
                    {dashboard?.advanced_url && (
                      <Button
                        color="primary"
                        tag="a"
                        href={dashboard.advanced_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="external" />
                        <span>Mwananchi console</span>
                      </Button>
                    )}
                    {(dashboard?.advanced_urls || []).filter((url) => url && url !== dashboard?.advanced_url).map((url) => (
                      <Button
                        key={url}
                        color="light"
                        tag="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="external" />
                        <span>TPay console</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="hotspot-section-head">
              <div>
                <h6 className="hotspot-section-title">Revenue performance</h6>
                <span className="text-soft small">Successful M-Pesa hotspot payments</span>
              </div>
            </div>
            <Row className="g-3 mb-4">
              <Col sm="6" xl="3"><StatCard label="Today" value={money(dashboard?.revenue_today)} icon="cash" color="success" hint={`${dashboard?.transactions_today || 0} transactions`} /></Col>
              <Col sm="6" xl="3"><StatCard label="This week" value={money(dashboard?.revenue_week)} icon="calendar" color="primary" hint="Current calendar week" /></Col>
              <Col sm="6" xl="3"><StatCard label="This month" value={money(dashboard?.revenue_month)} icon="growth" color="warning" hint="Current calendar month" /></Col>
              <Col sm="6" xl="3"><StatCard label="Active customers" value={dashboard?.active_users || 0} icon="user-check" color="info" hint={`${dashboard?.total_users || 0} total accounts`} /></Col>
            </Row>

            {siteEarnings && (
              <>
                <div className="hotspot-section-head">
                  <div>
                    <h6 className="hotspot-section-title">Earnings by hotspot today</h6>
                    <span className="text-soft small">
                      From payment site tag (where the customer authenticated) · today total{" "}
                      {money(siteEarnings.revenue_today_total)}
                    </span>
                  </div>
                </div>
                <Card className="hotspot-panel-card mb-4">
                  <CardBody className="p-0">
                    <div className="table-responsive">
                      <Table hover className="hotspot-table mb-0">
                        <thead>
                          <tr>
                            <th>Hotspot site</th>
                            <th>Transactions</th>
                            <th>Revenue today</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(siteEarnings.today_by_site || []).length === 0 ? (
                            <tr>
                              <td colSpan="3" className="text-center text-soft py-4">
                                No successful payments tagged today.
                              </td>
                            </tr>
                          ) : (
                            siteEarnings.today_by_site.map((row) => (
                              <tr key={row.site}>
                                <td className="fw-semibold">{row.site}</td>
                                <td>{row.transactions}</td>
                                <td className="fw-bold text-success">{money(row.revenue)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </CardBody>
                </Card>
              </>
            )}

            <Row className="g-3 mb-4">
              <Col sm="6" lg="3">
                <div className="hotspot-mini-stat"><span className="hotspot-mini-icon text-primary"><Icon name="users" /></span><div><small>Total users</small><strong>{dashboard?.total_users || 0}</strong></div></div>
              </Col>
              <Col sm="6" lg="3">
                <div className="hotspot-mini-stat"><span className="hotspot-mini-icon text-warning"><Icon name="package" /></span><div><small>Active packages</small><strong>{dashboard?.total_packages || 0}</strong></div></div>
              </Col>
              <Col sm="6" lg="3">
                <div className="hotspot-mini-stat"><span className="hotspot-mini-icon text-info"><Icon name="wifi" /></span><div><small>Configured routers</small><strong>{dashboard?.router_count || routers.length}</strong></div></div>
              </Col>
              <Col sm="6" lg="3">
                <div className="hotspot-mini-stat"><span className="hotspot-mini-icon text-success"><Icon name="check-circle" /></span><div><small>Routers online</small><strong>{activeRouters}</strong></div></div>
              </Col>
            </Row>

            <Row className="g-4">
              <Col xl="8">
                <Card className="hotspot-panel-card">
                  <CardBody>
                    <div className="hotspot-panel-head">
                      <div>
                        <h6 className="hotspot-section-title mb-1">Recent transactions</h6>
                        <span className="text-soft small">Latest successful customer payments</span>
                      </div>
                      <Badge color="primary" pill>{recent.length} payments</Badge>
                    </div>
                    <div className="table-responsive">
                      <Table hover className="hotspot-table mb-0">
                        <thead>
                          <tr><th>Customer</th><th>Package</th><th>Site</th><th>Amount</th><th>Receipt</th><th>Paid at</th></tr>
                        </thead>
                        <tbody>
                          {recent.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-5"><Icon name="receipt" className="fs-2 text-soft" /><div className="text-soft mt-2">No recent transactions found.</div></td></tr>
                          ) : recent.map((transaction) => (
                            <tr key={`${transaction.platform || 'x'}-${transaction.id}`}>
                              <td><div className="hotspot-customer-cell"><span className="hotspot-customer-avatar"><Icon name="user" /></span><span>{transaction.phone_number || "Unknown"}</span></div></td>
                              <td><Badge color="light">{transaction.package_type || "Standard"}</Badge></td>
                              <td>
                                <Badge color={transaction.router_name ? "info" : "secondary"} pill>
                                  {[transaction.platform_label, transaction.router_name].filter(Boolean).join(" · ") || "site n/a"}
                                </Badge>
                              </td>
                              <td className="fw-bold text-success">{money(transaction.amount)}</td>
                              <td><code className="hotspot-receipt">{transaction.mpesa_receipt_number || "-"}</code></td>
                              <td className="text-soft">{transaction.created_at ? new Date(transaction.created_at).toLocaleString() : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </CardBody>
                </Card>
              </Col>
              <Col xl="4">
                <Card className="hotspot-panel-card">
                  <CardBody>
                    <div className="hotspot-panel-head">
                      <div>
                        <h6 className="hotspot-section-title mb-1">Router health</h6>
                        <span className="text-soft small">Live network inventory</span>
                      </div>
                      <span className="hotspot-health-score">{routerHealth}%</span>
                    </div>
                    {routers.length === 0 ? (
                      <div className="hotspot-empty-state"><Icon name="wifi-off" /><span>No routers configured.</span></div>
                    ) : routers.map((router) => (
                      <div key={router.id} className="hotspot-router-row">
                        <span className={`hotspot-router-icon ${["active", "online", "connected"].includes(String(router.status || "").toLowerCase()) ? "online" : "offline"}`}>
                          <Icon name="wifi" />
                        </span>
                        <div className="hotspot-router-copy">
                          <div className="fw-semibold text-dark">{router.display_name || router.name}</div>
                          <small className="text-soft">
                            {[router.platform_label, router.location].filter(Boolean).join(" · ") || "Location not configured"}
                          </small>
                        </div>
                        <Badge color={["active", "online", "connected"].includes(String(router.status || "").toLowerCase()) ? "success" : "secondary"} pill>
                          {router.status || "Unknown"}
                        </Badge>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Content>
    </>
  );
};

export default HotspotDashboard;
