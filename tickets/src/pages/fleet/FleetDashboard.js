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
import {
  Card,
  Badge,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  Form,
  FormGroup,
  Label,
  Input,
  Alert,
} from "reactstrap";
import { connect } from "react-redux";
import FleetAPI from "../../helpers/FleetAPI";
import FleetNav from "../../components/fleet/FleetNav";
import FleetPageLayout from "../../components/fleet/FleetPageLayout";
import {
  FLEET_GROUP_CODES,
  fleetInsuranceTypeLabel,
  vehicleRequiresInspection,
} from "../../utils/fleetRosterGroups";
import InventoryAPI from "../../helpers/InventoryAPI";
import { format } from "date-fns";
import "./Fleet.css";

function safeDate(str) {
  if (!str) return "—";
  try {
    return format(new Date(str), "dd MMM yyyy");
  } catch {
    return str;
  }
}

function toInputDate(str) {
  if (!str) return "";
  try {
    return format(new Date(str), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

const FleetDashboard = () => {
  const [dashboard, setDashboard] = useState({ vehicles: [], stats: {} });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterVehicle, setFilterVehicle] = useState("");
  const [editVehicle, setEditVehicle] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const editNeedsInspection = vehicleRequiresInspection(editForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterVehicle ? { vehicle_id: filterVehicle } : {};
      const [dashRes, logsRes] = await Promise.all([
        FleetAPI.getDashboard(),
        FleetAPI.getLogs(params),
      ]);
      setDashboard(dashRes.data || { vehicles: [], stats: {} });
      setLogs(logsRes.data || []);
    } catch {
      setDashboard({ vehicles: [], stats: {} });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterVehicle]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    InventoryAPI.getUsers()
      .then((res) => setUsers(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setUsers([]));
  }, []);

  const openEdit = (vehicle) => {
    setEditVehicle(vehicle);
    setEditForm({
      plate_number: vehicle.plate_number || "",
      label: vehicle.label || "",
      fleet_group: vehicle.fleet_group || "",
      next_service_odometer: vehicle.next_service_odometer ?? "",
      insurance_type: vehicle.insurance_type || "commercial",
      insurance_expiry: toInputDate(vehicle.insurance_expiry),
      inspection_expiry: toInputDate(vehicle.inspection_expiry),
      assigned_driver_id: vehicle.assigned_driver_id ?? "",
      service_alert_km: vehicle.service_alert_km ?? 500,
      notes: vehicle.notes || "",
    });
    setError("");
    setSuccess("");
  };

  const handleInsuranceTypeChange = (value) => {
    setEditForm((prev) => ({
      ...prev,
      insurance_type: value,
      inspection_expiry: value === "private" ? "" : prev.inspection_expiry,
    }));
  };

  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    if (!editVehicle) return;
    setSaving(true);
    setError("");
    try {
      const driver = users.find((u) => String(u.id) === String(editForm.assigned_driver_id));
      const isCommercial = vehicleRequiresInspection(editForm);
      const res = await FleetAPI.updateVehicle(editVehicle.id, {
        ...editForm,
        next_service_odometer: editForm.next_service_odometer === "" ? null : editForm.next_service_odometer,
        assigned_driver_id: editForm.assigned_driver_id === "" ? null : editForm.assigned_driver_id,
        assigned_driver_name: driver?.name || driver?.username || null,
        insurance_expiry: editForm.insurance_expiry || null,
        inspection_expiry: isCommercial ? editForm.inspection_expiry || null : null,
      });
      if (!res.success) {
        setError(res.error || "Update failed");
        return;
      }
      setSuccess("Vehicle updated");
      setEditVehicle(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const stats = dashboard.stats || {};
  const vehicles = dashboard.vehicles || [];

  return (
    <React.Fragment>
      <Head title="Fleet Management" />
      <Content>
        <FleetPageLayout>
        <FleetNav />
        <BlockHead size="sm" className="fleet-page-head">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Fleet Management</BlockTitle>
              <BlockDes className="text-soft d-none d-md-block">
                <p className="mb-0">
                  Service by odometer, insurance type (private vs commercial), and mileage history.
                </p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button size="sm" color="light" className="fleet-btn-touch" onClick={load} disabled={loading}>
                <Icon name="reload" />
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          {loading ? (
            <div className="text-center py-5"><Spinner color="primary" /></div>
          ) : (
            <>
              <div className="fleet-stats-row">
                <div className="fleet-mgmt-stat">
                  <span className="label">Vehicles</span>
                  <span className="value">{stats.vehicle_count ?? vehicles.length}</span>
                </div>
                <div className="fleet-mgmt-stat">
                  <span className="label">Logged today</span>
                  <span className="value">{stats.logged_today ?? 0}</span>
                </div>
                <div className="fleet-mgmt-stat">
                  <span className="label">7-day distance</span>
                  <span className="value">{stats.week_distance_km ?? 0} km</span>
                </div>
                <div className="fleet-mgmt-stat">
                  <span className="label">Open alerts</span>
                  <span className="value" style={{ color: stats.open_alerts ? "#e85347" : undefined }}>
                    {stats.open_alerts ?? 0}
                  </span>
                </div>
              </div>

              <div className="fleet-vehicle-grid mb-4">
                {vehicles.map((v) => {
                  const needsInspection = vehicleRequiresInspection(v);
                  return (
                  <Card key={v.id} className="card-bordered h-100">
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <div className="fleet-plate">{v.plate_number}</div>
                          <div className="fleet-meta">{v.label}</div>
                        </div>
                        <Button
                          size="sm"
                          color="light"
                          className="fleet-btn-touch"
                          onClick={() => openEdit(v)}
                        >
                          <Icon name="edit" />
                        </Button>
                      </div>
                      <div className="fleet-meta">
                        Odometer: {v.last_odometer != null ? `${v.last_odometer} km` : "—"}
                      </div>
                      {v.next_service_odometer && (
                        <div className="fleet-meta">
                          Service at {v.next_service_odometer} km
                          {v.km_to_service != null && ` · ${v.km_to_service} km left`}
                        </div>
                      )}
                      <div className="fleet-meta">
                        Insurance: {fleetInsuranceTypeLabel(v.insurance_type)}
                        {v.insurance_expiry ? ` · ${safeDate(v.insurance_expiry)}` : ""}
                      </div>
                      {needsInspection ? (
                        <div className="fleet-meta">
                          Inspection: {v.inspection_expiry ? safeDate(v.inspection_expiry) : "Not set"}
                        </div>
                      ) : (
                        <div className="fleet-meta text-muted">Inspection: Not required (private)</div>
                      )}
                      {v.assigned_driver_name && (
                        <div className="fleet-meta">Driver: {v.assigned_driver_name}</div>
                      )}
                      <div className="mt-2">
                        {(v.alerts || []).map((a, i) => (
                          <span
                            key={i}
                            className={`fleet-alert-chip fleet-alert-chip--${a.level === "danger" ? "danger" : "warning"}`}
                          >
                            {a.message}
                          </span>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        color="primary"
                        className="mt-3 fleet-btn-block-mobile fleet-btn-touch"
                        outline
                        onClick={() => setFilterVehicle(String(v.id))}
                      >
                        View logs
                      </Button>
                    </div>
                  </Card>
                  );
                })}
              </div>

              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 fleet-driver-row">
                    <h6 className="mb-0">Mileage history</h6>
                    <Input
                      type="select"
                      className="fleet-touch-input"
                      value={filterVehicle}
                      onChange={(e) => setFilterVehicle(e.target.value)}
                    >
                      <option value="">All vehicles</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.plate_number}</option>
                      ))}
                    </Input>
                  </div>
                  {logs.length === 0 ? (
                    <p className="text-muted mb-0">No log entries yet.</p>
                  ) : (
                    <>
                      <div className="fleet-log-table-wrap table-responsive">
                        <table className="table table-sm table-hover mb-0">
                          <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                            <tr>
                              <th>Date</th>
                              <th>Vehicle</th>
                              <th className="text-end">Start</th>
                              <th className="text-end">End</th>
                              <th className="text-end">Distance</th>
                              <th>Driver</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((log) => (
                              <tr key={log.id}>
                                <td style={{ whiteSpace: "nowrap" }}>{safeDate(log.log_date)}</td>
                                <td>
                                  <strong style={{ fontFamily: "monospace" }}>{log.plate_number}</strong>
                                </td>
                                <td className="text-end">{log.start_odometer}</td>
                                <td className="text-end">{log.end_odometer}</td>
                                <td className="text-end">
                                  <Badge color="primary" style={{ fontSize: "0.7rem" }}>
                                    {log.distance_km} km
                                  </Badge>
                                </td>
                                <td style={{ fontSize: "0.8rem" }}>{log.driver_name || "—"}</td>
                                <td style={{ fontSize: "0.78rem" }} className="text-muted">
                                  {log.gap_warning && (
                                    <span className="text-warning d-block">{log.gap_warning}</span>
                                  )}
                                  {log.notes || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="fleet-log-cards">
                        {logs.map((log) => (
                          <div key={log.id} className="fleet-log-card-item">
                            <div className="fleet-log-card-item__date">
                              {safeDate(log.log_date)} · {log.plate_number}
                            </div>
                            <div className="fleet-log-card-item__row">
                              <span>Start</span>
                              <span>{log.start_odometer} km</span>
                            </div>
                            <div className="fleet-log-card-item__row">
                              <span>End</span>
                              <span>{log.end_odometer} km</span>
                            </div>
                            <div className="fleet-log-card-item__row">
                              <span>Distance</span>
                              <span>
                                <Badge color="primary">{log.distance_km} km</Badge>
                              </span>
                            </div>
                            {log.driver_name ? (
                              <div className="fleet-log-card-item__row">
                                <span>Driver</span>
                                <span>{log.driver_name}</span>
                              </div>
                            ) : null}
                            {log.gap_warning ? (
                              <div className="text-warning small mt-1">{log.gap_warning}</div>
                            ) : null}
                            {log.notes ? (
                              <div className="fleet-log-card-item__row">
                                <span>Notes</span>
                                <span>{log.notes}</span>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </>
          )}
        </Block>
        </FleetPageLayout>

        <Modal isOpen={!!editVehicle} toggle={() => setEditVehicle(null)} size="lg">
          <ModalHeader toggle={() => setEditVehicle(null)}>
            Edit vehicle — {editVehicle?.plate_number}
          </ModalHeader>
          <ModalBody>
            {error && <Alert color="danger">{error}</Alert>}
            {success && <Alert color="success">{success}</Alert>}
            <Form onSubmit={handleSaveVehicle}>
              <div className="row">
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Plate number</Label>
                    <Input
                      className="fleet-touch-input"
                      value={editForm.plate_number}
                      onChange={(e) => setEditForm({ ...editForm, plate_number: e.target.value })}
                    />
                  </FormGroup>
                </div>
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Label</Label>
                    <Input
                      value={editForm.label}
                      onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                    />
                  </FormGroup>
                </div>
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Vehicle code</Label>
                    <Input
                      type="select"
                      value={editForm.fleet_group}
                      onChange={(e) => setEditForm({ ...editForm, fleet_group: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {FLEET_GROUP_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </div>
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Next service (odometer km)</Label>
                    <Input
                      type="number"
                      value={editForm.next_service_odometer}
                      onChange={(e) =>
                        setEditForm({ ...editForm, next_service_odometer: e.target.value })
                      }
                    />
                  </FormGroup>
                </div>
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Service alert (km before due)</Label>
                    <Input
                      type="number"
                      value={editForm.service_alert_km}
                      onChange={(e) =>
                        setEditForm({ ...editForm, service_alert_km: e.target.value })
                      }
                    />
                  </FormGroup>
                </div>
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Insurance type</Label>
                    <Input
                      type="select"
                      value={editForm.insurance_type || "commercial"}
                      onChange={(e) => handleInsuranceTypeChange(e.target.value)}
                    >
                      <option value="private">Private — no inspection required</option>
                      <option value="commercial">Commercial — inspection required</option>
                    </Input>
                  </FormGroup>
                </div>
                <div className="col-md-6">
                  <FormGroup>
                    <Label>Insurance expiry</Label>
                    <Input
                      type="date"
                      value={editForm.insurance_expiry}
                      onChange={(e) =>
                        setEditForm({ ...editForm, insurance_expiry: e.target.value })
                      }
                    />
                  </FormGroup>
                </div>
                {editNeedsInspection ? (
                  <div className="col-md-6">
                    <FormGroup>
                      <Label>Inspection expiry</Label>
                      <Input
                        type="date"
                        value={editForm.inspection_expiry}
                        onChange={(e) =>
                          setEditForm({ ...editForm, inspection_expiry: e.target.value })
                        }
                      />
                      <small className="text-muted">Required for commercial insurance</small>
                    </FormGroup>
                  </div>
                ) : (
                  <div className="col-md-6">
                    <Alert color="light" className="py-2 small mb-0 mt-4">
                      Private insurance — inspection is not tracked for this vehicle.
                    </Alert>
                  </div>
                )}
                <div className="col-md-12">
                  <FormGroup>
                    <Label>Assigned driver</Label>
                    <Input
                      type="select"
                      value={editForm.assigned_driver_id}
                      onChange={(e) =>
                        setEditForm({ ...editForm, assigned_driver_id: e.target.value })
                      }
                    >
                      <option value="">— Not assigned —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.username || u.email}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </div>
                <div className="col-md-12">
                  <FormGroup>
                    <Label>Notes</Label>
                    <Input
                      type="textarea"
                      rows={2}
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    />
                  </FormGroup>
                </div>
              </div>
              <Button color="primary" type="submit" className="fleet-btn-block-mobile fleet-btn-touch" disabled={saving}>
                {saving ? <Spinner size="sm" /> : "Save vehicle"}
              </Button>
            </Form>
          </ModalBody>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default connect()(FleetDashboard);
