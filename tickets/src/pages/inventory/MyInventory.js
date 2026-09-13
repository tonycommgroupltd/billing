import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Row,
  Col,
  Icon,
  Button,
} from "../../components/Component";
import { Card, Badge, Spinner } from "reactstrap";
import { connect } from "react-redux";
import InventoryAPI from "../../helpers/InventoryAPI";
import { buildByUserSummary } from "../../utils/disbursementHistory";
import {
  formatDropCableBalance,
  getPendingCableItemLabel,
} from "../../utils/inventoryCable";
import { format } from "date-fns";

function safeDate(str) {
  if (!str) return "-";
  try { return format(new Date(str), "dd MMM yyyy"); } catch { return "-"; }
}

const MyInventory = ({ user }) => {
  const [myItems, setMyItems] = useState([]);
  const [pendingBalances, setPendingBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending"); // "pending" | "used" | "all"

  const loadMyItems = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [itemsRes, balRes] = await Promise.all([
        InventoryAPI.listDisbursements({ assigned_to_id: user.id }),
        InventoryAPI.listPendingBalances({ assigned_to_id: user.id }),
      ]);
      setMyItems(Array.isArray(itemsRes?.data) ? itemsRes.data : []);
      setPendingBalances(Array.isArray(balRes?.data) ? balRes.data : []);
    } catch (err) {
      console.error("Error loading my inventory:", err);
      setMyItems([]);
      setPendingBalances([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadMyItems(); }, [loadMyItems]);

  const routers      = myItems.filter(i => i.type === "router");
  const otherItems   = myItems.filter(i => i.type === "item");

  // Pending = router not yet used on a ticket
  const pendingRouters = routers.filter(r => !r.ticket_number);
  const usedRouters    = routers.filter(r =>  r.ticket_number);

  const userLabel = user?.name || user?.username || "Unknown";
  const itemSummary = buildByUserSummary(
    otherItems.map((r) => ({
      ...r,
      assigned_to_id: r.assigned_to_id || user.id,
      assigned_to_name: r.assigned_to_name || userLabel,
    })),
    pendingBalances
  ).flatMap((u) => u.pendingItems);
  const totalItemsPending = itemSummary.length;

  const displayItems =
    activeTab === "pending" ? myItems.filter(i => i.type !== "router" || !i.ticket_number) :
    activeTab === "used"    ? myItems.filter(i => i.type === "router" && i.ticket_number) :
    [...myItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const TabBtn = ({ id, label, count, color = "#6576ff" }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      style={{
        padding: "8px 18px", border: "none", cursor: "pointer", borderRadius: 6,
        background: activeTab === id ? color : "#f5f6fa",
        color: activeTab === id ? "#fff" : "#526484",
        fontWeight: 600, fontSize: "0.84rem",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {label}
      <span style={{
        background: activeTab === id ? "rgba(255,255,255,0.25)" : "#e5e9f2",
        color: activeTab === id ? "#fff" : "#8094ae",
        borderRadius: 20, padding: "0 7px", fontSize: "0.75rem", fontWeight: 700,
      }}>
        {count}
      </span>
    </button>
  );

  return (
    <React.Fragment>
      <Head title="My Inventory" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>My Inventory</BlockTitle>
              <BlockDes className="text-soft">
                <p>Items and routers assigned to you</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="light" size="sm" onClick={loadMyItems} disabled={loading}>
                <Icon name="reload" /><span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <Row className="g-3 mb-4">
            <Col sm="3">
              <Card className="card-bordered">
                <div className="card-inner py-3">
                  <div className="d-flex align-items-center" style={{ gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff3cd", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <em className="icon ni ni-wifi text-warning" style={{ fontSize: "1.3rem" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1, color: "#364a63" }}>
                        {loading ? <Spinner size="sm" /> : pendingRouters.length}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.78rem" }}>Pending Routers</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col sm="3">
              <Card className="card-bordered">
                <div className="card-inner py-3">
                  <div className="d-flex align-items-center" style={{ gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <em className="icon ni ni-check-circle text-success" style={{ fontSize: "1.3rem" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1, color: "#364a63" }}>
                        {loading ? <Spinner size="sm" /> : usedRouters.length}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.78rem" }}>Used on Tickets</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col sm="3">
              <Card className="card-bordered">
                <div className="card-inner py-3">
                  <div className="d-flex align-items-center" style={{ gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e5f9f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <em className="icon ni ni-package text-success" style={{ fontSize: "1.3rem" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1, color: "#364a63" }}>
                        {loading ? <Spinner size="sm" /> : totalItemsPending}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.78rem" }}>Items (Pending)</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col sm="3">
              <Card className="card-bordered">
                <div className="card-inner py-3">
                  <div className="d-flex align-items-center" style={{ gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e9ecff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <em className="icon ni ni-list text-primary" style={{ fontSize: "1.3rem" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1, color: "#364a63" }}>
                        {loading ? <Spinner size="sm" /> : myItems.length}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.78rem" }}>Total Records</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* ── Pending routers grid ───────────────────────────────────────── */}
          {!loading && pendingRouters.length > 0 && (
            <Card className="card-bordered mb-4">
              <div className="card-inner">
                <div className="d-flex align-items-center mb-2" style={{ gap: 8 }}>
                  <Badge color="warning" style={{ fontSize: "0.7rem" }}>PENDING</Badge>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#8094ae" }}>
                    Routers not yet used — {pendingRouters.length}
                  </span>
                </div>
                <hr className="mt-1 mb-3" style={{ borderColor: "#e7eaf0" }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {pendingRouters.map(r => (
                    <div key={r.id} style={{
                      border: "2px solid #fde68a", borderRadius: 8,
                      padding: "8px 14px", background: "#fffbeb", minWidth: 140,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#364a63" }}>{r.item_name}</div>
                      {r.serial_number && (
                        <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#8094ae" }}>{r.serial_number}</div>
                      )}
                      <div className="mt-1" style={{ fontSize: "0.7rem", color: "#8094ae" }}>{safeDate(r.created_at)}</div>
                      <div className="mt-1">
                        <Badge color="warning" style={{ fontSize: "0.65rem" }}>Not used yet</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* ── Used routers grid ──────────────────────────────────────────── */}
          {!loading && usedRouters.length > 0 && (
            <Card className="card-bordered mb-4">
              <div className="card-inner">
                <div className="d-flex align-items-center mb-2" style={{ gap: 8 }}>
                  <Badge color="success" style={{ fontSize: "0.7rem" }}>USED</Badge>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#8094ae" }}>
                    Routers used on tickets — {usedRouters.length}
                  </span>
                </div>
                <hr className="mt-1 mb-3" style={{ borderColor: "#e7eaf0" }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {usedRouters.map(r => (
                    <div key={r.id} style={{
                      border: "1px solid #a7f3d0", borderRadius: 8,
                      padding: "8px 14px", background: "#f0fdf4", minWidth: 160, opacity: 0.85,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#364a63" }}>{r.item_name}</div>
                      {r.serial_number && (
                        <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#8094ae" }}>{r.serial_number}</div>
                      )}
                      <div className="mt-1">
                        <Badge color="success" style={{ fontSize: "0.65rem" }}>
                          Ticket #{r.ticket_number}
                        </Badge>
                      </div>
                      {r.used_by_name && (
                        <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: 2 }}>
                          Used by: <strong>{r.used_by_name}</strong>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* ── Other items pending summary ───────────────────────────────── */}
          {!loading && itemSummary.length > 0 && (
            <Card className="card-bordered mb-4">
              <div className="card-inner">
                <div className="d-flex align-items-center mb-2" style={{ gap: 8 }}>
                  <Badge color="primary" style={{ fontSize: "0.7rem" }}>ITEMS</Badge>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#8094ae" }}>
                    Non-router items assigned to you
                  </span>
                </div>
                <hr className="mt-1 mb-3" style={{ borderColor: "#e7eaf0" }} />
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sm mb-0">
                    <thead style={{ background: "#f8f9fa", fontSize: "0.75rem" }}>
                      <tr>
                        <th>Item</th>
                        <th className="text-center">Assigned</th>
                        <th className="text-center">Used on Tickets</th>
                        <th className="text-center">Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemSummary.map((item) => (
                        <tr key={item.roll_number || item.id || item.name}>
                          <td>
                            {item.roll_number ? (
                              <>
                                <strong style={{ fontSize: "0.88rem", fontFamily: "monospace", letterSpacing: "0.5px" }}>
                                  {getPendingCableItemLabel(item)}
                                </strong>
                                {item.cable_type && (
                                  <span className="text-muted ml-1" style={{ fontSize: "0.75rem" }}>
                                    ({item.cable_type})
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <strong style={{ fontSize: "0.88rem" }}>{item.name}</strong>
                                {item.category && (
                                  <span className="text-muted ml-1" style={{ fontSize: "0.75rem" }}>— {item.category}</span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="text-center" style={{ fontWeight: 600 }}>—</td>
                          <td className="text-center"><em style={{ opacity: 0.35 }}>—</em></td>
                          <td className="text-center">
                            <Badge color="success" style={{ fontSize: "0.7rem" }}>
                              {item.rollMeters
                                ? formatDropCableBalance(item.remaining, item.rollMeters)
                                : `×${item.remaining}${item.unit ? ` ${item.unit}` : ""}`}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* ── Tabs + table ──────────────────────────────────────────────── */}
          <Card className="card-bordered">
            <div className="card-inner">
              <div className="d-flex mb-4" style={{ gap: 8, flexWrap: "wrap" }}>
                <TabBtn id="pending" label="Pending" count={myItems.filter(i => i.type !== "router" || !i.ticket_number).length} color="#f59e0b" />
                <TabBtn id="used"    label="Used on Tickets" count={usedRouters.length} color="#10b981" />
                <TabBtn id="all"     label="All History" count={myItems.length} color="#6576ff" />
              </div>

              {loading ? (
                <div className="text-center py-5"><Spinner color="primary" /></div>
              ) : displayItems.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <em className="icon ni ni-package" style={{ fontSize: "2.5rem", display: "block", marginBottom: 12 }} />
                  <p style={{ fontWeight: 600 }}>
                    {activeTab === "pending" ? "No pending items — all routers have been used!" :
                     activeTab === "used"    ? "No routers used on tickets yet" :
                     "No items assigned to you yet"}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-hover mb-0">
                    <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                      <tr>
                        <th>Item</th>
                        <th>Type</th>
                        <th>Serial / Qty</th>
                        <th>Assigned By</th>
                        <th>Date</th>
                        <th>Ticket</th>
                        <th>Used By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map(item => (
                        <tr key={item.id} style={{ opacity: item.ticket_number ? 0.75 : 1 }}>
                          <td>
                            {item.serial_number ? (
                              <>
                                <strong style={{ fontSize: "0.88rem", fontFamily: "monospace", letterSpacing: "0.5px" }}>
                                  {item.serial_number}
                                </strong>
                                {item.item_name && (
                                  <div className="text-muted" style={{ fontSize: "0.72rem" }}>{item.item_name}</div>
                                )}
                              </>
                            ) : (
                              <strong style={{ fontSize: "0.88rem" }}>{item.item_name}</strong>
                            )}
                            {item.item_category && (
                              <div className="text-muted" style={{ fontSize: "0.72rem" }}>{item.item_category}</div>
                            )}
                          </td>
                          <td>
                            <Badge color={item.type === "router" ? "primary" : "info"} style={{ fontSize: "0.7rem" }}>
                              {item.type === "router" ? "Router" : "Item"}
                            </Badge>
                          </td>
                          <td>
                            {item.type === "router" ? (
                              <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#526484" }}>
                                {item.serial_number || "-"}
                              </span>
                            ) : (
                              <span style={{ fontWeight: 600 }}>
                                ×{item.quantity}
                                {item.unit && <span className="text-muted ml-1" style={{ fontSize: "0.75rem" }}>{item.unit}</span>}
                              </span>
                            )}
                          </td>
                          <td className="text-muted" style={{ fontSize: "0.82rem" }}>{item.assigned_by_name || "-"}</td>
                          <td className="text-muted" style={{ fontSize: "0.82rem" }}>{safeDate(item.created_at)}</td>
                          <td>
                            {item.ticket_number ? (
                              <Badge color="success" style={{ fontSize: "0.72rem" }}>#{item.ticket_number}</Badge>
                            ) : (
                              item.type === "router"
                                ? <Badge color="warning" style={{ fontSize: "0.68rem" }}>Pending</Badge>
                                : <em style={{ opacity: 0.3 }}>—</em>
                            )}
                          </td>
                          <td className="text-muted" style={{ fontSize: "0.82rem" }}>
                            {item.used_by_name || <em style={{ opacity: 0.3 }}>—</em>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(MyInventory);
