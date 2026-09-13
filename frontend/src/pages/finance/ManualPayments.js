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
  Button,
  Icon,
} from "../../components/Component";
import { Card, Badge, Alert, Input, Spinner, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { httpNode } from "../../helpers";

const toLocalDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const todayStr = () => toLocalDateStr(new Date());

const METHODS = [
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

const methodColor = (m) => {
  switch (m) {
    case "cheque": return "primary";
    case "bank_transfer": return "info";
    case "cash": return "success";
    case "card": return "warning";
    default: return "secondary";
  }
};

const formatMoney = (n) =>
  "KES " + Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 0 });

const emptyForm = {
  payment_date: todayStr(),
  amount: "",
  payment_method: "cheque",
  reference_number: "",
  payer_name: "",
  description: "",
};

const ManualPayments = () => {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filters
  const now = new Date();
  const [startDate, setStartDate] = useState(
    toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(todayStr());
  const [filterMethod, setFilterMethod] = useState("");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = new, id = editing
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchStats = useCallback(async () => {
    try {
      const res = await httpNode.get("/finance/manual-payments/stats");
      if (res.data.success) setStats(res.data);
    } catch (err) {
      console.error("Stats fetch error:", err);
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (startDate) params.append("start", startDate);
      if (endDate) params.append("end", endDate);
      if (filterMethod) params.append("method", filterMethod);
      params.append("page", page);
      params.append("per_page", 50);

      const res = await httpNode.get(`/finance/manual-payments?${params}`);
      if (res.data.success) {
        setPayments(res.data.payments || []);
        setSummary(res.data.summary || null);
        setPagination(res.data.pagination || { total: 0, pages: 1 });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, filterMethod, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      payment_date: p.payment_date ? p.payment_date.split("T")[0] : "",
      amount: p.amount,
      payment_method: p.payment_method,
      reference_number: p.reference_number || "",
      payer_name: p.payer_name || "",
      description: p.description || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.payment_date || !form.amount || !form.payer_name) {
      setError("Date, amount, and payer name are required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const body = { ...form, recorded_by: "admin" };
      if (editing) {
        await httpNode.put(`/finance/manual-payments/${editing}`, body);
        setSuccess("Payment updated successfully");
      } else {
        await httpNode.post("/finance/manual-payments", body);
        setSuccess("Payment recorded successfully");
      }
      setModalOpen(false);
      fetchPayments();
      fetchStats();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await httpNode.delete(`/finance/manual-payments/${deleteId}`);
      setDeleteId(null);
      setSuccess("Payment deleted");
      fetchPayments();
      fetchStats();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const exportCSV = () => {
    if (!payments.length) return;
    const headers = ["Date", "Amount", "Method", "Reference", "Payer", "Description", "Recorded By", "Created"];
    const rows = payments.map((p) => [
      p.payment_date ? p.payment_date.split("T")[0] : "",
      p.amount,
      p.payment_method,
      p.reference_number || "",
      p.payer_name || "",
      (p.description || "").replace(/"/g, '""'),
      p.recorded_by || "",
      p.created_at || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manual_payments_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = stats
    ? [
        { title: "Today", count: stats.today.count, amount: stats.today.amount, color: "#1ee0ac" },
        { title: "This Month", count: stats.thisMonth.count, amount: stats.thisMonth.amount, color: "#09c2de" },
        { title: "This Year", count: stats.thisYear.count, amount: stats.thisYear.amount, color: "#6576ff" },
        { title: "All Time", count: stats.allTime.count, amount: stats.allTime.amount, color: "#f4bd0e" },
      ]
    : [];

  return (
    <React.Fragment>
      <Head title="Manual Payments" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                Manual Payments
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="primary" onClick={openNew}>
                <Icon name="plus" />
                <span>Add Payment</span>
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        {error && (
          <Alert color="danger" className="alert-icon" close={() => setError(null)}>
            <Icon name="cross-circle" /> {error}
          </Alert>
        )}
        {success && (
          <Alert color="success" className="alert-icon">
            <Icon name="check-circle" /> {success}
          </Alert>
        )}

        {/* Stats Cards */}
        <Block>
          <Row className="g-gs">
            {statCards.map((c, i) => (
              <Col sm="6" lg="3" key={i}>
                <Card className="card-bordered" style={{ borderTop: `3px solid ${c.color}` }}>
                  <div className="card-inner py-3">
                    <div className="text-soft mb-1" style={{ fontSize: 13 }}>{c.title}</div>
                    <h5 className="mb-0">{formatMoney(c.amount)}</h5>
                    <span className="text-soft" style={{ fontSize: 12 }}>{c.count} payment{c.count !== 1 ? "s" : ""}</span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Block>

        {/* Filters */}
        <Block>
          <Card className="card-bordered">
            <div className="card-inner py-3">
              <Row className="g-3 align-items-end">
                <Col md="3">
                  <label className="form-label">From</label>
                  <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
                </Col>
                <Col md="3">
                  <label className="form-label">To</label>
                  <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
                </Col>
                <Col md="3">
                  <label className="form-label">Method</label>
                  <select className="form-select" value={filterMethod} onChange={(e) => { setFilterMethod(e.target.value); setPage(1); }}>
                    <option value="">All Methods</option>
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </Col>
                <Col md="3" className="d-flex gap-2">
                  <Button color="outline-primary" size="sm" onClick={exportCSV} disabled={!payments.length}>
                    <Icon name="download" /> Export
                  </Button>
                </Col>
              </Row>
            </div>
          </Card>
        </Block>

        {/* Summary by Method */}
        {summary && summary.totalAmount > 0 && (
          <Block>
            <Row className="g-gs">
              <Col md="3">
                <Card className="card-bordered text-center py-2">
                  <strong style={{ fontSize: 13 }}>Cheques</strong>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{formatMoney(summary.cheque.amount)}</div>
                  <small className="text-soft">{summary.cheque.count} entries</small>
                </Card>
              </Col>
              <Col md="3">
                <Card className="card-bordered text-center py-2">
                  <strong style={{ fontSize: 13 }}>Bank Transfers</strong>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{formatMoney(summary.bankTransfer.amount)}</div>
                  <small className="text-soft">{summary.bankTransfer.count} entries</small>
                </Card>
              </Col>
              <Col md="3">
                <Card className="card-bordered text-center py-2">
                  <strong style={{ fontSize: 13 }}>Cash</strong>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{formatMoney(summary.cash.amount)}</div>
                  <small className="text-soft">{summary.cash.count} entries</small>
                </Card>
              </Col>
              <Col md="3">
                <Card className="card-bordered text-center py-2">
                  <strong style={{ fontSize: 13 }}>Other</strong>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{formatMoney(summary.other.amount)}</div>
                  <small className="text-soft">{summary.other.count} entries</small>
                </Card>
              </Col>
            </Row>
          </Block>
        )}

        {/* Payments Table */}
        <Block>
          <Card className="card-bordered">
            <div className="card-inner p-0">
              {loading ? (
                <div className="text-center py-5"><Spinner color="primary" /></div>
              ) : payments.length === 0 ? (
                <div className="text-center py-5 text-soft">
                  <Icon name="coins" style={{ fontSize: 40 }} /><br />
                  No manual payments found for this period
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-end">Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Payer</th>
                        <th>Description</th>
                        <th>Recorded By</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{p.payment_date ? p.payment_date.split("T")[0] : ""}</td>
                          <td className="text-end fw-bold">{formatMoney(p.amount)}</td>
                          <td>
                            <Badge color={methodColor(p.payment_method)} pill>
                              {METHODS.find((m) => m.value === p.payment_method)?.label || p.payment_method}
                            </Badge>
                          </td>
                          <td>{p.reference_number || "-"}</td>
                          <td>{p.payer_name}</td>
                          <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.description || "-"}
                          </td>
                          <td>{p.recorded_by}</td>
                          <td className="text-end" style={{ whiteSpace: "nowrap" }}>
                            <Button size="sm" color="outline-primary" className="me-1" onClick={() => openEdit(p)}>
                              <Icon name="edit" />
                            </Button>
                            <Button size="sm" color="outline-danger" onClick={() => setDeleteId(p.id)}>
                              <Icon name="trash" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {summary && (
                      <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                          <td>Total ({summary.count})</td>
                          <td className="text-end">{formatMoney(summary.totalAmount)}</td>
                          <td colSpan={6}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="card-inner border-top d-flex justify-content-between align-items-center">
                <span className="text-soft" style={{ fontSize: 13 }}>
                  Page {page} of {pagination.pages} ({pagination.total} total)
                </span>
                <div>
                  <Button size="sm" color="light" className="me-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                  <Button size="sm" color="light" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </Block>

        {/* Add/Edit Modal */}
        <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} size="lg">
          <ModalHeader toggle={() => setModalOpen(false)}>
            {editing ? "Edit Payment" : "Record New Payment"}
          </ModalHeader>
          <ModalBody>
            <Row className="g-3">
              <Col md="6">
                <label className="form-label">Payment Date *</label>
                <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
              </Col>
              <Col md="6">
                <label className="form-label">Amount (KES) *</label>
                <Input type="number" min="1" step="0.01" placeholder="e.g. 50000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Col>
              <Col md="6">
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Col>
              <Col md="6">
                <label className="form-label">Reference Number</label>
                <Input type="text" placeholder="Cheque #, txn ref, etc." value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
              </Col>
              <Col md="6">
                <label className="form-label">Payer Name *</label>
                <Input type="text" placeholder="Who paid" value={form.payer_name} onChange={(e) => setForm({ ...form, payer_name: e.target.value })} />
              </Col>
              <Col md="6">
                <label className="form-label">Description</label>
                <Input type="text" placeholder="What the payment is for" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Col>
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="light" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button color="primary" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : editing ? "Update" : "Save Payment"}
            </Button>
          </ModalFooter>
        </Modal>

        {/* Delete Confirmation */}
        <Modal isOpen={!!deleteId} toggle={() => setDeleteId(null)} size="sm">
          <ModalBody className="text-center py-4">
            <Icon name="alert-circle" style={{ fontSize: 40, color: "#e85347" }} />
            <h6 className="mt-3">Delete this payment?</h6>
            <p className="text-soft">This action cannot be undone.</p>
            <div className="d-flex justify-content-center gap-2 mt-3">
              <Button color="light" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button color="danger" onClick={handleDelete}>Delete</Button>
            </div>
          </ModalBody>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default ManualPayments;
