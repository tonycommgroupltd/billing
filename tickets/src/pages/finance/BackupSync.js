import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Row,
  Col,
  Button,
  Icon,
} from "../../components/Component";
import { Alert, Badge, Card, Input, Spinner, Table } from "reactstrap";
import { httpNode } from "../../helpers";
import KraAPI from "../../helpers/KraAPI";

const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-KE");
};

const fmtCurrency = (value) => {
  const n = Number(value || 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const kraStatusBadge = (status) => {
  const s = String(status || "none").toLowerCase();
  if (s === "sent") return <Badge color="success">eTIMS invoiced</Badge>;
  if (s === "failed") return <Badge color="danger">Invoice failed</Badge>;
  if (s === "pending") return <Badge color="warning">Pending</Badge>;
  if (s === "not_synced") return <Badge color="secondary">Not in Tonycomm DB</Badge>;
  return <Badge color="light">No invoice yet</Badge>;
};

const BackupSync = () => {
  const [config, setConfig] = useState({
    mode: "selective",
    customerIds: [],
    customers: [],
    summary: {
      selectedCustomers: 0,
      customersWithPlans: 0,
      customersWithoutPlans: 0,
      totalMonthlyAmount: 0,
    },
  });
  const [status, setStatus] = useState({ running: false });
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [trackResult, setTrackResult] = useState(null);
  const [kraPinDraft, setKraPinDraft] = useState({});
  const [monthlyLimitInput, setMonthlyLimitInput] = useState(
    () => window.localStorage.getItem("backup_sync_monthly_limit") || ""
  );
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const showMessage = (setFn, message) => {
    setFn(message);
    setTimeout(() => setFn(null), 4000);
  };

  const loadConfig = useCallback(async () => {
    const res = await httpNode.get("/backup-sync/config");
    setConfig(
      res.data || {
        mode: "selective",
        customerIds: [],
        customers: [],
        summary: {
          selectedCustomers: 0,
          customersWithPlans: 0,
          customersWithoutPlans: 0,
          totalMonthlyAmount: 0,
        },
      }
    );
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await httpNode.get("/backup-sync/sync/status");
    setStatus(res.data || { running: false });
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await httpNode.get("/backup-sync/logs?lines=120");
    setLogs((res.data && res.data.logs) || "");
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadConfig(), loadStatus(), loadLogs()]);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load backup sync data");
    } finally {
      setLoading(false);
    }
  }, [loadConfig, loadStatus, loadLogs]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        await Promise.all([loadStatus(), loadLogs()]);
      } catch (_) {
        // keep quiet during polling
      }
    }, 5000);
    return () => clearInterval(id);
  }, [loadStatus, loadLogs]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    try {
      setSearching(true);
      setError(null);
      setTrackResult(null);
      const data = await KraAPI.trackCustomer(q);
      setTrackResult(data);
      const drafts = {};
      (data.customers || []).forEach((c) => {
        drafts[c.id] = c.kra_pin || "";
      });
      setKraPinDraft(drafts);
      if (!data.found) {
        setError("No customer found in Splynx for that phone or ID.");
      }
    } catch (e) {
      setError(e.response?.data?.error || "Customer search failed");
      setTrackResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleAddCustomer = async (customerId) => {
    const id = String(customerId).trim();
    if (!/^\d+$/.test(id)) {
      setError("Customer ID must be numeric");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await httpNode.post("/backup-sync/customers", { customerId: id });
      await Promise.all([loadConfig(), loadStatus()]);
      showMessage(setSuccess, `Customer ${id} added to Tonycomm DB + KRA billing list`);
      if (searchQuery.trim()) {
        const data = await KraAPI.trackCustomer(searchQuery.trim());
        setTrackResult(data);
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to add customer");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveKraPin = async (customerId) => {
    const pin = (kraPinDraft[customerId] || "").trim().toUpperCase();
    try {
      setBusy(true);
      setError(null);
      await KraAPI.setCustomerKraPin(customerId, pin);
      showMessage(setSuccess, pin ? `KRA PIN saved for customer ${customerId}` : `Customer ${customerId} set as walk-in`);
      if (searchQuery.trim()) {
        const data = await KraAPI.trackCustomer(searchQuery.trim());
        setTrackResult(data);
        const drafts = {};
        (data.customers || []).forEach((c) => {
          drafts[c.id] = c.kra_pin || "";
        });
        setKraPinDraft(drafts);
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to save KRA PIN");
    } finally {
      setBusy(false);
    }
  };

  const handleInvoicePayment = async (paymentId) => {
    if (!paymentId) return;
    try {
      setBusy(true);
      setError(null);
      const res = await KraAPI.invoicePayment(paymentId);
      if (res.success) {
        showMessage(setSuccess, res.traderInvoiceNo ? `Invoice ${res.traderInvoiceNo} created` : "Payment invoiced");
      } else {
        setError(res.error || "Invoice failed");
      }
      if (searchQuery.trim()) {
        const data = await KraAPI.trackCustomer(searchQuery.trim());
        setTrackResult(data);
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveCustomer = async (id) => {
    try {
      setBusy(true);
      setError(null);
      await httpNode.delete(`/backup-sync/customers/${id}`);
      await loadConfig();
      showMessage(setSuccess, `Customer ${id} removed from selective sync`);
      if (searchQuery.trim()) {
        const data = await KraAPI.trackCustomer(searchQuery.trim());
        setTrackResult(data);
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to remove customer");
    } finally {
      setBusy(false);
    }
  };

  const handleRunSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      await httpNode.post("/backup-sync/sync/now", {});
      await loadStatus();
      showMessage(setSuccess, "Sync started successfully");
    } catch (e) {
      setError(e.response?.data?.error || "Failed to start sync");
    } finally {
      setSyncing(false);
    }
  };

  const customerRows = useMemo(() => config.customers || [], [config.customers]);
  const summary = useMemo(
    () =>
      config.summary || {
        selectedCustomers: customerRows.length,
        customersWithPlans: customerRows.filter((c) => Number(c.monthly_amount || 0) > 0).length,
        customersWithoutPlans: customerRows.filter((c) => Number(c.monthly_amount || 0) <= 0).length,
        totalMonthlyAmount: customerRows.reduce((sum, c) => sum + Number(c.monthly_amount || 0), 0),
      },
    [config.summary, customerRows]
  );

  const monthlyLimit = Number(monthlyLimitInput || 0);
  const hasMonthlyLimit = Number.isFinite(monthlyLimit) && monthlyLimit > 0;
  const limitRemaining = hasMonthlyLimit ? monthlyLimit - Number(summary.totalMonthlyAmount || 0) : null;

  const handleLimitChange = (e) => {
    const raw = e.target.value;
    if (!/^\d*(\.\d{0,2})?$/.test(raw)) return;
    setMonthlyLimitInput(raw);
    window.localStorage.setItem("backup_sync_monthly_limit", raw);
  };

  const trackedCustomers = trackResult?.customers || [];

  return (
    <React.Fragment>
      <Head title="Tonycomm DB" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>Tonycomm DB</BlockTitle>
            <p className="text-soft mb-0">
              Search Splynx customers by phone or ID, add them to Tonycomm DB, and track payments with eTIMS invoice status.
            </p>
          </BlockHeadContent>
        </BlockHead>

        {error && <Alert color="danger">{error}</Alert>}
        {success && <Alert color="success">{success}</Alert>}

        <Row className="g-gs">
          <Col lg="12">
            <Card className="card-bordered">
              <div className="card-inner">
                <h6 className="title mb-3">
                  <Icon name="search" className="me-1" /> Customer Search (Splynx)
                </h6>
                <div className="d-flex gap-2 mb-3">
                  <Input
                    type="text"
                    placeholder="Phone (0712345678) or customer ID (7774)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button color="primary" onClick={handleSearch} disabled={searching}>
                    {searching ? <Spinner size="sm" className="me-1" /> : <Icon name="search" className="me-1" />}
                    Search
                  </Button>
                </div>

                {searching && (
                  <div className="text-center py-3"><Spinner color="primary" /></div>
                )}

                {!searching && trackedCustomers.length > 0 && trackedCustomers.map((c) => (
                  <div key={c.id} className="border rounded p-3 mb-3">
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                      <div>
                        <h6 className="mb-1">{c.name || "Unknown"}</h6>
                        <div className="text-soft">
                          ID <strong>{c.id}</strong>
                          {c.phone && <> · {c.phone}</>}
                          {c.city && <> · {c.city}</>}
                        </div>
                        {Array.isArray(c.active_plans) && c.active_plans.length > 0 && (
                          <div className="mt-1">
                            <small className="text-soft">Plan: {c.active_plans.join(", ")} · {fmtCurrency(c.monthly_amount)}</small>
                          </div>
                        )}
                      </div>
                      <div className="d-flex flex-wrap gap-1">
                        {c.in_backup_sync_list ? (
                          <Badge color="success">On Tonycomm DB list</Badge>
                        ) : (
                          <Badge color="warning">Not on list yet</Badge>
                        )}
                        {c.in_tonycomm_db ? (
                          <Badge color="info">Synced to Tonycomm</Badge>
                        ) : (
                          <Badge color="secondary">Not synced yet</Badge>
                        )}
                        {c.kra_pin ? (
                          <Badge color="primary">KRA PIN</Badge>
                        ) : (
                          <Badge color="light">Walk-in</Badge>
                        )}
                      </div>
                    </div>

                    <Row className="g-2 mb-3">
                      <Col md="4">
                        <small className="text-soft d-block">Total paid (shown)</small>
                        <strong>{fmtCurrency(c.summary?.total_paid)}</strong>
                      </Col>
                      <Col md="4">
                        <small className="text-soft d-block">eTIMS invoiced</small>
                        <strong>{c.summary?.kra_invoiced ?? 0}</strong>
                      </Col>
                      <Col md="4">
                        <small className="text-soft d-block">Awaiting invoice</small>
                        <strong>{c.summary?.kra_pending ?? 0}</strong>
                      </Col>
                    </Row>

                    <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
                      <div style={{ minWidth: 220 }}>
                        <label className="form-label small mb-1">KRA PIN (leave empty for walk-in)</label>
                        <Input
                          type="text"
                          placeholder="P051885316K"
                          value={kraPinDraft[c.id] ?? ""}
                          onChange={(e) => setKraPinDraft((prev) => ({ ...prev, [c.id]: e.target.value.toUpperCase() }))}
                        />
                      </div>
                      <Button size="sm" color="outline-primary" disabled={busy} onClick={() => handleSaveKraPin(c.id)}>
                        Save PIN
                      </Button>
                      {!c.in_backup_sync_list && (
                        <Button size="sm" color="primary" disabled={busy} onClick={() => handleAddCustomer(c.id)}>
                          {busy ? <Spinner size="sm" /> : "Add to Tonycomm DB"}
                        </Button>
                      )}
                      {c.in_backup_sync_list && (
                        <Button size="sm" color="danger" outline disabled={busy} onClick={() => handleRemoveCustomer(c.id)}>
                          Remove from list
                        </Button>
                      )}
                    </div>

                    <h6 className="title mb-2">Payment history</h6>
                    {(!c.payments || c.payments.length === 0) ? (
                      <div className="text-soft">No payments found.</div>
                    ) : (
                      <div className="table-responsive">
                        <Table className="table-sm">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Amount</th>
                              <th>Trans ID</th>
                              <th>Source</th>
                              <th>eTIMS</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.payments.map((p, idx) => (
                              <tr key={`${p.tonycomm_payment_id || p.splynx_payment_id || idx}`}>
                                <td>{fmtDateTime(p.date)}</td>
                                <td>{fmtCurrency(p.amount)}</td>
                                <td><code>{p.trans_id || "-"}</code></td>
                                <td>
                                  <Badge color={p.source === "tonycomm" ? "info" : "secondary"}>
                                    {p.source === "tonycomm" ? "Tonycomm" : "Splynx only"}
                                  </Badge>
                                </td>
                                <td>
                                  {kraStatusBadge(p.kra_status)}
                                  {p.trader_invoice_no && (
                                    <div className="mt-1">
                                      <Link to={`/admin/finance/kra-invoices/${encodeURIComponent(p.trader_invoice_no)}`}>
                                        {p.trader_invoice_no}
                                      </Link>
                                    </div>
                                  )}
                                  {p.kra_error && <small className="text-danger d-block">{p.kra_error}</small>}
                                </td>
                                <td>
                                  {p.tonycomm_payment_id && c.kra_eligible && p.kra_status !== "sent" && (
                                    <Button
                                      size="sm"
                                      color="outline-success"
                                      disabled={busy}
                                      onClick={() => handleInvoicePayment(p.tonycomm_payment_id)}
                                    >
                                      Invoice
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </Col>

          <Col lg="4">
            <Card className="card-bordered h-100">
              <div className="card-inner">
                <h6 className="title mb-1">Total Monthly Amount</h6>
                <div className="h4 mb-1">{fmtCurrency(summary.totalMonthlyAmount || 0)}</div>
                <small className="text-soft">Estimated from active services/plans for selected customers.</small>
              </div>
            </Card>
          </Col>

          <Col lg="4">
            <Card className="card-bordered h-100">
              <div className="card-inner">
                <h6 className="title mb-1">Customers With Monthly Plan</h6>
                <div className="h4 mb-1">{summary.customersWithPlans || 0}</div>
                <small className="text-soft">{summary.customersWithoutPlans || 0} without active priced plans.</small>
              </div>
            </Card>
          </Col>

          <Col lg="4">
            <Card className="card-bordered h-100">
              <div className="card-inner">
                <h6 className="title mb-2">KRA Monthly Limit</h6>
                <Input
                  type="text"
                  placeholder="Set monthly cap (KES)"
                  value={monthlyLimitInput}
                  onChange={handleLimitChange}
                  className="mb-2"
                />
                {hasMonthlyLimit ? (
                  <small className={limitRemaining < 0 ? "text-danger" : "text-soft"}>
                    Remaining: {fmtCurrency(limitRemaining)}
                  </small>
                ) : (
                  <small className="text-soft">Set a cap to track how much room is left.</small>
                )}
              </div>
            </Card>
          </Col>

          <Col lg="12">
            <Card className="card-bordered">
              <div className="card-inner">
                <h6 className="title mb-3">
                  <Icon name="setting" className="me-1" /> Sync Control
                </h6>

                <div className="mb-2">
                  Mode: <Badge color="info">{config.mode || "selective"}</Badge>
                </div>
                <div className="mb-2">
                  Status:{" "}
                  {status.running ? <Badge color="warning">Running</Badge> : <Badge color="success">Idle</Badge>}
                </div>
                <div className="mb-2">Last started: {fmtDateTime(status.lastRunStartedAt)}</div>
                <div className="mb-2">Last finished: {fmtDateTime(status.lastRunFinishedAt)}</div>
                <div className="mb-3">Last exit code: {status.lastExitCode ?? "-"}</div>

                <div className="d-flex gap-2">
                  <Button color="primary" disabled={syncing || status.running} onClick={handleRunSync}>
                    {syncing ? <Spinner size="sm" className="me-1" /> : <Icon name="play" className="me-1" />}
                    Run Sync Now
                  </Button>
                  <Button color="light" outline onClick={loadAll} disabled={loading}>
                    <Icon name="reload" className="me-1" /> Refresh
                  </Button>
                </div>
              </div>
            </Card>
          </Col>

          <Col lg="12">
            <Card className="card-bordered">
              <div className="card-inner">
                <h6 className="title mb-3">
                  <Icon name="users" className="me-1" /> Selected Customers ({customerRows.length})
                </h6>

                {loading ? (
                  <div className="text-center py-3"><Spinner color="primary" /></div>
                ) : customerRows.length === 0 ? (
                  <div className="text-soft">No customers selected yet. Search above and add customers from Splynx.</div>
                ) : (
                  <div className="table-responsive">
                    <Table className="table-sm">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>Active Plan(s)</th>
                          <th>Monthly Amount</th>
                          <th style={{ width: 160 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerRows.map((c) => (
                          <tr key={String(c.id)}>
                            <td>{c.id}</td>
                            <td>{c.name || "-"}</td>
                            <td>{c.phone_number || "-"}</td>
                            <td>
                              {Array.isArray(c.active_plans) && c.active_plans.length > 0
                                ? c.active_plans.join(", ")
                                : "-"}
                            </td>
                            <td>{fmtCurrency(c.monthly_amount || 0)}</td>
                            <td>
                              <Button
                                size="sm"
                                color="light"
                                outline
                                className="me-1"
                                onClick={() => {
                                  setSearchQuery(String(c.id));
                                  setTrackResult(null);
                                  KraAPI.trackCustomer(String(c.id)).then((data) => {
                                    setTrackResult(data);
                                    const drafts = {};
                                    (data.customers || []).forEach((row) => {
                                      drafts[row.id] = row.kra_pin || "";
                                    });
                                    setKraPinDraft(drafts);
                                  }).catch(() => {});
                                }}
                              >
                                Track
                              </Button>
                              <Button size="sm" color="danger" outline onClick={() => handleRemoveCustomer(c.id)} disabled={busy}>
                                <Icon name="trash" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            </Card>
          </Col>

          <Col lg="12">
            <Card className="card-bordered">
              <div className="card-inner">
                <h6 className="title mb-3">
                  <Icon name="file-text" className="me-1" /> Sync Logs (auto refresh every 5s)
                </h6>
                <pre
                  style={{
                    background: "#0f172a",
                    color: "#e2e8f0",
                    padding: 12,
                    borderRadius: 8,
                    maxHeight: 360,
                    overflow: "auto",
                    fontSize: 12,
                    marginBottom: 0,
                  }}
                >
{logs || "No logs yet."}
                </pre>
              </div>
            </Card>
          </Col>
        </Row>
      </Content>
    </React.Fragment>
  );
};

export default BackupSync;
