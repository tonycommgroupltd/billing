import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Icon,
  Button,
} from "../../components/Component";
import { Card, Badge, Spinner, Input, Collapse } from "reactstrap";
import { Link } from "react-router-dom";
import InventoryAPI from "../../helpers/InventoryAPI";
import { format } from "date-fns";
import "../inventory/CableUsage.css";

function safeDate(str) {
  if (!str) return "—";
  try {
    return format(new Date(str), "dd MMM yyyy, HH:mm");
  } catch {
    return "—";
  }
}

function metersWrittenOff(row) {
  return row.remaining_meters ?? row.quantity_meters ?? null;
}

const DiscardedCable = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await InventoryAPI.listDiscardedCable();
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = async (row) => {
    if (!row?.id || detailCache[row.id]) return;
    setDetailLoading(row.id);
    try {
      const res = await InventoryAPI.listDiscardedCable({ id: row.id });
      if (res?.data && !Array.isArray(res.data)) {
        setDetailCache((prev) => ({ ...prev, [row.id]: res.data }));
      }
    } catch {
      setDetailCache((prev) => ({ ...prev, [row.id]: { ...row, tickets: [] } }));
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleRow = (row) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    loadDetail(row);
  };

  const filtered = search
    ? rows.filter(
        (r) =>
          (r.item_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (r.serial_number || "").toLowerCase().includes(search.toLowerCase()) ||
          (r.assigned_to_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (r.discarded_by_name || "").toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const totalPcs = filtered.reduce((s, r) => s + (parseInt(r.quantity_pcs, 10) || 0), 0);
  const totalRemainingM = filtered.reduce(
    (s, r) => s + (parseInt(metersWrittenOff(r), 10) || 0),
    0
  );
  const totalUsedM = filtered.reduce(
    (s, r) => s + (parseInt(r.meters_used, 10) || 0),
    0
  );

  const renderUsagePanel = (row) => {
    const detail = detailCache[row.id] || row;
    const tickets = detail.tickets || [];
    const remaining = metersWrittenOff(detail);
    const used = parseInt(detail.meters_used, 10) || 0;
    const rollMeters = detail.roll_meters;

    return (
      <div className="px-3 py-3" style={{ background: "#fafbfc", borderTop: "1px solid #e5e9f2" }}>
        {detailLoading === row.id ? (
          <div className="text-center py-3">
            <Spinner size="sm" color="primary" />
          </div>
        ) : (
          <>
            <div className="cable-usage-detail-stats mb-3">
              <div className="cable-usage-stat">
                <span className="label">Unusable pending discarded</span>
                <span className="value" style={{ color: "#e85347" }}>
                  {remaining != null ? `${remaining} m` : `${row.quantity_pcs} pc`}
                </span>
              </div>
              <div className="cable-usage-stat">
                <span className="label">Used on tickets</span>
                <span className="value">{used} m</span>
              </div>
              {rollMeters ? (
                <div className="cable-usage-stat">
                  <span className="label">Roll size</span>
                  <span className="value">{rollMeters} m</span>
                </div>
              ) : null}
            </div>

            <p className="text-muted mb-3" style={{ fontSize: "0.8rem" }}>
              Returned from technician as unusable pending cable — marked discarded and not restocked.
              This is not a faulty item.
            </p>

            {tickets.length === 0 ? (
              <div className="text-muted" style={{ fontSize: "0.82rem" }}>
                No ticket usage was logged for this cable before discard.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0 cable-usage-table">
                  <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                    <tr>
                      <th>Ticket</th>
                      <th>Subject</th>
                      <th className="text-center">Meters</th>
                      <th>Technician</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.disbursement_id || `${t.ticket_id}-${t.used_at}`}>
                        <td>
                          {t.ticket_id ? (
                            <Link
                              to={`/admin/tickets/view/${t.ticket_id}`}
                              className="fw-bold text-primary"
                              style={{ fontSize: "0.82rem" }}
                            >
                              {t.ticket_number || `#${t.ticket_id}`}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ fontSize: "0.82rem", maxWidth: 260 }}>
                          {t.subject || <em className="text-muted">No subject</em>}
                        </td>
                        <td className="text-center">
                          <Badge color="warning" style={{ fontSize: "0.72rem" }}>
                            {t.meters} m
                          </Badge>
                        </td>
                        <td style={{ fontSize: "0.8rem" }}>
                          {t.assigned_to_name || t.assigned_by_name || "—"}
                        </td>
                        <td className="text-muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                          {safeDate(t.used_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f8f9fa", fontWeight: 700 }}>
                      <td colSpan={2}>Total on tickets</td>
                      <td className="text-center">{used} m</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {detail.serial_number && (
              <div className="mt-2">
                <Link
                  to={`/admin/inventory/cable-usage?roll=${encodeURIComponent(detail.serial_number)}`}
                  className="small"
                >
                  Open full roll report →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <React.Fragment>
      <Head title="Discarded Cable" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Discarded Cable</BlockTitle>
              <BlockDes className="text-soft">
                <p>
                  Unusable pending drop cable returned from technicians — written off and not
                  restocked. Click a row to see remaining meters discarded and ticket usage history.
                </p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="d-flex" style={{ gap: 8 }}>
                <Link to="/admin/inventory/assignment-history" className="btn btn-outline-light btn-sm">
                  Assignment history
                </Link>
                <Button size="sm" color="light" onClick={load} disabled={loading}>
                  <Icon name="reload" />
                </Button>
              </div>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <Card className="card-bordered mb-3">
            <div className="card-inner py-3">
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 16 }}>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>
                    Entries
                  </span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{filtered.length}</div>
                </div>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>
                    Pieces discarded
                  </span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{totalPcs}</div>
                </div>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>
                    Unusable pending written off
                  </span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem", color: "#e85347" }}>
                    {totalRemainingM.toLocaleString()} m
                  </div>
                </div>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>
                    Had been used on tickets
                  </span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{totalUsedM.toLocaleString()} m</div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="card-bordered">
            <div className="card-inner">
              <div className="mb-3">
                <Input
                  type="text"
                  placeholder="Search roll, cable, technician, or recorded by…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <em className="icon ni ni-trash" style={{ fontSize: "2rem", display: "block", marginBottom: 8 }} />
                  No discarded cable recorded yet
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sm table-hover mb-0">
                    <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                      <tr>
                        <th style={{ width: 28 }} />
                        <th>Cable / Roll</th>
                        <th className="text-center">Discarded (remaining)</th>
                        <th className="text-center">Used on tickets</th>
                        <th>From technician</th>
                        <th>Recorded by</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        const open = expandedId === r.id;
                        const remaining = metersWrittenOff(r);
                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              onClick={() => toggleRow(r)}
                              style={{ cursor: "pointer" }}
                              className={open ? "table-active" : undefined}
                            >
                              <td className="text-muted" style={{ fontSize: "0.75rem" }}>
                                <em className={`icon ni ni-chevron-${open ? "down" : "right"}`} />
                              </td>
                              <td>
                                {r.serial_number ? (
                                  <strong style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                                    {r.serial_number}
                                  </strong>
                                ) : (
                                  <strong style={{ fontSize: "0.85rem" }}>{r.item_name}</strong>
                                )}
                                {r.serial_number && r.item_name && (
                                  <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                                    {r.item_name}
                                  </div>
                                )}
                              </td>
                              <td className="text-center">
                                <Badge color="danger" style={{ fontSize: "0.7rem" }}>
                                  {remaining != null ? `${remaining} m discarded` : `${r.quantity_pcs} pc`}
                                </Badge>
                              </td>
                              <td className="text-center" style={{ fontSize: "0.82rem" }}>
                                {r.meters_used != null && r.meters_used > 0 ? `${r.meters_used} m` : "—"}
                              </td>
                              <td style={{ fontSize: "0.82rem" }}>{r.assigned_to_name || "—"}</td>
                              <td style={{ fontSize: "0.82rem" }}>{r.discarded_by_name || "—"}</td>
                              <td className="text-muted" style={{ fontSize: "0.78rem" }}>
                                {safeDate(r.created_at)}
                              </td>
                            </tr>
                            <tr>
                              <td colSpan={7} className="p-0 border-0">
                                <Collapse isOpen={open}>{open ? renderUsagePanel(r) : null}</Collapse>
                              </td>
                            </tr>
                          </React.Fragment>
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

export default DiscardedCable;
