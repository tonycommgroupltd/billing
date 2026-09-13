import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Badge, Spinner, Table, Modal, ModalHeader, ModalBody, ModalFooter, Button, Input } from "reactstrap";
import { Block, Row, Col, Icon } from "../../components/Component";
import { Link } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import HotspotAPI from "../../helpers/HotspotAPI";

const statusColors = {
  completed: "success",
  success: "success",
  pending: "warning",
  failed: "danger",
  cancelled: "danger",
};

const progressLabel = (tx) => {
  const paid = tx.status === "success" || tx.status === "completed";
  if (paid && (tx.user_created === "1" || tx.user_created === 1))
    return { color: "success", text: "User Created" };
  if (paid) return { color: "warning", text: "Paid • User Pending" };
  if (tx.status === "pending") return { color: "secondary", text: "Awaiting Payment" };
  return { color: "danger", text: "Payment Failed" };
};

const HotspotDashboard = () => {
  const [stats, setStats] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [packageData, setPackageData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState("7days");
  const [packagePeriod, setPackagePeriod] = useState("today");
  const [dateModal, setDateModal] = useState(false);
  const [monthModal, setMonthModal] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [appliedDate, setAppliedDate] = useState("");
  const [appliedMonth, setAppliedMonth] = useState("");

  const fetchDashboard = useCallback(async () => {
    try {
      const params = {};
      if (appliedDate)  params.date  = appliedDate;
      if (appliedMonth) params.month = appliedMonth;
      const [statsRes, revenueRes, pkgRes, activityRes] = await Promise.all([
        HotspotAPI.getDashboardStats(params),
        HotspotAPI.getRevenueChart(chartPeriod),
        HotspotAPI.getPackageBreakdown(packagePeriod),
        HotspotAPI.getRecentActivity(8),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (revenueRes.success) setRevenueData(revenueRes.data);
      if (pkgRes.success) setPackageData(pkgRes.data);
      if (activityRes.success) setRecentActivity(activityRes.data);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [chartPeriod, packagePeriod, appliedDate, appliedMonth]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const monthName = today.toLocaleDateString("en-US", { year: "numeric", month: "long" });

  if (loading) {
    return (
      <React.Fragment>
        <Head title="Hotspot Dashboard" />
        <Content>
          <div className="text-center py-5">
            <Spinner color="primary" />
            <p className="mt-2">Loading dashboard...</p>
          </div>
        </Content>
      </React.Fragment>
    );
  }

  const s = stats || {};
  const rev = s.revenue || {};
  const tx = s.transactions || {};
  const usr = s.users || {};
  const vch = s.vouchers || {};

  // Stacked bar chart — success / failed / pending
  const chartLabels = revenueData.map((d) => d.label);
  const chartDataConfig = {
    labels: chartLabels,
    datasets: [
      {
        label: "Success",
        data: revenueData.map((d) => d.successful || 0),
        backgroundColor: "rgba(40,167,69,0.7)",
        borderColor: "rgb(40,167,69)",
        borderWidth: 1,
      },
      {
        label: "Failed",
        data: revenueData.map((d) => d.failed || 0),
        backgroundColor: "rgba(220,53,69,0.7)",
        borderColor: "rgb(220,53,69)",
        borderWidth: 1,
      },
      {
        label: "Pending",
        data: revenueData.map((d) => Math.max(0, (d.transactions || 0) - (d.successful || 0) - (d.failed || 0))),
        backgroundColor: "rgba(255,193,7,0.7)",
        borderColor: "rgb(255,193,7)",
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" },
      tooltip: {
        callbacks: {
          footer: (items) => {
            const idx = items[0]?.dataIndex;
            if (idx !== undefined && revenueData[idx]) {
              return `Revenue: KES ${Number(revenueData[idx].revenue || 0).toLocaleString()}`;
            }
            return "";
          },
        },
      },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, title: { display: true, text: "Number of Transactions" } },
    },
  };

  return (
    <React.Fragment>
      <Head title="Hotspot Dashboard" />
      <Content>
        {/* ══════ DASHBOARD HEADER BANNER ══════ */}
        <div className="mb-4 p-4 text-white" style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: 12,
        }}>
          <Row className="align-items-center">
            <Col>
              <h3 className="text-white mb-1">Dashboard</h3>
              <p className="mb-0" style={{ opacity: 0.85 }}>Real-time overview of your hotspot business</p>
            </Col>
            <Col xs="auto">
              <Badge color="light" className="text-dark px-3 py-2" style={{ fontSize: "0.85rem" }}>
                <Icon name="user" className="me-1" />Admin
              </Badge>
            </Col>
          </Row>
        </div>

        {/* ══════ KPI CARDS (4 across) ══════ */}
        <Row className="g-3 g-md-4 mb-4">
          {/* Today Revenue */}
          <Col xs="6" lg="3">
            <Card className="h-100 border-0 shadow-sm" style={{ borderRadius: 12, borderTop: "4px solid #10b981", cursor: "pointer" }}
              onClick={() => { setFilterDate(appliedDate); setDateModal(true); }}>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-center rounded mb-2"
                  style={{ width: 48, height: 48, background: "linear-gradient(135deg,#10b981,#34d399)" }}>
                  <Icon name="coin" style={{ fontSize: "1.25rem", color: "#fff" }} />
                </div>
                <div className="fw-bold text-success" style={{ fontSize: "1.5rem" }}>{formatKES(rev.today)}</div>
                <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase" }}>
                  {s.filter?.date_label || dayName}
                </div>
                {appliedDate ? (
                  <div className="d-flex align-items-center gap-1 mt-1">
                    <Badge color="success" pill style={{ fontSize: "0.6rem" }}>Filtered</Badge>
                    <span className="text-muted" style={{ fontSize: "0.6rem", cursor: "pointer", textDecoration: "underline" }}
                      onClick={(e) => { e.stopPropagation(); setAppliedDate(""); setFilterDate(""); }}>Clear</span>
                  </div>
                ) : (
                  <div className="text-muted" style={{ fontSize: "0.65rem" }}>Click to filter by date</div>
                )}
              </div>
            </Card>
          </Col>

          {/* Monthly Revenue */}
          <Col xs="6" lg="3">
            <Card className="h-100 border-0 shadow-sm" style={{ borderRadius: 12, borderTop: "4px solid #3b82f6", cursor: "pointer" }}
              onClick={() => { setFilterMonth(appliedMonth); setMonthModal(true); }}>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-center rounded mb-2"
                  style={{ width: 48, height: 48, background: "linear-gradient(135deg,#3b82f6,#60a5fa)" }}>
                  <Icon name="growth" style={{ fontSize: "1.25rem", color: "#fff" }} />
                </div>
                <div className="fw-bold text-primary" style={{ fontSize: "1.5rem" }}>{formatKES(rev.month)}</div>
                <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase" }}>
                  {s.filter?.month_label || monthName}
                </div>
                {appliedMonth ? (
                  <div className="d-flex align-items-center gap-1 mt-1">
                    <Badge color="primary" pill style={{ fontSize: "0.6rem" }}>Filtered</Badge>
                    <span className="text-muted" style={{ fontSize: "0.6rem", cursor: "pointer", textDecoration: "underline" }}
                      onClick={(e) => { e.stopPropagation(); setAppliedMonth(""); setFilterMonth(""); }}>Clear</span>
                  </div>
                ) : (
                  <div className="text-muted" style={{ fontSize: "0.65rem" }}>Click to filter by month</div>
                )}
              </div>
            </Card>
          </Col>

          {/* Pending STK */}
          <Col xs="6" lg="3">
            <Card className="h-100 border-0 shadow-sm" style={{ borderRadius: 12, borderTop: "4px solid #f59e0b" }}>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-center rounded mb-2"
                  style={{ width: 48, height: 48, background: "linear-gradient(135deg,#f59e0b,#fbbf24)" }}>
                  <Icon name="loader" style={{ fontSize: "1.25rem", color: "#fff" }} />
                </div>
                <div className="fw-bold text-warning" style={{ fontSize: "1.5rem" }}>{tx.pending || 0}</div>
                <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase" }}>Pending STK</div>
              </div>
            </Card>
          </Col>

          {/* Active Users */}
          <Col xs="6" lg="3">
            <Card className="h-100 border-0 shadow-sm" style={{ borderRadius: 12, borderTop: "4px solid #06b6d4" }}>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-center rounded mb-2"
                  style={{ width: 48, height: 48, background: "linear-gradient(135deg,#06b6d4,#22d3ee)" }}>
                  <Icon name="wifi" style={{ fontSize: "1.25rem", color: "#fff" }} />
                </div>
                <div className="fw-bold text-info" style={{ fontSize: "1.5rem" }}>{usr.online || 0}</div>
                <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase" }}>Active Users</div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* ══════ TODAY'S TRANSACTIONS SUMMARY ══════ */}
        <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body">
            <h6 className="text-muted mb-0">Today's Transactions</h6>
            <small className="text-muted">{dayName}</small>
            <div className="d-flex gap-4 mt-3">
              <div className="text-center">
                <div className="fw-bold text-primary" style={{ fontSize: "2rem" }}>{tx.today || 0}</div>
                <small className="text-muted">Total</small>
              </div>
              <div className="text-center">
                <div className="fw-bold text-success" style={{ fontSize: "2rem" }}>{tx.successful || 0}</div>
                <small className="text-muted">Success</small>
              </div>
              <div className="text-center">
                <div className="fw-bold text-danger" style={{ fontSize: "2rem" }}>{tx.failed || 0}</div>
                <small className="text-muted">Failed</small>
              </div>
            </div>
          </div>
        </Card>

        {/* ══════ STACKED BAR CHART ══════ */}
        <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h6 className="mb-0">
                <Icon name="bar-chart" className="me-1" />
                Daily Transactions ({chartPeriod === "7days" ? "Last 7 Days" : chartPeriod === "30days" ? "Last 30 Days" : "Last 24 Hours"})
              </h6>
              <div className="d-flex gap-1">
                {["24hours", "7days", "30days"].map((p) => (
                  <Button key={p} size="sm" color={chartPeriod === p ? "primary" : "light"}
                    onClick={() => setChartPeriod(p)}>
                    {p === "24hours" ? "24H" : p === "7days" ? "7D" : "30D"}
                  </Button>
                ))}
              </div>
            </div>
            <div style={{ height: 300 }}>
              <Bar data={chartDataConfig} options={chartOptions} />
            </div>
            {/* Summary table */}
            <div className="mt-3 table-responsive">
              <Table size="sm" className="mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Date</th><th>Total</th><th>Success</th><th>Failed</th><th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.map((d, i) => (
                    <tr key={i}>
                      <td>
                        {d.label}
                        {i === revenueData.length - 1 && chartPeriod === "7days" && (
                          <Badge color="primary" className="ms-1" pill>Today</Badge>
                        )}
                      </td>
                      <td><Badge color="secondary">{d.transactions || 0}</Badge></td>
                      <td><Badge color="success">{d.successful || 0}</Badge></td>
                      <td><Badge color="danger">{d.failed || 0}</Badge></td>
                      <td className="fw-bold">{formatKES(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </Card>

        {/* ══════ BOTTOM: RECENT PAYMENTS + RIGHT SIDEBAR ══════ */}
        <Row className="g-3">
          <Col xs="12" lg="7">
            <Card className="border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
              <div className="card-body">
                <h6 className="mb-0"><Icon name="clock" className="me-1" />Recent Payments</h6>
                <small className="text-muted">Last 8 M-Pesa transactions</small>
                <div className="table-responsive mt-3">
                  <Table size="sm" striped className="mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Phone</th><th>Package</th><th>Amount</th><th>Status</th><th>Progress</th><th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentActivity.length === 0 ? (
                        <tr><td colSpan="6" className="text-center text-muted py-3">No recent transactions</td></tr>
                      ) : recentActivity.map((item, i) => {
                        const prog = progressLabel(item);
                        return (
                          <tr key={i}>
                            <td>{item.phone_number || "—"}</td>
                            <td>
                              <Badge color="secondary" className="text-uppercase" style={{ fontSize: "0.7rem" }}>
                                {item.package_type || "—"}
                              </Badge>
                            </td>
                            <td className="fw-bold">{formatKES(item.amount)}</td>
                            <td><Badge color={statusColors[item.status] || "secondary"}>{item.status}</Badge></td>
                            <td><Badge color={prog.color} style={{ fontSize: "0.65rem" }}>{prog.text}</Badge></td>
                            <td><small>{item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</small></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </div>
            </Card>
          </Col>

          <Col xs="12" lg="5">
            {/* Voucher Inventory */}
            <Card className="border-0 shadow-sm mb-3" style={{ borderRadius: 12 }}>
              <div className="card-body text-center">
                <h6 className="text-muted">Voucher Inventory</h6>
                <small className="text-muted d-block mb-3">Available voucher stock</small>
                <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                  style={{ width: 56, height: 56, background: "linear-gradient(135deg,#6b7280,#9ca3af)" }}>
                  <Icon name="ticket" style={{ fontSize: "1.5rem", color: "#fff" }} />
                </div>
                <div className="fw-bold text-secondary" style={{ fontSize: "2rem" }}>{vch.active || 0}</div>
                <Link to="/admin/hotspot/vouchers" className="btn btn-primary btn-sm w-100 mt-2">
                  Manage Vouchers
                </Link>
              </div>
            </Card>

            {/* Quick Actions */}
            <Card className="border-0 shadow-sm" style={{ borderRadius: 12 }}>
              <div className="card-body">
                <h6 className="text-muted">Quick Actions</h6>
                <small className="text-muted d-block mb-3">Most common admin tasks</small>
                <div className="d-grid gap-2">
                  <Link to="/admin/hotspot/packages" className="btn btn-primary btn-sm">
                    <Icon name="package" className="me-1" /> Manage Packages
                  </Link>
                  <Link to="/admin/hotspot/transactions" className="btn btn-outline-primary btn-sm">
                    <Icon name="cc-alt2" className="me-1" /> View Transactions
                  </Link>
                  <Link to="/admin/hotspot/users" className="btn btn-outline-info btn-sm">
                    <Icon name="wifi" className="me-1" /> View Active Users
                  </Link>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* ══════ PACKAGE SALES BREAKDOWN ══════ */}
        <Card className="border-0 shadow-sm mt-4 mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h6 className="mb-0"><Icon name="package" className="me-1" />Package Sales Breakdown</h6>
              <div className="d-flex gap-1">
                {[{ key: "today", label: "Today" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }].map((p) => (
                  <Button key={p.key} size="sm" color={packagePeriod === p.key ? "primary" : "light"}
                    onClick={() => setPackagePeriod(p.key)}>{p.label}</Button>
                ))}
              </div>
            </div>
            {packageData.length === 0 ? (
              <p className="text-muted text-center py-3">No sales data for this period</p>
            ) : (
              <div className="table-responsive">
                <Table size="sm" className="mb-0">
                  <thead className="table-light"><tr><th>Package</th><th>Sales</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {packageData.map((pkg, i) => (
                      <tr key={i}>
                        <td><Badge color="secondary" className="text-uppercase">{pkg.package_name}</Badge></td>
                        <td>{pkg.count}</td>
                        <td className="fw-bold text-success">{formatKES(pkg.revenue)}</td>
                      </tr>
                    ))}
                    <tr className="table-primary fw-bold">
                      <td>Total</td>
                      <td>{packageData.reduce((s, p) => s + (p.count || 0), 0)}</td>
                      <td className="text-success">{formatKES(packageData.reduce((s, p) => s + (p.revenue || 0), 0))}</td>
                    </tr>
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        </Card>

        {/* ══════ REVENUE BY LOCATION ══════ */}
        {s.location_revenue && s.location_revenue.length > 0 && (
          <Card className="border-0 shadow-sm mt-4 mb-4" style={{ borderRadius: 12 }}>
            <div className="card-header bg-white border-0 py-3 d-flex align-items-center">
              <div>
                <h6 className="mb-0"><Icon name="map-pin" className="me-1" />Today's Revenue by Location</h6>
                <small className="text-muted">Revenue breakdown per hotspot location</small>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <Table size="sm" hover className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Location</th>
                      <th className="text-end pe-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.location_revenue.map((item, i) => {
                      const isUnverified = item.location === "Unverified MACs";
                      return (
                        <tr key={i}>
                          <td className="ps-3">
                            {isUnverified ? (
                              <Badge color="warning" className="text-dark">⚠️ {item.location}</Badge>
                            ) : (
                              <Badge color="info">📍 {item.location}</Badge>
                            )}
                          </td>
                          <td className="text-end pe-3">
                            <strong className="text-success">KES {Number(item.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="table-primary fw-bold">
                      <td className="ps-3">GRAND TOTAL</td>
                      <td className="text-end pe-3">
                        <strong className="text-success">
                          KES {s.location_revenue.reduce((sum, r) => sum + (r.revenue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </strong>
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </div>
            </div>
          </Card>
        )}

        {/* ══════ DATE MODAL ══════ */}
        <Modal isOpen={dateModal} toggle={() => setDateModal(false)}>
          <ModalHeader toggle={() => setDateModal(false)}>Revenue by Date</ModalHeader>
          <ModalBody>
            <label className="form-label">Select Date</label>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => { setAppliedDate(""); setFilterDate(""); setDateModal(false); }}>Reset</Button>
            <Button color="success" disabled={!filterDate} onClick={() => { setAppliedDate(filterDate); setDateModal(false); }}>Apply</Button>
          </ModalFooter>
        </Modal>

        {/* ══════ MONTH MODAL ══════ */}
        <Modal isOpen={monthModal} toggle={() => setMonthModal(false)}>
          <ModalHeader toggle={() => setMonthModal(false)}>Revenue by Month</ModalHeader>
          <ModalBody>
            <label className="form-label">Select Month</label>
            <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => { setAppliedMonth(""); setFilterMonth(""); setMonthModal(false); }}>Reset</Button>
            <Button color="primary" disabled={!filterMonth} onClick={() => { setAppliedMonth(filterMonth); setMonthModal(false); }}>Apply</Button>
          </ModalFooter>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default HotspotDashboard;
