import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { Card, Badge, Spinner, Input } from "reactstrap";
import { Link, useLocation } from "react-router-dom";
import InventoryAPI from "../../helpers/InventoryAPI";
import { normalizeCableRollInput } from "../../utils/inventoryCable";
import { format } from "date-fns";
import "./CableUsage.css";

function safeDate(str) {
  if (!str) return "—";
  try {
    return format(new Date(str), "dd MMM yyyy, HH:mm");
  } catch {
    return "—";
  }
}

const STATUS_COLORS = {
  active: "success",
  disbursed: "info",
  faulty: "danger",
  inactive: "secondary",
  unknown: "light",
};

const CableUsage = () => {
  const location = useLocation();
  const [rolls, setRolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRoll, setSelectedRoll] = useState(null);

  useEffect(() => {
    const roll = new URLSearchParams(location.search).get("roll");
    if (roll) setSearch(normalizeCableRollInput(roll));
  }, [location.search]);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const params = {};
      if (query.trim()) params.search = query.trim();
      const res = await InventoryAPI.getCableRollUsage(params);
      const data = Array.isArray(res?.data) ? res.data : [];
      setRolls(data);
      setSelectedRoll((prev) => {
        if (!prev) return data[0] || null;
        return data.find((r) => r.roll_number === prev.roll_number) || data[0] || null;
      });
    } catch {
      setRolls([]);
      setSelectedRoll(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rolls;
    const q = search.trim().toLowerCase();
    return rolls.filter(
      (r) =>
        (r.roll_number || "").toLowerCase().includes(q) ||
        (r.assigned_to_name || "").toLowerCase().includes(q) ||
        (r.cable_type || "").toLowerCase().includes(q) ||
        (r.tickets || []).some(
          (t) =>
            (t.subject || "").toLowerCase().includes(q) ||
            (t.ticket_number || "").toLowerCase().includes(q)
        )
    );
  }, [rolls, search]);

  useEffect(() => {
    if (!selectedRoll && filtered.length > 0) {
      setSelectedRoll(filtered[0]);
      return;
    }
    if (selectedRoll && !filtered.find((r) => r.roll_number === selectedRoll.roll_number)) {
      setSelectedRoll(filtered[0] || null);
    }
  }, [filtered, selectedRoll]);

  const totals = useMemo(
    () => ({
      rolls: filtered.length,
      metersUsed: filtered.reduce((s, r) => s + (parseInt(r.meters_used, 10) || 0), 0),
      tickets: filtered.reduce((s, r) => s + (parseInt(r.ticket_count, 10) || 0), 0),
    }),
    [filtered]
  );

  const selectRoll = (roll) => {
    setSelectedRoll(roll);
  };

  const jumpToRoll = () => {
    const normalized = normalizeCableRollInput(search);
    if (!normalized) return;
    const hit = rolls.find((r) => r.roll_number.toUpperCase() === normalized);
    if (hit) {
      setSelectedRoll(hit);
      setSearch(normalized);
    } else {
      load(normalized);
    }
  };

  return (
    <React.Fragment>
      <Head title="Cable Roll Usage" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Cable Roll Usage</BlockTitle>
              <BlockDes className="text-soft">
                <p>
                  Track numbered drop cable rolls (T400, T401…) — see every ticket where cable was
                  logged and how many meters were used.
                </p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="d-flex" style={{ gap: 8 }}>
                <Link to="/admin/inventory/list?category=Drop Cable" className="btn btn-outline-light btn-sm">
                  Inventory list
                </Link>
                <Button size="sm" color="light" onClick={() => load(search)} disabled={loading}>
                  <Icon name="reload" />
                </Button>
              </div>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <Card className="card-bordered mb-3">
            <div className="card-inner py-3">
              <div className="d-flex flex-wrap align-items-end" style={{ gap: 16 }}>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>Rolls</span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{totals.rolls}</div>
                </div>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>Meters on tickets</span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{totals.metersUsed} m</div>
                </div>
                <div>
                  <span className="text-soft" style={{ fontSize: "0.75rem" }}>Ticket entries</span>
                  <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{totals.tickets}</div>
                </div>
                <div className="ml-auto cable-usage-search" style={{ minWidth: 260 }}>
                  <Input
                    placeholder="Search roll, technician, ticket…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && jumpToRoll()}
                  />
                </div>
              </div>
            </div>
          </Card>

          <div className="cable-usage-layout">
            <Card className="card-bordered cable-usage-rolls">
              <div className="card-inner p-0">
                <div className="cable-usage-rolls-head px-3 py-2 border-bottom">
                  <strong style={{ fontSize: "0.82rem" }}>All rolls</strong>
                </div>
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-5 text-muted">No cable rolls found</div>
                ) : (
                  <div className="cable-usage-roll-list">
                    {filtered.map((roll) => {
                      const active = selectedRoll?.roll_number === roll.roll_number;
                      return (
                        <button
                          key={roll.roll_number}
                          type="button"
                          className={`cable-usage-roll-item${active ? " cable-usage-roll-item--active" : ""}`}
                          onClick={() => selectRoll(roll)}
                        >
                          <div className="cable-usage-roll-item-top">
                            <span className="cable-usage-roll-no">{roll.roll_number}</span>
                            <Badge color={STATUS_COLORS[roll.status] || "light"} style={{ fontSize: "0.65rem" }}>
                              {roll.status || "—"}
                            </Badge>
                          </div>
                          <div className="cable-usage-roll-item-meta">
                            {roll.meters_used} m used · {roll.meters_pending} m left
                          </div>
                          <div className="cable-usage-roll-item-meta text-muted">
                            {roll.ticket_count} ticket{roll.ticket_count !== 1 ? "s" : ""}
                            {roll.assigned_to_name ? ` · ${roll.assigned_to_name}` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            <Card className="card-bordered cable-usage-detail">
              <div className="card-inner">
                {!selectedRoll ? (
                  <div className="text-center py-5 text-muted">Select a roll to view ticket usage</div>
                ) : (
                  <>
                    <div className="cable-usage-detail-head mb-3">
                      <div>
                        <h5 className="mb-1" style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>
                          {selectedRoll.roll_number}
                        </h5>
                        <div className="text-muted" style={{ fontSize: "0.82rem" }}>
                          {selectedRoll.cable_type} · {selectedRoll.roll_meters} m roll
                          {selectedRoll.assigned_to_name && (
                            <span> · with {selectedRoll.assigned_to_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="cable-usage-detail-stats">
                        <div className="cable-usage-stat">
                          <span className="label">Used</span>
                          <span className="value">{selectedRoll.meters_used} m</span>
                        </div>
                        <div className="cable-usage-stat">
                          <span className="label">Pending</span>
                          <span className="value">{selectedRoll.meters_pending} m</span>
                        </div>
                        <div className="cable-usage-stat">
                          <span className="label">Tickets</span>
                          <span className="value">{selectedRoll.ticket_count}</span>
                        </div>
                      </div>
                    </div>

                    {(selectedRoll.tickets || []).length === 0 ? (
                      <div className="text-center py-4 text-muted">
                        <em className="icon ni ni-ticket-alt d-block mb-2" style={{ fontSize: "1.8rem", opacity: 0.35 }} />
                        No ticket usage logged for this roll yet
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
                            {(selectedRoll.tickets || []).map((t) => (
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
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td style={{ fontSize: "0.82rem", maxWidth: 280 }}>
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
                              <td className="text-center">{selectedRoll.meters_used} m</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default CableUsage;
