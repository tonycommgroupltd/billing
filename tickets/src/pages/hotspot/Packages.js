import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Card, Badge, Spinner, Table, Button, Input,
  Modal, ModalHeader, ModalBody, ModalFooter,
} from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Row, Col, Icon } from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";

const tierColors = { silver: "secondary", bronze: "warning", premium: "info", gold: "warning", basic: "light" };

const emptyForm = {
  code: "", name: "", price: "", duration_hours: "", description: "",
  display_note: "", badge_color: "#667eea", category: "standard",
  tier: "silver", base_package_id: "", max_devices: 1, sort_order: 0,
  sync_radius: true,
};

const HotspotPackages = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await HotspotAPI.getPackages();
      if (res.success) setPackages(res.data || []);
    } catch (e) {
      console.error("Packages fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value };

    // Auto-fill display note based on tier
    if (field === "tier" && form.name) {
      const tierNotes = {
        silver: `${form.name} – Standard`,
        bronze: `${form.name} – Bronze Tier`,
        premium: `${form.name} – Premium Tier`,
      };
      updated.display_note = tierNotes[value] || updated.display_note;
    }
    setForm(updated);
  };

  const startEdit = (pkg) => {
    setEditId(pkg.id);
    setForm({
      code: pkg.code || "",
      name: pkg.name || "",
      price: pkg.price || "",
      duration_hours: pkg.duration_hours || "",
      description: pkg.description || "",
      display_note: pkg.display_note || "",
      badge_color: pkg.badge_color || "#667eea",
      category: pkg.category || "standard",
      tier: pkg.tier || "silver",
      base_package_id: pkg.base_package_id || "",
      max_devices: pkg.max_devices || 1,
      sort_order: pkg.sort_order || 0,
      sync_radius: pkg.sync_radius !== false,
    });
    setFormMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setFormMsg(null);
  };

  const savePackage = async () => {
    if (!form.code || !form.name || !form.price || !form.duration_hours) {
      setFormMsg({ type: "danger", text: "Code, Name, Price and Duration are required" });
      return;
    }
    setSaving(true);
    setFormMsg(null);
    try {
      let res;
      if (editId) {
        res = await HotspotAPI.updatePackage(editId, form);
      } else {
        res = await HotspotAPI.createPackage(form);
      }
      if (res.success) {
        setFormMsg({ type: "success", text: editId ? "Package updated!" : "Package created!" });
        cancelEdit();
        fetchPackages();
      } else {
        setFormMsg({ type: "danger", text: res.message || "Failed" });
      }
    } catch (e) {
      setFormMsg({ type: "danger", text: "Error saving package" });
    } finally {
      setSaving(false);
    }
  };

  const deletePackage = async (id) => {
    try {
      const res = await HotspotAPI.deletePackage(id);
      if (res.success) {
        setDeleteModal(null);
        fetchPackages();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const syncToRadius = async (id) => {
    try {
      const res = await HotspotAPI.syncPackageToRadius(id);
      if (res.success) {
        setFormMsg({ type: "success", text: "Synced to FreeRADIUS!" });
        fetchPackages();
      } else {
        setFormMsg({ type: "danger", text: res.message || "Sync failed" });
      }
    } catch (e) {
      setFormMsg({ type: "danger", text: "Sync error" });
    }
  };

  const generateTiers = async (baseId) => {
    try {
      const res = await HotspotAPI.generateTiers(baseId);
      if (res.success) {
        setFormMsg({ type: "success", text: "Bronze & Premium tiers generated!" });
        fetchPackages();
      } else {
        setFormMsg({ type: "danger", text: res.message || "Failed" });
      }
    } catch (e) {
      setFormMsg({ type: "danger", text: "Error generating tiers" });
    }
  };

  const formatDuration = (hours) => {
    if (!hours) return "—";
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  };

  return (
    <React.Fragment>
      <Head title="Packages" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h4">Package Management</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Row className="g-3">
          {/* ══════ LEFT: ADD / EDIT FORM ══════ */}
          <Col xs="12" lg="5">
            <div style={{ position: "sticky", top: 80 }}>
              <Card className="border-0 shadow-sm" style={{ borderRadius: 12 }}>
                <div className="card-header bg-white border-0 py-3">
                  <h6 className="mb-0 fw-bold">
                    {editId ? "✏️ Edit Package" : "➕ Add Package"}
                  </h6>
                </div>
                <div className="card-body pt-0">
                  {formMsg && (
                    <div className={`alert alert-${formMsg.type} py-2 small`}>{formMsg.text}</div>
                  )}

                  <Row className="g-2">
                    <Col xs="6">
                      <label className="form-label small">Code <span className="text-danger">*</span></label>
                      <Input type="text" bsSize="sm" placeholder="e.g. DAILY_50" value={form.code}
                        onChange={(e) => handleChange("code", e.target.value)} />
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Name <span className="text-danger">*</span></label>
                      <Input type="text" bsSize="sm" placeholder="e.g. Daily 50" value={form.name}
                        onChange={(e) => handleChange("name", e.target.value)} />
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Price (KES) <span className="text-danger">*</span></label>
                      <Input type="number" bsSize="sm" placeholder="50" value={form.price}
                        onChange={(e) => handleChange("price", e.target.value)} />
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Duration (hrs) <span className="text-danger">*</span></label>
                      <Input type="number" bsSize="sm" step="0.5" placeholder="24" value={form.duration_hours}
                        onChange={(e) => handleChange("duration_hours", e.target.value)} />
                    </Col>
                    <Col xs="12">
                      <label className="form-label small">Description</label>
                      <Input type="textarea" bsSize="sm" rows="2" placeholder="Package description"
                        value={form.description} onChange={(e) => handleChange("description", e.target.value)} />
                    </Col>
                    <Col xs="12">
                      <label className="form-label small">Display Note</label>
                      <Input type="text" bsSize="sm" placeholder="Auto-filled by tier"
                        value={form.display_note} onChange={(e) => handleChange("display_note", e.target.value)} />
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Badge Color</label>
                      <div className="d-flex align-items-center gap-2">
                        <Input type="color" style={{ width: 36, height: 30, padding: 2 }} value={form.badge_color}
                          onChange={(e) => handleChange("badge_color", e.target.value)} />
                        <Input type="text" bsSize="sm" value={form.badge_color}
                          onChange={(e) => handleChange("badge_color", e.target.value)} style={{ fontSize: "0.8rem" }} />
                      </div>
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Category</label>
                      <Input type="select" bsSize="sm" value={form.category}
                        onChange={(e) => handleChange("category", e.target.value)}>
                        <option value="standard">Standard</option>
                        <option value="premium">Premium</option>
                        <option value="unlimited">Unlimited</option>
                        <option value="trial">Trial</option>
                      </Input>
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Tier</label>
                      <Input type="select" bsSize="sm" value={form.tier}
                        onChange={(e) => handleChange("tier", e.target.value)}>
                        <option value="silver">Silver</option>
                        <option value="bronze">Bronze</option>
                        <option value="premium">Premium</option>
                      </Input>
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Base Package</label>
                      <Input type="select" bsSize="sm" value={form.base_package_id}
                        onChange={(e) => handleChange("base_package_id", e.target.value)}>
                        <option value="">None (is base)</option>
                        {packages.filter((p) => !p.base_package_id).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Input>
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Max Devices</label>
                      <Input type="number" bsSize="sm" min="1" max="10" value={form.max_devices}
                        onChange={(e) => handleChange("max_devices", e.target.value)} />
                    </Col>
                    <Col xs="6">
                      <label className="form-label small">Sort Order</label>
                      <Input type="number" bsSize="sm" min="0" value={form.sort_order}
                        onChange={(e) => handleChange("sort_order", e.target.value)} />
                    </Col>
                    <Col xs="12">
                      <div className="form-check mt-1">
                        <input type="checkbox" className="form-check-input" id="syncRadius"
                          checked={form.sync_radius} onChange={(e) => handleChange("sync_radius", e.target.checked)} />
                        <label className="form-check-label small" htmlFor="syncRadius">Sync to FreeRADIUS</label>
                      </div>
                    </Col>
                  </Row>

                  <div className="d-flex gap-2 mt-3">
                    <Button color="primary" size="sm" className="flex-fill" onClick={savePackage} disabled={saving}>
                      {saving ? <Spinner size="sm" /> : editId ? "Update Package" : "Create Package"}
                    </Button>
                    {editId && (
                      <Button color="outline-secondary" size="sm" onClick={cancelEdit}>Cancel</Button>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </Col>

          {/* ══════ RIGHT: PACKAGES TABLE ══════ */}
          <Col xs="12" lg="7">
            <Card className="border-0 shadow-sm" style={{ borderRadius: 12 }}>
              <div className="card-header bg-white border-0 py-3">
                <h6 className="mb-0 fw-bold">📦 All Packages ({packages.length})</h6>
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
                          <th>Name</th><th>Code</th><th>Price</th>
                          <th>Duration</th><th>Tier</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packages.length === 0 ? (
                          <tr><td colSpan="6" className="text-center py-4 text-muted">No packages found</td></tr>
                        ) : packages.map((p, i) => (
                          <tr key={i} className={editId === p.id ? "table-primary" : ""}>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <span className="rounded-circle d-inline-block" style={{
                                  width: 10, height: 10, backgroundColor: p.badge_color || "#667eea",
                                }} />
                                <span className="fw-bold">{p.name}</span>
                              </div>
                              {p.description && <small className="text-muted d-block">{p.description}</small>}
                            </td>
                            <td><code className="small">{p.code}</code></td>
                            <td className="fw-bold">KES {Number(p.price || 0).toLocaleString()}</td>
                            <td>{formatDuration(p.duration_hours)}</td>
                            <td>
                              <Badge color={tierColors[p.tier] || "secondary"} className="text-capitalize">
                                {p.tier || "silver"}
                              </Badge>
                            </td>
                            <td>
                              <div className="d-flex gap-1">
                                <Button size="sm" color="outline-primary" className="py-0 px-1"
                                  onClick={() => startEdit(p)} title="Edit">
                                  <Icon name="edit" />
                                </Button>
                                <Button size="sm" color="outline-info" className="py-0 px-1"
                                  onClick={() => syncToRadius(p.id)} title="Sync to RADIUS">
                                  <Icon name="reload" />
                                </Button>
                                {!p.base_package_id && (
                                  <Button size="sm" color="outline-warning" className="py-0 px-1"
                                    onClick={() => generateTiers(p.id)} title="Generate Bronze & Premium">
                                    <Icon name="layers" />
                                  </Button>
                                )}
                                <Button size="sm" color="outline-danger" className="py-0 px-1"
                                  onClick={() => setDeleteModal(p)} title="Delete">
                                  <Icon name="trash" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  {/* Mobile cards */}
                  <div className="d-md-none p-3">
                    {packages.length === 0 ? (
                      <p className="text-muted text-center">No packages found</p>
                    ) : packages.map((p, i) => (
                      <Card key={i} className={`border-0 shadow-sm mb-2 ${editId === p.id ? "border-primary" : ""}`}
                        style={{ borderRadius: 8, borderLeft: `4px solid ${p.badge_color || "#667eea"}` }}>
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="fw-bold">{p.name}</span>
                            <Badge color={tierColors[p.tier] || "secondary"} className="text-capitalize">
                              {p.tier || "silver"}
                            </Badge>
                          </div>
                          <Row className="g-2 mb-2">
                            {[
                              ["Code", p.code],
                              ["Price", `KES ${Number(p.price || 0).toLocaleString()}`],
                              ["Duration", formatDuration(p.duration_hours)],
                              ["Max Devices", p.max_devices || 1],
                            ].map(([label, val], j) => (
                              <Col xs="6" key={j}>
                                <div style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#6c757d", letterSpacing: "0.5px" }}>{label}</div>
                                <div style={{ fontSize: "0.85rem" }}>{val}</div>
                              </Col>
                            ))}
                          </Row>
                          <div className="d-flex gap-1">
                            <Button size="sm" color="outline-primary" className="flex-fill" onClick={() => startEdit(p)}>
                              <Icon name="edit" className="me-1" />Edit
                            </Button>
                            <Button size="sm" color="outline-info" onClick={() => syncToRadius(p.id)}>
                              <Icon name="reload" />
                            </Button>
                            {!p.base_package_id && (
                              <Button size="sm" color="outline-warning" onClick={() => generateTiers(p.id)}>
                                <Icon name="layers" />
                              </Button>
                            )}
                            <Button size="sm" color="outline-danger" onClick={() => setDeleteModal(p)}>
                              <Icon name="trash" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* ══════ DELETE MODAL ══════ */}
        <Modal isOpen={!!deleteModal} toggle={() => setDeleteModal(null)} size="sm">
          <ModalHeader toggle={() => setDeleteModal(null)}>Delete Package</ModalHeader>
          <ModalBody>
            <p>Are you sure you want to delete <strong>{deleteModal?.name}</strong>?</p>
            <p className="text-muted small">This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" size="sm" onClick={() => setDeleteModal(null)}>Cancel</Button>
            <Button color="danger" size="sm" onClick={() => deletePackage(deleteModal?.id)}>Delete</Button>
          </ModalFooter>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default HotspotPackages;
