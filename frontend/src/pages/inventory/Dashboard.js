import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Row,
  Col,
  Icon,
  Button,
} from "../../components/Component";
import { Card, Badge, Spinner } from "reactstrap";
import { connect } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import InventoryAPI from "../../helpers/InventoryAPI";
import { format } from "date-fns";

function safeDate(str) {
  if (!str) return "-";
  try { return format(new Date(str), "dd MMM yyyy"); } catch { return "-"; }
}

function getAddedBy(item) {
  if (item?.added_by_name) return item.added_by_name;
  if (!item?.description) return "-";
  try { const m = JSON.parse(item.description); return m.added_by || "-"; } catch { return "-"; }
}

function getRemainingQty(item) {
  const raw = Number(item?.quantity_available ?? item?.quantity ?? 0);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function getTotalQty(item) {
  const remaining = getRemainingQty(item);
  const explicitTotal = Number(item?.quantity_total);
  if (Number.isFinite(explicitTotal) && explicitTotal >= 0) {
    return Math.max(explicitTotal, remaining);
  }
  const disbursed = Number(item?.quantity_disbursed);
  if (Number.isFinite(disbursed) && disbursed >= 0) {
    return remaining + disbursed;
  }
  return remaining;
}

function getDisbursedQty(item) {
  return Math.max(0, getTotalQty(item) - getRemainingQty(item));
}

// ── Clickable stat card ──────────────────────────────────────────────────────
const StatCard = ({ icon, color, value, label, sub, loading, active, onClick }) => (
  <Card
    className="card-bordered h-100"
    onClick={onClick}
    style={{
      cursor: onClick ? "pointer" : "default",
      border: active ? `2px solid var(--${color === "primary" ? "#6576ff" : color})` : undefined,
      boxShadow: active ? "0 4px 18px rgba(101,118,255,0.18)" : undefined,
      transform: active ? "translateY(-2px)" : undefined,
      transition: "box-shadow 0.18s, transform 0.18s, border 0.18s",
      outline: active ? "2px solid" : undefined,
      outlineColor: active
        ? (color === "success" ? "#1ee0ac" : color === "info" ? "#09c2de" : color === "danger" ? "#e85347" : "#6576ff")
        : "transparent",
      outlineOffset: 2,
    }}
  >
    <div className="card-inner" style={{ position: "relative" }}>
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <p className="text-soft mb-1" style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {label}
          </p>
          <div style={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1.1, color: "#364a63" }}>
            {loading ? <Spinner size="sm" /> : value}
          </div>
          {sub && <p className="text-muted mb-0 mt-1" style={{ fontSize: "0.78rem" }}>{sub}</p>}
          {onClick && (
            <p style={{ fontSize: "0.7rem", color: "#b0bac5", marginTop: 4, marginBottom: 0, fontWeight: 600 }}>
              Click to view list →
            </p>
          )}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `var(--bs-${color}, #e5f0ff)`, opacity: 0.15, flexShrink: 0 }} />
        <em className={`icon ni ni-${icon} text-${color}`} style={{ fontSize: "1.6rem", position: "absolute", right: 20, top: 20 }} />
      </div>
    </div>
  </Card>
);

// ── Section label ────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div className="mb-3 mt-2">
    <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#8094ae" }}>
      {children}
    </span>
    <hr className="mt-1 mb-0" style={{ borderColor: "#e7eaf0" }} />
  </div>
);

const InventoryDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [routers, setRouters]         = useState([]);
  const [otherItems, setOtherItems]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const goToList = (status) => {
    if (!status || status === "all") {
      navigate("/admin/inventory/list");
    } else {
      navigate(`/admin/inventory/list?status=${status}`);
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [routerRes, allRes] = await Promise.all([
        InventoryAPI.getItems({ category: "GPON Router" }),
        InventoryAPI.getItems({}),
      ]);
      const routerData = Array.isArray(routerRes?.data) ? routerRes.data : [];
      const allData    = Array.isArray(allRes?.data)    ? allRes.data    : [];
      setRouters(routerData);
      setOtherItems(allData.filter(i => i.category !== "GPON Router"));
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Router stats ──────────────────────────────────────────────────────────
  const totalRouters     = routers.length;
  const activeRouters    = routers.filter(r => r.status === "active").length;
  const disbursedRouters = routers.filter(r => r.status === "disbursed").length;
  const faultyRouters    = routers.filter(r => r.status === "faulty" || r.status === "inactive").length;

  // ── Other items stats ─────────────────────────────────────────────────────
  const totalOther  = otherItems.length;
  const lowStockOther = otherItems.filter(i => i.quantity_available < (i.minimum_quantity || 5)).length;
  const uniqueCats  = [...new Set(otherItems.map(i => i.category).filter(Boolean))].length;
  const otherItemRows = [...otherItems].sort((a, b) =>
    `${a.name}-${a.category}`.localeCompare(`${b.name}-${b.category}`)
  );

  // ── Recent routers (last 8 for dashboard preview) ─────────────────────────
  const recentRouters = [...routers]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  return (
    <React.Fragment>
      <Head title="Inventory Dashboard" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Inventory Dashboard</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="light" size="sm" onClick={loadAll} disabled={loading}>
                <Icon name="reload" /><span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>

          {/* ── GPON ROUTERS ───────────────────────────────────────────────── */}
          <SectionLabel>GPON Routers — click a card to view filtered list</SectionLabel>
          <Row className="g-3 mb-4">
            <Col xxl="3" md="6">
              <StatCard
                icon="wifi" color="primary"
                label="Total Routers" value={totalRouters} sub="All statuses"
                loading={loading}
                active={false}
                onClick={() => goToList("all")}
              />
            </Col>
            <Col xxl="3" md="6">
              <StatCard
                icon="check-circle" color="success"
                label="Available" value={activeRouters} sub="Status: active"
                loading={loading}
                active={false}
                onClick={() => goToList("active")}
              />
            </Col>
            <Col xxl="3" md="6">
              <StatCard
                icon="arrow-up-right" color="info"
                label="Disbursed" value={disbursedRouters} sub="Issued to field"
                loading={loading}
                active={false}
                onClick={() => goToList("disbursed")}
              />
            </Col>
            <Col xxl="3" md="6">
              <StatCard
                icon="alert-circle" color="danger"
                label="Faulty / Inactive" value={faultyRouters} sub="Needs attention"
                loading={loading}
                active={false}
                onClick={() => goToList("faulty")}
              />
            </Col>
          </Row>

          {/* ── OTHER INVENTORY ──────────────────────────────────────────────── */}
          <SectionLabel>Other Inventory Items</SectionLabel>
          <Row className="g-3 mb-4">
            <Col xxl="4" md="6">
              <StatCard icon="package"      color="primary" label="Total Other Items" value={totalOther}      sub={`Across ${uniqueCats} categor${uniqueCats !== 1 ? "ies" : "y"}`} loading={loading} />
            </Col>
            <Col xxl="4" md="6">
              <StatCard icon="alert-circle" color="warning" label="Low Stock"         value={lowStockOther}   sub="Below minimum level"  loading={loading} />
            </Col>
            <Col xxl="4" md="6">
              <StatCard icon="grid"         color="info"    label="Categories"        value={uniqueCats}      sub="Distinct item types"  loading={loading} />
            </Col>
          </Row>

          <SectionLabel>Each Item Snapshot (Disbursed vs Remaining)</SectionLabel>
          {loading ? (
            <div className="text-center py-4"><Spinner color="primary" /></div>
          ) : otherItemRows.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <em className="icon ni ni-package" style={{ fontSize: "1.6rem", display: "block", marginBottom: 6 }} />
              No item cards yet
            </div>
          ) : (
            <Row className="g-3 mb-4">
              {otherItemRows.map((item) => {
                const remaining = getRemainingQty(item);
                const total = getTotalQty(item);
                const disbursed = getDisbursedQty(item);
                const pctRemaining = total > 0 ? Math.round((remaining / total) * 100) : 0;
                const minQty = Number(item.minimum_quantity || 5);
                const isLow = remaining < minQty;
                return (
                  <Col key={`card-${item.id}`} xxl="3" lg="4" md="6">
                    <Card className="card-bordered h-100">
                      <div className="card-inner py-3">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: "#364a63", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {item.name}
                            </div>
                            <div className="text-muted" style={{ fontSize: "0.74rem" }}>
                              {item.category || "Uncategorized"}
                            </div>
                          </div>
                          <Badge color={isLow ? "warning" : "success"} style={{ fontSize: "0.66rem" }}>
                            {isLow ? "Low" : "OK"}
                          </Badge>
                        </div>

                        <div className="d-flex justify-content-between align-items-end mb-2">
                          <div>
                            <div className="text-muted" style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                              Remaining
                            </div>
                            <div style={{ fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.1, color: "#1ee0ac" }}>
                              {remaining}
                              {item.unit ? <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#8094ae", marginLeft: 4 }}>{item.unit}</span> : null}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div className="text-muted" style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                              Disbursed
                            </div>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.1, color: "#09c2de" }}>
                              {disbursed}
                            </div>
                          </div>
                        </div>

                        <div className="mb-1 d-flex justify-content-between align-items-center">
                          <span className="text-muted" style={{ fontSize: "0.68rem" }}>Total: {total}</span>
                          <span className="text-muted" style={{ fontSize: "0.68rem" }}>{pctRemaining}% remaining</span>
                        </div>
                        <div className="d-flex rounded overflow-hidden" style={{ height: 8, background: "#e9ecef" }}>
                          <div style={{ width: `${pctRemaining}%`, background: isLow ? "#f4bd0e" : "#1ee0ac", transition: "width 0.5s" }} />
                          <div style={{ width: `${Math.max(0, 100 - pctRemaining)}%`, background: "#09c2de", transition: "width 0.5s" }} />
                        </div>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}

          {/* ── DETAIL TABLES ────────────────────────────────────────────────── */}
          <Row className="g-gs">

            {/* Recent routers preview */}
            <Col lg="7">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="title mb-0">Recent Routers Added</h6>
                    <Link to="/admin/inventory/list" className="link text-primary" style={{ fontSize: "0.82rem" }}>
                      View all →
                    </Link>
                  </div>

                  {loading ? (
                    <div className="text-center py-4"><Spinner color="primary" /></div>
                  ) : recentRouters.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <em className="icon ni ni-wifi-off" style={{ fontSize: "2rem", display: "block", marginBottom: 8 }} />
                      No routers scanned yet
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                      <table className="table table-sm table-hover mb-0">
                        <thead style={{ background: "#f8f9fa", position: "sticky", top: 0 }}>
                          <tr>
                            <th className="text-muted small">Router No.</th>
                            <th className="text-muted small">Serial</th>
                            <th className="text-muted small">Added By</th>
                            <th className="text-muted small">Date</th>
                            <th className="text-muted small">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentRouters.map(r => (
                            <tr key={r.id}>
                              <td><strong>{r.name}</strong></td>
                              <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{r.serial_number || "-"}</td>
                              <td className="text-muted small">{getAddedBy(r)}</td>
                              <td className="text-muted small">{safeDate(r.created_at)}</td>
                              <td>
                                <Badge
                                  color={r.status === "active" ? "success" : r.status === "disbursed" ? "info" : r.status === "faulty" ? "danger" : "secondary"}
                                  style={{ fontSize: "0.7rem", cursor: "pointer" }}
                                  onClick={() => goToList(r.status === "inactive" ? "faulty" : r.status)}
                                >
                                  {r.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {routers.length > 8 && (
                    <div className="text-muted small mt-2" style={{ textAlign: "right" }}>
                      Showing latest 8 of {routers.length} — click a stat card above to view filtered
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            {/* Other items list */}
            <Col lg="5">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="title mb-0">Other Inventory Items</h6>
                    <Link to="/admin/inventory/list" className="link text-primary" style={{ fontSize: "0.82rem" }}>View all →</Link>
                  </div>

                  {loading ? (
                    <div className="text-center py-4"><Spinner color="primary" /></div>
                  ) : otherItemRows.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <em className="icon ni ni-package" style={{ fontSize: "2rem", display: "block", marginBottom: 8 }} />
                      No other items yet
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                      <table className="table table-sm table-hover mb-0">
                        <thead style={{ background: "#f8f9fa", position: "sticky", top: 0 }}>
                          <tr>
                            <th className="text-muted small">Item — Category</th>
                            <th className="text-muted small text-center">Qty</th>
                            <th className="text-muted small text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {otherItemRows.map(item => {
                            const label = item.category ? `${item.name} — ${item.category}` : item.name;
                            const qty   = item.quantity_available ?? item.quantity ?? 0;
                            const isLow = qty < (item.minimum_quantity || 5);
                            return (
                              <tr key={item.id}>
                                <td><strong style={{ fontSize: "0.82rem" }}>{label}</strong></td>
                                <td className="text-center">
                                  <span style={{ fontWeight: 600 }}>{qty}</span>
                                  {item.unit && <span className="text-muted ml-1" style={{ fontSize: "0.72rem" }}>{item.unit}</span>}
                                </td>
                                <td className="text-center">
                                  <Badge color={isLow ? "warning" : "success"} style={{ fontSize: "0.68rem" }}>
                                    {isLow ? "Low" : "OK"}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          {/* ── ROUTER STATUS BREAKDOWN BAR ──────────────────────────────────── */}
          {!loading && totalRouters > 0 && (
            <Row className="g-gs mt-2">
              <Col>
                <Card className="card-bordered">
                  <div className="card-inner">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="title mb-0">Router Status Breakdown</h6>
                      <span className="text-muted small">{totalRouters} total</span>
                    </div>
                    <div className="d-flex rounded overflow-hidden" style={{ height: 22, background: "#e9ecef" }}>
                      {activeRouters > 0 && (
                        <div onClick={() => goToList("active")}
                          style={{ width: `${(activeRouters / totalRouters) * 100}%`, background: "#1ee0ac", transition: "width 0.6s", cursor: "pointer" }}
                          title={`Available: ${activeRouters} — click to view`} />
                      )}
                      {disbursedRouters > 0 && (
                        <div onClick={() => goToList("disbursed")}
                          style={{ width: `${(disbursedRouters / totalRouters) * 100}%`, background: "#09c2de", transition: "width 0.6s", cursor: "pointer" }}
                          title={`Disbursed: ${disbursedRouters} — click to view`} />
                      )}
                      {faultyRouters > 0 && (
                        <div onClick={() => goToList("faulty")}
                          style={{ width: `${(faultyRouters / totalRouters) * 100}%`, background: "#e85347", transition: "width 0.6s", cursor: "pointer" }}
                          title={`Faulty/Inactive: ${faultyRouters} — click to view`} />
                      )}
                    </div>
                    <div className="d-flex gap-4 mt-2 flex-wrap">
                      {[
                        { key: "active",    color: "#1ee0ac", label: "Active",          count: activeRouters },
                        { key: "disbursed", color: "#09c2de", label: "Disbursed",       count: disbursedRouters },
                        { key: "faulty",    color: "#e85347", label: "Faulty/Inactive", count: faultyRouters },
                      ].map(({ key, color, label, count }) => (
                        <span key={key} className="small" onClick={() => goToList(key)} style={{ cursor: "pointer" }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color, marginRight: 4 }} />
                          {label} <strong>{count}</strong>
                          <span className="text-muted ml-1">({totalRouters ? Math.round((count / totalRouters) * 100) : 0}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>
          )}

        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(InventoryDashboard);
