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
import { Card, Badge, Spinner, Input } from "reactstrap";
import { connect } from "react-redux";
import InventoryAPI from "../../helpers/InventoryAPI";
import { format } from "date-fns";

function safeDate(str) {
  if (!str) return "-";
  try { return format(new Date(str), "dd MMM yyyy, HH:mm"); } catch { return "-"; }
}

// Map action string → human label + color
const ACTION_META = {
  router_added:      { label: "Router Added",      color: "primary",  icon: "plus-circle"  },
  item_added:        { label: "Item Added",         color: "primary",  icon: "plus-circle"  },
  router_deleted:    { label: "Router Deleted",     color: "danger",   icon: "trash"        },
  item_deleted:      { label: "Item Deleted",       color: "danger",   icon: "trash"        },
  router_issued:     { label: "Router Issued",      color: "warning",  icon: "send"         },
  router_used:       { label: "Used on Ticket",     color: "success",  icon: "check-circle" },
  item_issued:       { label: "Item Issued",        color: "info",     icon: "package-fill" },
  item_used:         { label: "Item Used",          color: "teal",     icon: "check-circle" },
  router_unassigned: { label: "Router Removed",     color: "orange",   icon: "undo"         },
  item_unassigned:   { label: "Item Removed",       color: "orange",   icon: "undo"         },
  item_returned:     { label: "Item Returned",      color: "warning",  icon: "undo"         },
  cable_discarded:   { label: "Pending Cable Discarded", color: "danger",   icon: "trash"        },
  item_stock_adjusted:{ label: "Stock Adjusted",    color: "info",     icon: "plus"         },
};

function getActionMeta(log) {
  if (log.action && ACTION_META[log.action]) return ACTION_META[log.action];
  // Fallback: derive from older shape (disbursements before action field)
  if (log.type === "router") {
    return log.ticket_number
      ? ACTION_META.router_used
      : ACTION_META.router_issued;
  }
  return log.ticket_number ? ACTION_META.item_used : ACTION_META.item_issued;
}

const FILTER_GROUPS = [
  { key: "all",            label: "All"           },
  { key: "added",          label: "Added"         },
  { key: "deleted",        label: "Deleted"       },
  { key: "removed",        label: "Removed"       },
  { key: "router_issued",  label: "Routers Issued"},
  { key: "router_used",    label: "Routers Used"  },
  { key: "item_issued",    label: "Items Issued"  },
  { key: "item_used",      label: "Items Used"    },
  { key: "discarded",      label: "Discarded"     },
];

function matchesGroup(log, key) {
  const a = log.action || "";
  if (key === "all")           return true;
  if (key === "added")         return a === "router_added"      || a === "item_added";
  if (key === "deleted")       return a === "router_deleted"    || a === "item_deleted";
  if (key === "removed")       return a === "router_unassigned" || a === "item_unassigned" || a === "item_returned";
  if (key === "item_issued")   return a === "item_issued" || a === "item_stock_adjusted";
  if (key === "router_issued") return a === "router_issued";
  if (key === "router_used")   return a === "router_used";
  if (key === "item_used")     return a === "item_used";
  if (key === "discarded")     return a === "cable_discarded";
  return true;
}

const ItemLogs = ({ user }) => {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await InventoryAPI.getItemLogs();
      setLogs(Array.isArray(res?.data) ? res.data : []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Error loading inventory logs:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Apply group filter
  const byGroup = logs.filter(l => matchesGroup(l, groupFilter));

  // Apply search
  const filtered = search.trim()
    ? byGroup.filter(l =>
        (l.item_name        || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.item_category    || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.assigned_to_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.assigned_by_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.actor_name       || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.serial_number    || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.ticket_number    || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.ticket_subject   || "").toLowerCase().includes(search.toLowerCase())
      )
    : byGroup;

  // Counts for filter tabs
  const counts = {};
  FILTER_GROUPS.forEach(f => { counts[f.key] = logs.filter(l => matchesGroup(l, f.key)).length; });

  const addedCount   = counts.added   || 0;
  const deletedCount = counts.deleted || 0;
  const removedCount = counts.removed || 0;
  const issuedCount  = (counts.router_issued || 0) + (counts.item_issued || 0);
  const usedCount    = (counts.router_used   || 0) + (counts.item_used   || 0);
  const uniqueUsers  = [...new Set(
    logs.map(l => l.assigned_to_name || l.actor_name).filter(Boolean)
  )].length;

  return (
    <React.Fragment>
      <Head title="Inventory Logs" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Inventory Activity Logs</BlockTitle>
              <BlockDes className="text-soft">
                <p>
                  Full audit trail — items added, deleted, issued &amp; used
                  {lastRefresh && (
                    <span className="ml-2 text-muted" style={{ fontSize: "0.75rem" }}>
                      · updated {format(lastRefresh, "HH:mm:ss")}
                    </span>
                  )}
                </p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="light" size="sm" onClick={loadLogs} disabled={loading}>
                <Icon name="reload" /><span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          {/* Summary cards */}
          <Row className="g-3 mb-4">
            {[
              { icon: "list",           bg: "#e9ecff", ico: "text-primary",  val: counts.all || 0,  lbl: "Total Events"    },
              { icon: "plus-circle",    bg: "#d1fae5", ico: "text-success",  val: addedCount,        lbl: "Items Added"     },
              { icon: "trash",          bg: "#fee2e2", ico: "text-danger",   val: deletedCount,      lbl: "Items Deleted"   },
              { icon: "undo",           bg: "#fff3cd", ico: "text-warning",  val: removedCount,      lbl: "Removed/Undone"  },
              { icon: "send",           bg: "#fef9c3", ico: "text-warning",  val: issuedCount,       lbl: "Issued"          },
              { icon: "check-circle",   bg: "#d1fae5", ico: "text-success",  val: usedCount,         lbl: "Used on Tickets" },
              { icon: "users",          bg: "#ede9fe", ico: "text-purple",   val: uniqueUsers,       lbl: "People Involved" },
            ].map((c, i) => (
              <Col key={i} sm="6" md="4" lg="3" xl="auto" style={{ flex: "1 1 140px", maxWidth: 200 }}>
                <Card className="card-bordered h-100">
                  <div className="card-inner py-3">
                    <div className="d-flex align-items-center" style={{ gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <em className={`icon ni ni-${c.icon} ${c.ico}`} style={{ fontSize: "1.2rem" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1, color: "#364a63" }}>
                          {loading ? <Spinner size="sm" /> : c.val}
                        </div>
                        <div className="text-muted" style={{ fontSize: "0.72rem" }}>{c.lbl}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Card className="card-bordered">
            <div className="card-inner">

              {/* Filter tabs */}
              <div className="d-flex mb-3" style={{ gap: 6, flexWrap: "wrap" }}>
                {FILTER_GROUPS.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setGroupFilter(f.key)}
                    style={{
                      padding: "5px 13px", border: "none", borderRadius: 6,
                      cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                      background: groupFilter === f.key ? "#6576ff" : "#f5f6fa",
                      color:      groupFilter === f.key ? "#fff"    : "#526484",
                      transition: "background 0.15s",
                    }}
                  >
                    {f.label}
                    <span style={{
                      marginLeft: 6,
                      background: groupFilter === f.key ? "rgba(255,255,255,0.25)" : "#e5e9f2",
                      color:      groupFilter === f.key ? "#fff" : "#8094ae",
                      borderRadius: 20, padding: "0 6px", fontSize: "0.72rem", fontWeight: 700,
                    }}>
                      {counts[f.key] ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div className="d-flex align-items-center mb-3" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", position: "relative" }}>
                  <em className="icon ni ni-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8094ae" }} />
                  <Input
                    type="text"
                    placeholder="Search item, serial, person, ticket # or subject…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </div>
                {search && (
                  <button onClick={() => setSearch("")} style={{
                    background: "none", border: "1px solid #e5e9f2", borderRadius: 6,
                    padding: "6px 12px", cursor: "pointer", fontSize: "0.8rem", color: "#8094ae",
                  }}>
                    ✕ Clear
                  </button>
                )}
                <span className="text-muted small ml-auto">
                  {filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}
                </span>
              </div>

              {/* Table */}
              {loading ? (
                <div className="text-center py-5"><Spinner color="primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <em className="icon ni ni-list" style={{ fontSize: "2.5rem", display: "block", marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ fontWeight: 600 }}>
                    {search ? "No logs match your search" : "No inventory activity yet"}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-hover mb-0">
                    <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                      <tr>
                        <th>Action</th>
                        <th>Item / Router</th>
                        <th className="text-center">Qty / Type</th>
                        <th>Person</th>
                        <th>By / Added By</th>
                        <th>Ticket #</th>
                        <th>Ticket Subject</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((l, idx) => {
                        const meta = getActionMeta(l);
                        const isAdd      = l.action === "router_added"      || l.action === "item_added";
                        const isDel      = l.action === "router_deleted"    || l.action === "item_deleted";
                        const isReturned = l.action === "item_returned";
                        const isRemoved  = l.action === "router_unassigned" || l.action === "item_unassigned" || isReturned;
                        const isActivity = isAdd || isDel || isRemoved;
                        const isDisb     = !isActivity;

                        // For item returns we encode "Returned by <name>" in notes.
                        // Show that assignee in Person, and the actor/admin in By.
                        const returnedFromMatch = (l.notes || "").match(/Returned by\s+(.+?)(?:\s+—|$)/i);
                        const returnedFromName = returnedFromMatch?.[1]?.trim() || null;

                        // "Person" column:
                        // - item_returned: person returned-from
                        // - disbursements: assigned_to_name
                        // - other activity logs: actor_name
                        const person = isReturned
                          ? (returnedFromName || l.assigned_to_name || "—")
                          : (isDisb ? (l.assigned_to_name || "—") : (l.actor_name || "—"));

                        // "By / Added By" column:
                        // - disbursements: assigned_by_name
                        // - activity logs (adds/deletes/removes/returns): actor_name
                        const byPerson = isDisb
                          ? (l.assigned_by_name || "—")
                          : (l.actor_name || "—");

                        // Notes shown as tooltip/sub for removed rows
                        const rowNote  = isRemoved ? (l.notes || "") : "";

                        return (
                          <tr key={l.id || idx} style={{ opacity: (isDel || isRemoved) ? 0.65 : 1 }}>
                            <td>
                              <Badge color={meta.color} style={{ fontSize: "0.7rem" }}>
                                <em className={`icon ni ni-${meta.icon} mr-1`} style={{ fontSize: "0.75rem" }} />
                                {meta.label}
                              </Badge>
                            </td>
                            <td>
                              <strong style={{ fontSize: "0.88rem" }}>{l.item_name || "—"}</strong>
                              {l.item_category && (
                                <div className="text-muted" style={{ fontSize: "0.72rem" }}>{l.item_category}</div>
                              )}
                              {l.serial_number && (
                                <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#8094ae" }}>{l.serial_number}</div>
                              )}
                            </td>
                            <td className="text-center">
                              {(l.type === "router" || l.action === "router_added" || l.action === "router_deleted" || l.action === "router_issued" || l.action === "router_used") ? (
                                <Badge color="primary" style={{ fontSize: "0.7rem" }}>Router</Badge>
                              ) : (
                                <span style={{
                                  background: "#fef3c7", color: "#92400e",
                                  borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: "0.8rem",
                                }}>
                                  ×{l.quantity || 1}
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: "0.85rem" }}>
                              {person}
                              {rowNote && (
                                <div className="text-muted" style={{ fontSize: "0.7rem" }}>{rowNote}</div>
                              )}
                            </td>
                            <td style={{ fontSize: "0.82rem" }} className="text-muted">
                              {byPerson}
                            </td>
                            <td>
                              {l.ticket_number ? (
                                <Badge color="success" style={{ fontSize: "0.72rem" }}>
                                  #{l.ticket_number}
                                </Badge>
                              ) : (
                                <em className="text-muted" style={{ opacity: 0.4 }}>—</em>
                              )}
                            </td>
                            <td style={{ fontSize: "0.82rem", maxWidth: 200 }}>
                              {l.ticket_subject ? (
                                <span
                                  style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}
                                  title={l.ticket_subject}
                                >
                                  {l.ticket_subject}
                                </span>
                              ) : (
                                <em className="text-muted" style={{ opacity: 0.4 }}>—</em>
                              )}
                            </td>
                            <td className="text-muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                              {safeDate(l.created_at)}
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
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(ItemLogs);
