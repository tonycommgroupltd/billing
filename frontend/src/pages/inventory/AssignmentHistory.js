import React, { useState, useEffect, useCallback, useMemo } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Icon,
  Button,
} from "../../components/Component";
import { Card, Badge, Spinner, Input } from "reactstrap";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import InventoryAPI from "../../helpers/InventoryAPI";
import { formatDisbursementQty, getCableRollNumberFromRow } from "../../utils/inventoryCable";
import {
  buildByUserSummary,
  canReturnToWarehouse,
  formatPendingCableMeters,
  getHistoryRowStatus,
  getPendingCableInfo,
  getReturnableQuantity,
  hasTicketLink,
  isDropCableRow,
  isPendingHistoryRow,
  pendingItemBalanceLabel,
  rollTicketUsageMeters,
} from "../../utils/disbursementHistory";
import { format } from "date-fns";
import "./AssignmentHistory.css";

function safeDate(str) {
  if (!str) return "-";
  try {
    return format(new Date(str), "dd MMM yyyy, HH:mm");
  } catch {
    return "-";
  }
}

const STATUS_LABELS = {
  pending: "Pending",
  partial: "Partially used",
  used: "On ticket",
  closed: "Closed",
};

const AssignmentHistory = ({ user }) => {
  const isAdmin = user?.all_roles?.some((r) =>
    ["super-administrator", "administrator", "manager"].includes(r)
  );

  const [history, setHistory] = useState([]);
  const [pendingBalances, setPendingBalances] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const [historyView, setHistoryView] = useState("pending");
  const [deletingId, setDeletingId] = useState(null);
  const [returningId, setReturningId] = useState(null);
  const [itemError, setItemError] = useState("");
  const [itemSuccess, setItemSuccess] = useState("");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setItemError("");
    try {
      const [histRes, balRes] = await Promise.all([
        InventoryAPI.listDisbursements(),
        InventoryAPI.listPendingBalances(),
      ]);
      setHistory(Array.isArray(histRes?.data) ? histRes.data : []);
      setPendingBalances(Array.isArray(balRes?.data) ? balRes.data : []);
    } catch {
      setHistory([]);
      setPendingBalances([]);
      setItemError("Failed to load assignment history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredBySearch = useMemo(() => {
    if (!historyFilter.trim()) return history;
    const q = historyFilter.trim().toLowerCase();
    return history.filter(
      (h) =>
        (h.assigned_to_name || "").toLowerCase().includes(q) ||
        (h.item_name || "").toLowerCase().includes(q) ||
        (h.serial_number || "").toLowerCase().includes(q)
    );
  }, [history, historyFilter]);

  const pendingSummary = useMemo(
    () => buildByUserSummary(filteredBySearch, pendingBalances),
    [filteredBySearch, pendingBalances]
  );

  const usedRows = useMemo(
    () =>
      [...filteredBySearch]
        .filter((h) => hasTicketLink(h))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [filteredBySearch]
  );

  const allRows = useMemo(
    () =>
      [...filteredBySearch].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ),
    [filteredBySearch]
  );

  const pendingCount = history.filter((h) =>
    isPendingHistoryRow(h, history, pendingBalances)
  ).length;
  const usedCount = history.filter((h) => hasTicketLink(h)).length;

  const handleDeleteHistory = async (disbId) => {
    if (
      !window.confirm(
        "Remove this assignment and restore stock (if applicable)?"
      )
    ) {
      return;
    }
    setDeletingId(disbId);
    setItemError("");
    setItemSuccess("");
    try {
      const res = await InventoryAPI.deleteDisbursement(
        disbId,
        user?.id ?? null,
        user?.name || user?.username || null
      );
      const left = res?.data?.remaining_meters;
      setItemSuccess(
        left != null
          ? `Assignment removed — ${left} m remaining on roll for next assignee`
          : "Assignment removed"
      );
      loadHistory();
    } catch (err) {
      setItemError(
        err?.response?.data?.error || "Failed to undo assignment"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleReturnOrDiscard = async (row, disposition) => {
    if (!row || row.type === "router" || hasTicketLink(row)) return;

    const maxQty = getReturnableQuantity(row, history, pendingBalances);
    if (maxQty <= 0) {
      setItemError("Nothing left to return or discard on this assignment.");
      return;
    }

    const isDiscard = disposition === "discard";
    const isCable = isDropCableRow(row);
    const unitLabel = isCable ? "piece(s) / roll(s)" : "units";
    const label = row.serial_number
      ? `${row.serial_number} (${row.item_name || "item"})`
      : row.item_name;

    if (!isDiscard && !canReturnToWarehouse(row, history, pendingBalances)) {
      setItemError("This item cannot be returned right now.");
      return;
    }

    const pendingInfo = isCable ? getPendingCableInfo(row, history, pendingBalances) : null;
    const usedM = isCable ? rollTicketUsageMeters(row, history, pendingBalances) : 0;
    const rollNo = getCableRollNumberFromRow(row);

    const raw = window.prompt(
      isDiscard
        ? `${label}\n\nUsed on tickets: ${usedM} m` +
          (pendingInfo ? `\nUnusable pending to discard: ${pendingInfo.meters} m` : "") +
          `\n\nDiscard quantity (max ${maxQty} ${unitLabel}) — not restocked, not faulty:`
        : rollNo
          ? `${label}\n\nUsed on tickets: ${usedM} m` +
            (pendingInfo ? `\nRemaining on roll: ${pendingInfo.meters} m` : "") +
            `\n\nReturn this roll to warehouse? Leftover meters stay on the roll for the next assignee.\nQuantity (max ${maxQty}):`
          : `Return quantity for ${label} (max ${maxQty} ${unitLabel}):`,
      String(maxQty)
    );
    if (raw == null) return;
    const qty = parseInt(raw, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setItemError("Enter a valid quantity greater than zero.");
      return;
    }
    if (qty > maxQty) {
      setItemError(`Cannot process ${qty}. Available to process is ${maxQty}.`);
      return;
    }

    let notes = "";
    if (isDiscard) {
      notes =
        window.prompt(
          "Reason (optional):",
          "Unusable pending cable — returned and discarded, not restocked"
        ) || "Unusable pending cable discarded";
    }

    setReturningId(row.id);
    setItemError("");
    setItemSuccess("");
    try {
      const res = await InventoryAPI.returnDisbursement(
        row.id,
        qty,
        user?.id ?? null,
        user?.name || user?.username || null,
        notes,
        disposition
      );
      const meters = res?.data?.meters_discarded ?? res?.data?.remaining_meters;
      const usedOnTickets = res?.data?.meters_used;
      const meterPart = meters != null
        ? ` — ${meters} m ${isDiscard ? "unusable pending written off" : "remaining on roll"}`
        : "";
      const usedPart =
        usedOnTickets != null && usedOnTickets > 0
          ? ` (${usedOnTickets} m had been used on tickets)`
          : "";
      setItemSuccess(
        isDiscard
          ? `Discarded unusable pending cable from ${row.assigned_to_name || "technician"}${meterPart}${usedPart}`
          : `Returned ${qty} × ${row.item_name || "item"} to warehouse${meterPart}`
      );
      loadHistory();
    } catch (err) {
      setItemError(
        err?.response?.data?.error ||
          `Failed to ${isDiscard ? "discard" : "return"} item`
      );
    } finally {
      setReturningId(null);
    }
  };

  const renderStatusBadge = (row) => {
    const status = getHistoryRowStatus(row, history, pendingBalances);
    return (
      <span className={`assignment-history-status assignment-history-status--${status}`}>
        {STATUS_LABELS[status] || status}
      </span>
    );
  };

  const renderItemActions = (row, options = {}) => {
    if (!isAdmin || !row) return null;
    const { compact = false } = options;
    const pending = isPendingHistoryRow(row, history, pendingBalances);
    const canReturn =
      pending && row.type !== "router" && canReturnToWarehouse(row, history, pendingBalances);
    const canDiscard =
      pending && row.type !== "router" && isDropCableRow(row);
    const canDelete =
      row.type === "router" || (!hasTicketLink(row) && pending);

    if (!canReturn && !canDiscard && !canDelete) return null;

    return (
      <div className="assignment-history-item-actions">
        {canReturn && (
          <Button
            size="sm"
            color="light"
            title="Return to warehouse"
            disabled={returningId === row.id}
            onClick={() => handleReturnOrDiscard(row, "return")}
          >
            {returningId === row.id ? (
              <Spinner size="sm" />
            ) : (
              <>
                <em className="icon ni ni-back-ios" />
                {!compact && <span className="ml-1">Return</span>}
              </>
            )}
          </Button>
        )}
        {canDiscard && (
          <Button
            size="sm"
            color="light"
            title="Discard unusable pending cable (returned, not restocked — not faulty)"
            disabled={returningId === row.id}
            onClick={() => handleReturnOrDiscard(row, "discard")}
          >
            <em className="icon ni ni-trash" />
            {!compact && <span className="ml-1">Discard</span>}
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            color="light"
            title="Undo assignment"
            disabled={deletingId === row.id}
            onClick={() => handleDeleteHistory(row.id)}
          >
            {deletingId === row.id ? (
              <Spinner size="sm" />
            ) : (
              <>
                <em className="icon ni ni-undo" />
                {!compact && <span className="ml-1">Undo</span>}
              </>
            )}
          </Button>
        )}
      </div>
    );
  };

  const renderPendingView = () => {
    if (pendingSummary.length === 0) {
      return (
        <div className="text-center py-5 text-muted">
          <em
            className="icon ni ni-package"
            style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}
          />
          No pending assignments
        </div>
      );
    }

    return (
      <div className="assignment-history-pending-grid">
        {pendingSummary.map((group) => (
          <div key={group.id || group.name} className="assignment-history-user-card">
            <div className="assignment-history-user-head">
              <span className="assignment-history-user-name">{group.name}</span>
              <Badge color="light" style={{ fontSize: "0.72rem" }}>
                {group.pendingRouters.length + group.pendingItems.length} pending
              </Badge>
            </div>
            <div className="assignment-history-item-list">
              {group.pendingRouters.map((r) => (
                <div key={`router-${r.id}`} className="assignment-history-item-row">
                  <div className="assignment-history-item-main">
                    <div className="assignment-history-item-title">
                      {r.serial_number ? (
                        <span style={{ fontFamily: "monospace" }}>
                          {r.serial_number}
                        </span>
                      ) : (
                        r.item_name
                      )}
                    </div>
                    <div className="assignment-history-item-sub">
                      Router · {safeDate(r.created_at)}
                    </div>
                  </div>
                  <span className="assignment-history-status assignment-history-status--pending">
                    Pending
                  </span>
                  {renderItemActions(r, { compact: true })}
                </div>
              ))}

              {group.pendingItems.map((item) => {
                const row = item.issuanceRow;
                if (!row) return null;
                const isCable = item.rollMeters != null;
                const cableLabel = isCable
                  ? formatPendingCableMeters(
                      item.remaining,
                      item.rollMeters,
                      item.roll_number
                    )
                  : null;
                const status = item.hasTicketUsage ? "partial" : "pending";
                return (
                  <div
                    key={`item-${group.name}-${item.itemKey}`}
                    className="assignment-history-item-row"
                  >
                    <div className="assignment-history-item-main">
                      <div className="assignment-history-item-title">
                        {item.roll_number ? (
                          <>
                            <span style={{ fontFamily: "monospace" }}>
                              {item.roll_number}
                            </span>
                            {item.cable_type && (
                              <span className="text-muted ml-1">
                                ({item.cable_type})
                              </span>
                            )}
                          </>
                        ) : isCable ? (
                          item.cable_type || item.name || "Drop cable"
                        ) : (
                          item.name
                        )}
                      </div>
                      <div className="assignment-history-item-sub">
                        {isCable ? "Drop cable" : item.category || "Item"}
                        {item.hasTicketUsage
                          ? ` · ${rollTicketUsageMeters(row, history, pendingBalances)} m used on tickets`
                          : ""}
                        {!isCable && pendingItemBalanceLabel(row, history, pendingBalances)
                          ? ` · ${pendingItemBalanceLabel(row, history, pendingBalances)}`
                          : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                      }}
                    >
                      {cableLabel ? (
                        <span className="assignment-history-cable-meters">
                          <em className="icon ni ni-network" />
                          {cableLabel}
                        </span>
                      ) : (
                        <span
                          className={`assignment-history-status assignment-history-status--${status}`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      )}
                      {cableLabel && (
                        <span
                          className={`assignment-history-status assignment-history-status--${status}`}
                          style={{ fontSize: "0.65rem", padding: "2px 8px" }}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      )}
                      {renderItemActions(row, { compact: true })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTable = (rows) => {
    if (rows.length === 0) {
      return (
        <div className="text-center py-5 text-muted">
          <em
            className="icon ni ni-archive"
            style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}
          />
          No records in this view
        </div>
      );
    }

    return (
      <div className="assignment-history-table-wrap">
        <table className="table table-sm table-hover mb-0 assignment-history-table">
          <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
            <tr>
              <th>Person</th>
              <th>Item</th>
              <th>Status</th>
              <th className="text-center">Balance / Qty</th>
              <th>Ticket</th>
              <th>Date</th>
              {isAdmin && <th className="text-center">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const balance = pendingItemBalanceLabel(h, history, pendingBalances);
              const cableInfo = getPendingCableInfo(h, history, pendingBalances);
              return (
                <tr key={h.id}>
                  <td>
                    <strong style={{ fontSize: "0.82rem" }}>
                      {h.assigned_to_name || "-"}
                    </strong>
                  </td>
                  <td>
                    <div style={{ fontSize: "0.82rem" }}>
                      {h.serial_number ? (
                        <>
                          <strong style={{ fontFamily: "monospace" }}>
                            {h.serial_number}
                          </strong>
                          {h.item_name && (
                            <span
                              className="text-muted ml-1"
                              style={{ fontSize: "0.72rem" }}
                            >
                              ({h.item_name})
                            </span>
                          )}
                        </>
                      ) : (
                        <strong>{h.item_name}</strong>
                      )}
                      {h.item_category && (
                        <div
                          className="text-muted"
                          style={{ fontSize: "0.72rem" }}
                        >
                          {h.item_category}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>{renderStatusBadge(h)}</td>
                  <td className="text-center" style={{ fontSize: "0.78rem" }}>
                    {h.type === "router" ? (
                      <Badge color="primary" style={{ fontSize: "0.7rem" }}>
                        Router
                      </Badge>
                    ) : cableInfo ? (
                      <>
                        <span className="assignment-history-cable-meters assignment-history-cable-meters--table">
                          {cableInfo.label}
                        </span>
                        {rollTicketUsageMeters(h, history, pendingBalances) > 0 && (
                          <div
                            className="text-muted"
                            style={{ fontSize: "0.65rem", marginTop: 4 }}
                          >
                            {rollTicketUsageMeters(h, history, pendingBalances)} m on tickets
                          </div>
                        )}
                      </>
                    ) : hasTicketLink(h) && isDropCableRow(h) ? (
                      <Badge color="success" style={{ fontSize: "0.7rem" }}>
                        {formatDisbursementQty(h)}
                      </Badge>
                    ) : (
                      <>
                        {formatDisbursementQty(h)}
                        {balance && (
                          <div
                            style={{
                              fontSize: "0.65rem",
                              marginTop: 2,
                              color: "#1d4ed8",
                              fontWeight: 600,
                            }}
                          >
                            {balance}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {hasTicketLink(h) ? (
                      <Badge color="success" style={{ fontSize: "0.7rem" }}>
                        #{h.ticket_number || h.ticket_id || h.linked_ticket_id}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-muted" style={{ fontSize: "0.78rem" }}>
                    {safeDate(h.created_at)}
                  </td>
                  {isAdmin && (
                    <td className="text-center">
                      {renderItemActions(h, { compact: true })}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <React.Fragment>
      <Head title="Assignment History" />
      <Content>
        <div className="assignment-history-page">
          <BlockHead size="sm">
            <div className="nk-block-between flex-wrap" style={{ gap: 12 }}>
              <BlockHeadContent>
                <BlockTitle page>Assignment History</BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent>
                <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                  {isAdmin && (
                    <Link
                      to="/admin/inventory/disbursed"
                      className="btn btn-primary btn-sm"
                    >
                      <em className="icon ni ni-send mr-1" />
                      New disbursement
                    </Link>
                  )}
                  <Button
                    size="sm"
                    color="light"
                    onClick={loadHistory}
                    disabled={historyLoading}
                  >
                    <Icon name="reload" />
                  </Button>
                </div>
              </BlockHeadContent>
            </div>
          </BlockHead>

          <Block>
            {(itemError || itemSuccess) && (
              <div
                className={`alert py-2 mb-3 alert-${itemError ? "danger" : "success"}`}
                style={{ fontSize: "0.85rem" }}
              >
                {itemError || itemSuccess}
              </div>
            )}

            <Card className="card-bordered">
              <div className="card-inner">
                <div className="assignment-history-tabs">
                  {[
                    {
                      id: "pending",
                      label: `Pending (${pendingCount})`,
                      color: "#f59e0b",
                    },
                    {
                      id: "used",
                      label: `On tickets (${usedCount})`,
                      color: "#10b981",
                    },
                    {
                      id: "all",
                      label: `All records (${history.length})`,
                      color: "#6576ff",
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className="assignment-history-tab"
                      onClick={() => {
                        setHistoryView(tab.id);
                        setItemError("");
                        setItemSuccess("");
                      }}
                      style={{
                        background:
                          historyView === tab.id ? tab.color : "#f5f6fa",
                        color: historyView === tab.id ? "#fff" : "#526484",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <Input
                  type="search"
                  placeholder="Search person, item, or roll number…"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="mb-3"
                  style={{ fontSize: 16 }}
                />

                {historyView === "pending" && (
                  <p className="assignment-history-hint">
                    Grouped by person — only assignments with stock still
                    outstanding. Partially used cable rolls keep remaining
                    meters when returned; the next assignee only gets what is left.
                    Use <strong>Discard</strong> only for unusable leftover cable.
                  </p>
                )}

                {historyLoading ? (
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                  </div>
                ) : historyView === "pending" ? (
                  renderPendingView()
                ) : historyView === "used" ? (
                  renderTable(usedRows)
                ) : (
                  renderTable(allRows)
                )}
              </div>
            </Card>
          </Block>
        </div>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(AssignmentHistory);
