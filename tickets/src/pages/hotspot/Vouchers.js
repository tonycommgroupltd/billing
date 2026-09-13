import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Card, Badge, Spinner, Table, Button, Input,
  Modal, ModalHeader, ModalBody, ModalFooter,
} from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Row, Col, Icon } from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";

const statusBadge = (status, expires) => {
  if (status === "expired" || (expires && new Date(expires) < new Date())) {
    return <Badge color="danger">⏰ Expired</Badge>;
  }
  if (status === "used") return <Badge color="success">✓ Used</Badge>;
  if (status === "partially_used") return <Badge color="warning" className="text-dark">⚡ Partially Used</Badge>;
  return <Badge color="secondary">🎫 Unused</Badge>;
};

const HotspotVouchers = () => {
  const [vouchers, setVouchers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);

  // Single voucher form
  const [form, setForm] = useState({ code: "", package_id: "", phone_number: "" });
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState(null);

  // Bulk generate modal
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({ package_id: "", quantity: 10, phone_number: "" });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, sRes, pRes] = await Promise.all([
        HotspotAPI.getVouchers({ status: statusFilter, search }),
        HotspotAPI.getVoucherStats(),
        HotspotAPI.getPackages(),
      ]);
      if (vRes.success) setVouchers(vRes.data || []);
      if (sRes.success) setStats(sRes.data || {});
      if (pRes.success) setPackages(pRes.data || []);
    } catch (e) {
      console.error("Voucher fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createVoucher = async () => {
    if (!form.package_id) { setFormMsg({ type: "danger", text: "Select a package" }); return; }
    setCreating(true);
    setFormMsg(null);
    try {
      const res = await HotspotAPI.createVoucher(form);
      if (res.success) {
        setFormMsg({ type: "success", text: `Voucher created: ${res.data?.code || "OK"}` });
        setForm({ code: "", package_id: "", phone_number: "" });
        fetchData();
      } else {
        setFormMsg({ type: "danger", text: res.message || "Failed" });
      }
    } catch (e) {
      setFormMsg({ type: "danger", text: "Error creating voucher" });
    } finally {
      setCreating(false);
    }
  };

  const bulkGenerate = async () => {
    if (!bulkForm.package_id) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await HotspotAPI.createVoucher({
        package_id: bulkForm.package_id,
        quantity: bulkForm.quantity,
        phone_number: bulkForm.phone_number,
        bulk: true,
      });
      if (res.success) {
        setBulkResult({ type: "success", text: `${res.data?.created || bulkForm.quantity} vouchers generated!` });
        fetchData();
      } else {
        setBulkResult({ type: "danger", text: res.message || "Failed" });
      }
    } catch (e) {
      setBulkResult({ type: "danger", text: "Error generating vouchers" });
    } finally {
      setBulkLoading(false);
    }
  };

  const resetVoucher = async (id) => {
    if (!window.confirm("Reset this voucher to unused?")) return;
    try {
      const res = await HotspotAPI.updateVoucher(id, { status: "unused" });
      if (res.success) fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <React.Fragment>
      <Head title="Vouchers" />
      <Content>
        <BlockHead size="sm">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <BlockHeadContent>
              <BlockTitle page tag="h4">Voucher Management</BlockTitle>
            </BlockHeadContent>
            <Button size="sm" color="primary" onClick={() => { setBulkModal(true); setBulkResult(null); }}>
              <Icon name="plus" className="me-1" />Bulk Generate
            </Button>
          </div>
        </BlockHead>

        {/* ══════ STATS CARDS ══════ */}
        <Row className="g-2 g-md-3 mb-4">
          {[
            { label: "Total Vouchers", val: stats.total || 0, icon: "🎫", color: "#6c757d" },
            { label: "Unused", val: stats.unused || 0, icon: "📋", color: "#6c757d" },
            { label: "Used", val: stats.used || 0, icon: "✓", color: "#198754" },
            { label: "Expired", val: stats.expired || 0, icon: "⏰", color: "#dc3545" },
          ].map((s, i) => (
            <Col xs="6" lg="3" key={i}>
              <Card className="border-0 shadow-sm" style={{ borderRadius: 10 }}>
                <div className="card-body py-3 text-center">
                  <div style={{ fontSize: "1.5rem" }}>{s.icon}</div>
                  <div className="fw-bold" style={{ fontSize: "1.5rem", color: s.color }}>{s.val}</div>
                  <small className="text-muted">{s.label}</small>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Row className="g-3">
          {/* ══════ LEFT: CREATE VOUCHER ══════ */}
          <Col xs="12" lg="4">
            <Card className="border-0 shadow-sm" style={{ borderRadius: 12 }}>
              <div className="card-header bg-white border-0 py-3">
                <h6 className="mb-0 fw-bold">🎫 Create Voucher</h6>
              </div>
              <div className="card-body pt-0">
                {formMsg && (
                  <div className={`alert alert-${formMsg.type} py-2 small`}>{formMsg.text}</div>
                )}
                <div className="mb-3">
                  <label className="form-label small">Package <span className="text-danger">*</span></label>
                  <Input type="select" bsSize="sm" value={form.package_id}
                    onChange={(e) => setForm({ ...form, package_id: e.target.value })}>
                    <option value="">Select package...</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — KES {Number(p.price || 0).toLocaleString()}</option>
                    ))}
                  </Input>
                </div>
                <div className="mb-3">
                  <label className="form-label small">Code (optional)</label>
                  <Input type="text" bsSize="sm" placeholder="Auto-generated if blank" value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label small">Phone (optional)</label>
                  <Input type="text" bsSize="sm" placeholder="07XXXXXXXX" value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
                </div>
                <Button color="primary" size="sm" className="w-100" onClick={createVoucher} disabled={creating}>
                  {creating ? <Spinner size="sm" /> : <><Icon name="plus" className="me-1" />Create Voucher</>}
                </Button>
              </div>
            </Card>
          </Col>

          {/* ══════ RIGHT: VOUCHER INVENTORY ══════ */}
          <Col xs="12" lg="8">
            <Card className="border-0 shadow-sm" style={{ borderRadius: 12 }}>
              <div className="card-header bg-white border-0 py-3">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <h6 className="mb-0 fw-bold">📋 Voucher Inventory</h6>
                  <div className="d-flex gap-2">
                    <Input type="select" bsSize="sm" style={{ width: 130 }} value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="">All Status</option>
                      <option value="unused">Unused</option>
                      <option value="used">Used</option>
                      <option value="partially_used">Partially Used</option>
                      <option value="expired">Expired</option>
                    </Input>
                    <Input type="text" bsSize="sm" placeholder="Search code..." style={{ width: 140 }}
                      value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-5"><Spinner color="primary" /></div>
              ) : (
                <div className="card-body p-0">
                  {/* Desktop */}
                  <div className="table-responsive d-none d-md-block">
                    <Table size="sm" striped hover className="mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Code</th><th>Package</th><th>Phone</th>
                          <th>Status</th><th>Created</th><th>Expires</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vouchers.length === 0 ? (
                          <tr><td colSpan="7" className="text-center py-4 text-muted">No vouchers found</td></tr>
                        ) : vouchers.map((v, i) => (
                          <tr key={i}>
                            <td><code className="bg-light px-2 py-1 rounded">{v.code}</code></td>
                            <td>
                              <Badge color="secondary" className="text-uppercase" style={{ fontSize: "0.7rem" }}>
                                {v.package_name || v.package_type || "—"}
                              </Badge>
                            </td>
                            <td>{v.phone_number || "—"}</td>
                            <td>{statusBadge(v.status, v.expires_at)}</td>
                            <td><small>{v.created_at ? new Date(v.created_at).toLocaleDateString() : "—"}</small></td>
                            <td><small>{v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"}</small></td>
                            <td>
                              {(v.status === "used" || v.status === "expired") && (
                                <Button size="sm" color="outline-warning" className="py-0 px-2"
                                  onClick={() => resetVoucher(v.id)} title="Reset">
                                  <Icon name="reload" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  {/* Mobile */}
                  <div className="d-md-none p-3">
                    {vouchers.length === 0 ? (
                      <p className="text-muted text-center">No vouchers found</p>
                    ) : vouchers.map((v, i) => (
                      <Card key={i} className="border-0 shadow-sm mb-2" style={{ borderRadius: 8 }}>
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <code className="bg-light px-2 py-1 rounded">{v.code}</code>
                            {statusBadge(v.status, v.expires_at)}
                          </div>
                          <Row className="g-2">
                            {[
                              ["Package", v.package_name || v.package_type || "—"],
                              ["Phone", v.phone_number || "—"],
                              ["Created", v.created_at ? new Date(v.created_at).toLocaleDateString() : "—"],
                              ["Expires", v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"],
                            ].map(([label, val], j) => (
                              <Col xs="6" key={j}>
                                <div style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#6c757d", letterSpacing: "0.5px" }}>{label}</div>
                                <div style={{ fontSize: "0.85rem" }}>{val}</div>
                              </Col>
                            ))}
                          </Row>
                          {(v.status === "used" || v.status === "expired") && (
                            <Button size="sm" color="outline-warning" className="mt-2 w-100"
                              onClick={() => resetVoucher(v.id)}>
                              <Icon name="reload" className="me-1" />Reset
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* ══════ BULK GENERATE MODAL ══════ */}
        <Modal isOpen={bulkModal} toggle={() => setBulkModal(false)}>
          <ModalHeader toggle={() => setBulkModal(false)}>Bulk Generate Vouchers</ModalHeader>
          <ModalBody>
            {bulkResult && (
              <div className={`alert alert-${bulkResult.type} py-2`}>{bulkResult.text}</div>
            )}
            <div className="mb-3">
              <label className="form-label">Package <span className="text-danger">*</span></label>
              <Input type="select" value={bulkForm.package_id}
                onChange={(e) => setBulkForm({ ...bulkForm, package_id: e.target.value })}>
                <option value="">Select package...</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — KES {Number(p.price || 0).toLocaleString()}</option>
                ))}
              </Input>
            </div>
            <div className="mb-3">
              <label className="form-label">Quantity (1–100)</label>
              <Input type="number" min="1" max="100" value={bulkForm.quantity}
                onChange={(e) => setBulkForm({ ...bulkForm, quantity: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) })} />
            </div>
            <div className="mb-3">
              <label className="form-label">Phone (optional)</label>
              <Input type="text" placeholder="07XXXXXXXX" value={bulkForm.phone_number}
                onChange={(e) => setBulkForm({ ...bulkForm, phone_number: e.target.value })} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" size="sm" onClick={() => setBulkModal(false)}>Cancel</Button>
            <Button color="primary" size="sm" onClick={bulkGenerate} disabled={bulkLoading || !bulkForm.package_id}>
              {bulkLoading ? <Spinner size="sm" /> : `Generate ${bulkForm.quantity} Vouchers`}
            </Button>
          </ModalFooter>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default HotspotVouchers;
