import React, { useState, useEffect, useCallback } from "react";
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
import { Card, Badge, Form, FormGroup, Label, Input, Spinner, Alert } from "reactstrap";
import { connect } from "react-redux";
import FleetAPI from "../../helpers/FleetAPI";
import FleetNav from "../../components/fleet/FleetNav";
import FleetPageLayout from "../../components/fleet/FleetPageLayout";
import {
  fleetImageUrl,
  fleetInsuranceTypeLabel,
  readImageFileAsBase64,
  vehicleRequiresInspection,
} from "../../utils/fleetRosterGroups";
import { format } from "date-fns";
import "./Fleet.css";

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function safeDate(str) {
  if (!str) return "—";
  try {
    return format(new Date(str), "dd MMM yyyy");
  } catch {
    return str;
  }
}

function plateLabel(v) {
  const plate = v?.plate_number;
  if (!plate || plate === "—" || plate === "TBD" || plate.startsWith("TBD-")) {
    return "Plate TBD";
  }
  return plate;
}

const FleetLog = () => {
  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [gapWarning, setGapWarning] = useState("");
  const [recentLogs, setRecentLogs] = useState([]);
  const [logDate, setLogDate] = useState(todayStr());
  const [form, setForm] = useState({ start_odometer: "", end_odometer: "", notes: "" });
  const [startImagePreview, setStartImagePreview] = useState(null);
  const [endImagePreview, setEndImagePreview] = useState(null);
  const [pendingStartImage, setPendingStartImage] = useState(null);
  const [pendingEndImage, setPendingEndImage] = useState(null);

  const selected = vehicles.find((v) => v.id === selectedId) || null;

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await FleetAPI.getVehicles();
      const list = res.data || [];
      setVehicles(list);
      setSelectedId((prev) => prev || list[0]?.id || null);
    } catch {
      setVehicles([]);
      setError("Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContext = useCallback(async (vehicleId, date) => {
    if (!vehicleId) return;
    try {
      const [ctxRes, logsRes] = await Promise.all([
        FleetAPI.getTodayContext(vehicleId, date),
        FleetAPI.getLogs({ vehicle_id: vehicleId }),
      ]);
      const ctx = ctxRes.data;
      const todayLog = ctx?.today_log;
      setForm({
        start_odometer:
          todayLog?.start_odometer ??
          ctx?.suggested_start ??
          "",
        end_odometer: todayLog?.end_odometer ?? "",
        notes: todayLog?.notes ?? "",
      });
      setStartImagePreview(todayLog?.start_odometer_image || null);
      setEndImagePreview(todayLog?.end_odometer_image || null);
      setPendingStartImage(null);
      setPendingEndImage(null);
      setGapWarning("");
      setRecentLogs((logsRes.data || []).slice(0, 14));
    } catch {
      setRecentLogs([]);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    if (selectedId) loadContext(selectedId, logDate);
  }, [selectedId, logDate, loadContext]);

  const distance =
    form.end_odometer !== "" && form.start_odometer !== ""
      ? Math.max(0, parseInt(form.end_odometer, 10) - parseInt(form.start_odometer, 10))
      : null;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setGapWarning("");
    const start = parseInt(form.start_odometer, 10);
    const end = parseInt(form.end_odometer, 10);
    if (!selectedId || !Number.isFinite(start) || !Number.isFinite(end)) {
      setError("Enter valid start and end odometer readings.");
      return;
    }
    if (end < start) {
      setError("End reading must be greater than or equal to start.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_id: selectedId,
        log_date: logDate,
        start_odometer: start,
        end_odometer: end,
        notes: form.notes,
      };
      if (pendingStartImage) payload.start_odometer_image = pendingStartImage;
      if (pendingEndImage) payload.end_odometer_image = pendingEndImage;
      const res = await FleetAPI.saveLog(payload);
      if (!res.success) {
        setError(res.error || "Failed to save");
        return;
      }
      if (res.data?.gap_warning) setGapWarning(res.data.gap_warning);
      setSuccess(res.message || "Saved");
      await loadVehicles();
      await loadContext(selectedId, logDate);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="Vehicle Log" />
      <Content>
        <FleetPageLayout>
        <FleetNav />
        <BlockHead size="sm" className="fleet-page-head">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Daily Vehicle Log</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button size="sm" color="light" className="fleet-btn-touch" onClick={loadVehicles} disabled={loading}>
                <Icon name="reload" />
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          {error && <Alert color="danger">{error}</Alert>}
          {success && <Alert color="success">{success}</Alert>}
          {gapWarning && <Alert color="warning">{gapWarning}</Alert>}

          <Card className="card-bordered mb-3">
            <div className="card-inner">
              <Label className="fw-bold mb-2">Select vehicle</Label>
              {loading ? (
                <div className="text-center py-4"><Spinner color="primary" /></div>
              ) : (
                <div className="fleet-vehicle-grid">
                  {vehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`fleet-vehicle-card${selectedId === v.id ? " fleet-vehicle-card--active" : ""}`}
                      onClick={() => setSelectedId(v.id)}
                    >
                      <div className="fleet-code-badge mb-1">
                        {v.fleet_group || v.label || v.plate_number}
                      </div>
                      <div className="fleet-meta">{plateLabel(v)}</div>
                      {v.last_odometer != null && (
                        <div className="fleet-meta">Last reading: {v.last_odometer} km</div>
                      )}
                      {v.assigned_driver_name && (
                        <div className="fleet-meta">Driver: {v.assigned_driver_name}</div>
                      )}
                      {(v.alerts || []).slice(0, 2).map((a, i) => (
                        <span
                          key={i}
                          className={`fleet-alert-chip fleet-alert-chip--${a.level === "danger" ? "danger" : "warning"}`}
                        >
                          {a.message}
                        </span>
                      ))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {selected && (
            <div className="row g-gs">
              <div className="col-lg-5">
                <Card className="card-bordered">
                  <div className="card-inner fleet-log-form">
                    <h6 className="mb-3">
                      Log for <span className="fleet-plate">{selected.plate_number}</span>
                    </h6>
                    <Form onSubmit={handleSave}>
                      <FormGroup>
                        <Label>Date</Label>
                        <Input
                          type="date"
                          className="fleet-touch-input"
                          value={logDate}
                          max={todayStr()}
                          onChange={(e) => setLogDate(e.target.value)}
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label>Start of day (km)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="fleet-touch-input"
                          value={form.start_odometer}
                          onChange={(e) =>
                            setForm({ ...form, start_odometer: e.target.value })
                          }
                          placeholder="Odometer at start"
                        />
                        <small className="text-muted">
                          Should match previous day&apos;s end reading
                        </small>
                      </FormGroup>
                      <FormGroup>
                        <Label>End of day (km)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="fleet-touch-input"
                          value={form.end_odometer}
                          onChange={(e) =>
                            setForm({ ...form, end_odometer: e.target.value })
                          }
                          placeholder="Odometer at end"
                        />
                      </FormGroup>
                      {distance != null && Number.isFinite(distance) && (
                        <div className="fleet-distance-preview mb-3">
                          Distance today: {distance} km
                        </div>
                      )}
                      <FormGroup>
                        <Label>Odometer photos</Label>
                        <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                          <div>
                            <label className="btn btn-outline-secondary fleet-camera-btn mb-1">
                              <Icon name="camera" className="mr-1" />
                              Start photo
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="d-none"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const b64 = await readImageFileAsBase64(file);
                                  setPendingStartImage(b64);
                                  setStartImagePreview(b64);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {(pendingStartImage || startImagePreview) && (
                              <img
                                src={pendingStartImage || fleetImageUrl(startImagePreview)}
                                alt="Start odometer"
                                style={{ display: "block", maxHeight: 80, borderRadius: 6 }}
                              />
                            )}
                          </div>
                          <div>
                            <label className="btn btn-outline-secondary fleet-camera-btn mb-1">
                              <Icon name="camera" className="mr-1" />
                              End photo
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="d-none"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const b64 = await readImageFileAsBase64(file);
                                  setPendingEndImage(b64);
                                  setEndImagePreview(b64);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {(pendingEndImage || endImagePreview) && (
                              <img
                                src={pendingEndImage || fleetImageUrl(endImagePreview)}
                                alt="End odometer"
                                style={{ display: "block", maxHeight: 80, borderRadius: 6 }}
                              />
                            )}
                          </div>
                        </div>
                        <small className="text-muted">
                          Dashboard photo is optional.
                        </small>
                      </FormGroup>
                      <FormGroup>
                        <Label>Notes</Label>
                        <Input
                          type="textarea"
                          rows={2}
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          placeholder="e.g. Inspection done, fuel, repairs…"
                        />
                      </FormGroup>
                      <Button color="primary" type="submit" disabled={saving} className="fleet-btn-block-mobile fleet-btn-touch">
                        {saving ? <Spinner size="sm" /> : "Save daily log"}
                      </Button>
                    </Form>

                    <div className="mt-4 pt-3 border-top" style={{ fontSize: "0.78rem" }}>
                      <div className="text-soft mb-1">Vehicle reminders</div>
                      {selected.next_service_odometer && (
                        <div>Next service at: <strong>{selected.next_service_odometer}</strong> km
                          {selected.km_to_service != null && (
                            <span className="text-muted"> ({selected.km_to_service} km left)</span>
                          )}
                        </div>
                      )}
                      {selected.insurance_expiry && (
                        <div>
                          Insurance ({fleetInsuranceTypeLabel(selected.insurance_type)}):{" "}
                          {safeDate(selected.insurance_expiry)}
                        </div>
                      )}
                      {vehicleRequiresInspection(selected) ? (
                        selected.inspection_expiry && (
                          <div>Inspection expiry: {safeDate(selected.inspection_expiry)}</div>
                        )
                      ) : (
                        <div className="text-muted">Inspection: not required (private)</div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>

              <div className="col-lg-7">
                <Card className="card-bordered">
                  <div className="card-inner">
                    <h6 className="mb-3">Recent log — {selected.plate_number}</h6>
                    {recentLogs.length === 0 ? (
                      <p className="text-muted">No entries yet for this vehicle.</p>
                    ) : (
                      <>
                        <div className="fleet-log-table-wrap table-responsive">
                          <table className="table table-sm table-hover mb-0">
                          <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                            <tr>
                              <th>Date</th>
                              <th className="text-end">Start</th>
                              <th className="text-end">End</th>
                              <th className="text-end">Distance</th>
                              <th>Driver</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentLogs.map((log) => (
                              <tr key={log.id}>
                                <td style={{ whiteSpace: "nowrap" }}>{safeDate(log.log_date)}</td>
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
                          {recentLogs.map((log) => (
                            <div key={log.id} className="fleet-log-card-item">
                              <div className="fleet-log-card-item__date">{safeDate(log.log_date)}</div>
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
                                <Badge color="primary">{log.distance_km} km</Badge>
                              </div>
                              {log.driver_name && (
                                <div className="fleet-log-card-item__row">
                                  <span>Driver</span>
                                  <span>{log.driver_name}</span>
                                </div>
                              )}
                              {log.notes && (
                                <div className="small text-muted mt-1">{log.notes}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </Block>
        </FleetPageLayout>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(FleetLog);
