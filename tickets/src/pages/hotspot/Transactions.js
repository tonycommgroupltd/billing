import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Card, Badge, Spinner, Table, Button, Input, Collapse,
  Modal, ModalHeader, ModalBody,
} from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Row, Col, Icon } from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";

const statusColors = {
  completed: "success", success: "success",
  pending: "warning", failed: "danger", cancelled: "danger",
};

const HotspotTransactions = () => {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    date_from: "", date_to: "", status: "", package: "", search: "", per_page: "50",
  });
  const [detailModal, setDetailModal] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [packages, setPackages] = useState([]);

  const fetchTransactions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await HotspotAPI.getTransactions(params);
      if (res.success) {
        setData(res.data || []);
        setSummary(res.summary || {});
        setPagination(res.pagination || {});
      }
    } catch (e) {
      console.error("Transactions fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTransactions();
    // Fetch packages for filter
    HotspotAPI.getPackages().then((res) => {
      if (res.success) setPackages(res.data || []);
    }).catch(() => {});
  }, []); // eslint-disable-line

  const applyFilters = () => {
    setFiltersOpen(true);
    fetchTransactions(1);
  };

  const clearFilters = () => {
    setFilters({ date_from: "", date_to: "", status: "", package: "", search: "", per_page: "50" });
    setTimeout(() => fetchTransactions(1), 100);
  };

  const viewDetail = async (id) => {
    setDetailModal(true);
    setDetailLoading(true);
    try {
      const res = await HotspotAPI.getTransactionDetail(id);
      if (res.success) setDetailData(res.data);
    } catch (e) {
      console.error("Detail error:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data.length) return;
    const headers = ["Checkout ID", "Phone", "Package", "Amount", "Status", "Receipt", "Created", "Updated"];
    const rows = data.map((t) => [
      t.checkout_request_id || "", t.phone_number || "", t.package_type || "",
      t.amount || "", t.status || "", t.mpesa_receipt_number || "",
      t.created_at || "", t.updated_at || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = Object.values(filters).some((v) => v && v !== "50");

  return (
    <React.Fragment>
      <Head title="Transactions" />
      <Content>
        <BlockHead size="sm">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <BlockHeadContent>
              <BlockTitle page tag="h4">Transactions</BlockTitle>
            </BlockHeadContent>
            <Button size="sm" color="outline-primary" onClick={() => setFiltersOpen(!filtersOpen)}>
              <Icon name="search" className="me-1" />Search
            </Button>
          </div>
        </BlockHead>

        {/* ══════ FILTER PANEL ══════ */}
        <Collapse isOpen={filtersOpen || hasFilters}>
          <Card className="shadow-sm border-0 mb-4" style={{ borderRadius: 12 }}>
            <div className="card-body">
              <Row className="g-2">
                <Col xs="12" sm="6" md="3">
                  <label className="form-label small">Date From</label>
                  <Input type="date" bsSize="sm" value={filters.date_from}
                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
                </Col>
                <Col xs="12" sm="6" md="3">
                  <label className="form-label small">Date To</label>
                  <Input type="date" bsSize="sm" value={filters.date_to}
                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
                </Col>
                <Col xs="12" sm="6" md="3">
                  <label className="form-label small">Status</label>
                  <Input type="select" bsSize="sm" value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                    <option value="">All</option>
                    <option value="pending">Pending</option>
                    <option value="success">Success</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </Input>
                </Col>
                <Col xs="12" sm="6" md="3">
                  <label className="form-label small">Package</label>
                  <Input type="select" bsSize="sm" value={filters.package}
                    onChange={(e) => setFilters({ ...filters, package: e.target.value })}>
                    <option value="">All</option>
                    {packages.map((p) => (
                      <option key={p.id || p.code} value={p.code || p.name}>{p.name || p.code}</option>
                    ))}
                  </Input>
                </Col>
                <Col xs="12" sm="6" md="3">
                  <label className="form-label small">Phone Number</label>
                  <Input type="text" bsSize="sm" placeholder="07XXXXXXXX" value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
                </Col>
                <Col xs="12" sm="6" md="2">
                  <label className="form-label small">Show</label>
                  <Input type="select" bsSize="sm" value={filters.per_page}
                    onChange={(e) => setFilters({ ...filters, per_page: e.target.value })}>
                    {[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Input>
                </Col>
                <Col xs="12" md="3" className="d-flex align-items-end gap-2">
                  <Button color="primary" size="sm" onClick={applyFilters}>Apply Filters</Button>
                  <Button color="outline-secondary" size="sm" onClick={clearFilters}>Clear</Button>
                </Col>
              </Row>
            </div>
          </Card>
        </Collapse>

        {/* ══════ STATS CARDS (when filters active) ══════ */}
        {hasFilters && (
          <Row className="g-2 g-md-3 mb-3">
            <Col xs="12" sm="6" md="4">
              <Card className="border-0 shadow-sm" style={{ borderRadius: 10 }}>
                <div className="card-body py-3">
                  <h6 className="text-muted small mb-1">Total Transactions</h6>
                  <div className="fw-bold" style={{ fontSize: "1.5rem" }}>{pagination.total || 0}</div>
                  <small className="text-muted">Filtered results</small>
                </div>
              </Card>
            </Col>
            <Col xs="12" sm="6" md="4">
              <Card className="border-0 shadow-sm" style={{ borderRadius: 10 }}>
                <div className="card-body py-3">
                  <h6 className="text-muted small mb-1">Successful Amount</h6>
                  <div className="fw-bold text-success" style={{ fontSize: "1.5rem" }}>
                    KES {Number(summary.total_revenue || 0).toLocaleString()}
                  </div>
                  <small className="text-muted">{summary.successful || 0} successful</small>
                </div>
              </Card>
            </Col>
            <Col xs="12" sm="6" md="4">
              <Card className="border-0 shadow-sm" style={{ borderRadius: 10 }}>
                <div className="card-body py-3">
                  <h6 className="text-muted small mb-1">Average Amount</h6>
                  <div className="fw-bold" style={{ fontSize: "1.5rem" }}>
                    KES {summary.successful > 0 ? Math.round((summary.total_revenue || 0) / summary.successful).toLocaleString() : "0"}
                  </div>
                  <small className="text-muted">Per transaction</small>
                </div>
              </Card>
            </Col>
          </Row>
        )}

        {/* ══════ TRANSACTIONS TABLE ══════ */}
        <Card className="shadow-sm border-0" style={{ borderRadius: 12 }}>
          <div className="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
            <div>
              <span className="fw-bold">Showing {data.length} of {pagination.total || 0} transactions</span>
            </div>
            <Button size="sm" color="outline-success" onClick={exportCSV} disabled={!data.length}>
              <Icon name="download" className="me-1" />Export CSV
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-5"><Spinner color="primary" /></div>
          ) : (
            <div className="card-body p-0">
              {/* Desktop table */}
              <div className="table-responsive d-none d-md-block">
                <Table size="sm" striped hover className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Checkout ID</th><th>Phone</th><th>Package</th>
                      <th>Amount</th><th>Status</th><th>Created</th><th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 ? (
                      <tr><td colSpan="7" className="text-center py-4 text-muted">No transactions found</td></tr>
                    ) : data.map((t, i) => (
                      <tr key={i} style={{ cursor: "pointer" }} onClick={() => viewDetail(t.id)}>
                        <td><small>{t.checkout_request_id || "—"}</small></td>
                        <td>{t.phone_number || "—"}</td>
                        <td>
                          <Badge color="secondary" className="text-uppercase" style={{ fontSize: "0.7rem" }}>
                            {t.package_type || "—"}
                          </Badge>
                        </td>
                        <td className="fw-bold">KES {Number(t.amount || 0).toLocaleString()}</td>
                        <td>
                          <Badge color={statusColors[t.status] || "secondary"}>
                            {t.status || "—"}
                          </Badge>
                        </td>
                        <td><small>{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</small></td>
                        <td><small>{t.updated_at ? new Date(t.updated_at).toLocaleString() : "—"}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              {/* Mobile card view */}
              <div className="d-md-none p-3">
                {data.map((t, i) => (
                  <Card key={i} className="border-0 shadow-sm mb-2" style={{ borderRadius: 8, cursor: "pointer" }}
                    onClick={() => viewDetail(t.id)}>
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <Badge color={statusColors[t.status] || "secondary"}>{t.status}</Badge>
                        <span className="fw-bold">KES {Number(t.amount || 0).toLocaleString()}</span>
                      </div>
                      <Row className="g-2">
                        {[
                          ["Phone", t.phone_number],
                          ["Package", t.package_type],
                          ["Created", t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"],
                          ["Receipt", t.mpesa_receipt_number || "—"],
                        ].map(([label, val], j) => (
                          <Col xs="6" key={j}>
                            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#6c757d" }}>{label}</div>
                            <div style={{ fontSize: "0.85rem" }}>{val || "—"}</div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="card-footer bg-white border-0 d-flex justify-content-center gap-2 py-3">
              <Button size="sm" color="outline-primary" disabled={pagination.page <= 1}
                onClick={() => fetchTransactions(pagination.page - 1)}>
                <Icon name="chevron-left" />
              </Button>
              <span className="align-self-center small">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <Button size="sm" color="outline-primary" disabled={pagination.page >= pagination.total_pages}
                onClick={() => fetchTransactions(pagination.page + 1)}>
                <Icon name="chevron-right" />
              </Button>
            </div>
          )}
        </Card>

        {/* ══════ DETAIL MODAL ══════ */}
        <Modal isOpen={detailModal} toggle={() => setDetailModal(false)} size="lg">
          <ModalHeader toggle={() => setDetailModal(false)}>Transaction Detail</ModalHeader>
          <ModalBody>
            {detailLoading ? (
              <div className="text-center py-4"><Spinner color="primary" /></div>
            ) : detailData ? (
              <>
                <Card className="border mb-3" style={{ borderRadius: 8 }}>
                  <div className="card-body">
                    <h6>Transaction</h6>
                    <Row className="g-2">
                      {[
                        ["Phone", detailData.transaction?.phone_number],
                        ["Amount", `KES ${Number(detailData.transaction?.amount || 0).toLocaleString()}`],
                        ["Package", detailData.transaction?.package_type],
                        ["Status", detailData.transaction?.status],
                        ["Receipt", detailData.transaction?.mpesa_receipt_number],
                        ["Checkout ID", detailData.transaction?.checkout_request_id],
                        ["MAC", detailData.transaction?.mac_address],
                        ["Username", detailData.transaction?.username],
                        ["User Created", detailData.transaction?.user_created === "1" ? "Yes" : "No"],
                        ["Result", detailData.transaction?.result_desc],
                        ["Created", detailData.transaction?.created_at],
                        ["Updated", detailData.transaction?.updated_at],
                      ].map(([label, val], i) => (
                        <Col xs="6" md="4" key={i}>
                          <div className="text-muted small text-uppercase">{label}</div>
                          <div>{val || "—"}</div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </Card>

                {detailData.user && (
                  <Card className="border mb-3" style={{ borderRadius: 8 }}>
                    <div className="card-body">
                      <h6>Related User</h6>
                      <Row className="g-2">
                        {[
                          ["Username", detailData.user.username],
                          ["Phone", detailData.user.phone_number],
                          ["Package", detailData.user.package_type],
                          ["Expires", detailData.user.expires_at],
                        ].map(([label, val], i) => (
                          <Col xs="6" key={i}>
                            <div className="text-muted small text-uppercase">{label}</div>
                            <div>{val || "—"}</div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  </Card>
                )}

                {detailData.sessions && detailData.sessions.length > 0 && (
                  <Card className="border" style={{ borderRadius: 8 }}>
                    <div className="card-body">
                      <h6>RADIUS Sessions</h6>
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0">
                          <thead className="table-light">
                            <tr><th>Start</th><th>Stop</th><th>Duration</th><th>Download</th><th>Upload</th></tr>
                          </thead>
                          <tbody>
                            {detailData.sessions.map((s, i) => (
                              <tr key={i}>
                                <td><small>{s.acctstarttime || "—"}</small></td>
                                <td><small>{s.acctstoptime || <Badge color="success">Online</Badge>}</small></td>
                                <td>{s.acctsessiontime ? `${Math.floor(s.acctsessiontime / 60)}m` : "—"}</td>
                                <td className="text-success">{formatBytes(s.acctinputoctets || 0)}</td>
                                <td className="text-primary">{formatBytes(s.acctoutputoctets || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <p className="text-muted text-center">No data</p>
            )}
          </ModalBody>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, Math.min(i, 4))).toFixed(1) + " " + units[Math.min(i, 4)];
};

export default HotspotTransactions;
