import React, { useCallback, useEffect, useState } from "react";
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
import {
  Card,
  Badge,
  FormGroup,
  Input,
  Label,
  Spinner,
  Alert,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
} from "reactstrap";
import classnames from "classnames";
import { format } from "date-fns";
import FleetAPI from "../../helpers/FleetAPI";
import FleetNav from "../../components/fleet/FleetNav";
import FleetPageLayout from "../../components/fleet/FleetPageLayout";
import { showError, showSuccess } from "../../utils/notifications";
import {
  fleetImageUrl,
  fleetInsuranceTypeLabel,
  formatExpiryLabel,
  readImageFileAsBase64,
  vehicleRequiresInspection,
} from "../../utils/fleetRosterGroups";
import "./Fleet.css";

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function vehicleCode(item) {
  return item?.vehicle?.fleet_group || item?.code || "—";
}

function plateLabel(v) {
  const plate = v?.plate_number;
  if (!plate || plate === "—" || plate === "TBD" || plate.startsWith("TBD-")) {
    return "Plate TBD";
  }
  return plate;
}

const HistoryTable = ({ rows, columns }) => {
  if (!rows?.length) {
    return <p className="text-muted mb-0">No records yet.</p>;
  }
  return (
    <div className="fleet-history-table-wrap table-responsive">
      <table className="table table-sm mb-0">
        <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const FleetCare = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [activeTab, setActiveTab] = useState("fuel");
  const [fuelHistory, setFuelHistory] = useState([]);
  const [maintHistory, setMaintHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  const [fuelForm, setFuelForm] = useState({
    fuel_date: todayStr(),
    amount_ksh: "",
    liters: "",
    odometer: "",
    notes: "",
  });
  const [cleanForm, setCleanForm] = useState({ event_date: todayStr(), notes: "", image: null });
  const [serviceForm, setServiceForm] = useState({
    event_date: todayStr(),
    description: "",
    next_service_odometer: "",
    cost: "",
  });
  const [maintForm, setMaintForm] = useState({
    event_date: todayStr(),
    description: "",
    cost: "",
    status: "closed",
    maintenance_kind: "normal",
    driver_name_at_event: "",
  });

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await FleetAPI.getCareSummary();
      const list = res?.data || [];
      setSummary(list);
      setSelectedCode((prev) => {
        if (prev && list.some((x) => vehicleCode(x) === prev)) return prev;
        return list[0] ? vehicleCode(list[0]) : "";
      });
    } catch {
      setSummary([]);
      showError("Failed to load fleet care data");
    } finally {
      setLoading(false);
    }
  }, []);

  const selected = summary.find((x) => vehicleCode(x) === selectedCode);
  const vehicle = selected?.vehicle;

  const loadHistory = useCallback(async (vehicleId) => {
    if (!vehicleId) return;
    try {
      const [fuelRes, maintRes] = await Promise.all([
        FleetAPI.getFuelLogs({ vehicle_id: vehicleId, limit: 30 }),
        FleetAPI.getMaintenance({ vehicle_id: vehicleId, limit: 50 }),
      ]);
      setFuelHistory(fuelRes.data || []);
      setMaintHistory(maintRes.data || []);
    } catch {
      setFuelHistory([]);
      setMaintHistory([]);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (vehicle?.id) loadHistory(vehicle.id);
  }, [vehicle?.id, loadHistory]);

  const refresh = async () => {
    await loadSummary();
    if (vehicle?.id) await loadHistory(vehicle.id);
  };

  const saveFuel = async () => {
    if (!vehicle?.id || !fuelForm.amount_ksh) {
      showError("Enter fuel amount (KSh)");
      return;
    }
    setSaving(true);
    try {
      const res = await FleetAPI.saveFuelLog({
        vehicle_id: vehicle.id,
        fuel_date: fuelForm.fuel_date,
        amount_ksh: Number(fuelForm.amount_ksh),
        liters: fuelForm.liters !== "" ? Number(fuelForm.liters) : null,
        odometer: fuelForm.odometer !== "" ? Number(fuelForm.odometer) : null,
        notes: fuelForm.notes,
      });
      if (res?.success) {
        showSuccess("Fuel log saved");
        const days = res.data?.days_since_previous;
        if (days != null) {
          showSuccess(`Days since last fill-up: ${days}`);
        }
        setFuelForm({ fuel_date: todayStr(), amount_ksh: "", liters: "", odometer: "", notes: "" });
        refresh();
      } else {
        showError(res?.error || "Failed to save");
      }
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveMaintenance = async (eventType, form, extra = {}) => {
    if (!vehicle?.id) return;
    if (eventType === "maintenance") {
      if (form.maintenance_kind === "breakdown" && !form.driver_name_at_event?.trim()) {
        showError("Enter the driver name for this breakdown");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_id: vehicle.id,
        event_type: eventType,
        event_date: form.event_date,
        description: form.description || form.notes || "",
        status: form.status || "closed",
        ...extra,
      };
      if (form.cost !== "" && form.cost != null) payload.cost = Number(form.cost);
      if (form.next_service_odometer !== "" && form.next_service_odometer != null) {
        payload.next_service_odometer = Number(form.next_service_odometer);
      }
      if (form.image) payload.image = form.image;
      if (eventType === "maintenance") {
        payload.maintenance_kind = form.maintenance_kind || "normal";
        if (form.driver_name_at_event?.trim()) {
          payload.driver_name_at_event = form.driver_name_at_event.trim();
        }
      }

      const res = await FleetAPI.saveMaintenance(payload);
      if (res?.success) {
        showSuccess(res.message || "Saved");
        if (eventType === "car_wash") {
          setCleanForm({ event_date: todayStr(), notes: "", image: null });
        } else if (eventType === "service") {
          setServiceForm({
            event_date: todayStr(),
            description: "",
            next_service_odometer: "",
            cost: "",
          });
        } else {
          setMaintForm({
            event_date: todayStr(),
            description: "",
            cost: "",
            status: "closed",
            maintenance_kind: "normal",
            driver_name_at_event: "",
          });
        }
        refresh();
      } else {
        showError(res?.error || "Failed to save");
      }
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const cleaningRows = maintHistory.filter((r) => r.event_type === "car_wash");
  const serviceRows = maintHistory.filter((r) => r.event_type === "service");
  const maintenanceRows = maintHistory.filter((r) =>
    ["maintenance", "garage"].includes(r.event_type)
  );

  return (
    <React.Fragment>
      <Head title="Fuel & Vehicle Care" />
      <Content>
        <FleetPageLayout>
          <FleetNav />
          <BlockHead size="sm" className="fleet-page-head">
            <div className="nk-block-between">
              <BlockHeadContent>
                <BlockTitle page>Fuel &amp; Vehicle Care</BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent>
                <Button
                  size="sm"
                  color="light"
                  className="fleet-btn-touch"
                  onClick={refresh}
                  disabled={loading}
                >
                  <Icon name="reload" />
                </Button>
              </BlockHeadContent>
            </div>
          </BlockHead>

          <Block>
            {loading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : (
              <>
                <Card className="card-bordered mb-3">
                  <div className="card-inner">
                    <Label className="fw-bold mb-2">Select vehicle</Label>
                    <div className="fleet-vehicle-grid">
                      {summary.map((item) => {
                        const code = vehicleCode(item);
                        return (
                          <button
                            key={code}
                            type="button"
                            className={`fleet-vehicle-card${
                              selectedCode === code ? " fleet-vehicle-card--active" : ""
                            }`}
                            onClick={() => setSelectedCode(code)}
                          >
                            <div className="fleet-plate">{code}</div>
                            <div className="fleet-meta">{plateLabel(item.vehicle)}</div>
                            {item.days_since_fuel != null ? (
                              <div className="fleet-meta">
                                Last fuel {item.days_since_fuel} day
                                {item.days_since_fuel !== 1 ? "s" : ""} ago
                              </div>
                            ) : (
                              <Badge color="warning" pill className="mt-1">
                                No fuel logged
                              </Badge>
                            )}
                            {(item.vehicle?.alerts || []).slice(0, 1).map((a, i) => (
                              <span
                                key={i}
                                className={`fleet-alert-chip fleet-alert-chip--${
                                  a.level === "danger" ? "danger" : "warning"
                                }`}
                              >
                                {a.message}
                              </span>
                            ))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {selected && vehicle ? (
                  <>
                    <Card className="card-bordered mb-3">
                      <div className="card-inner py-3">
                        <div className="row g-2 small">
                          <div className="col-6 col-md-4">
                            <span className="text-uppercase text-muted d-block" style={{ fontSize: "0.65rem" }}>
                              Insurance
                            </span>
                            {fleetInsuranceTypeLabel(vehicle.insurance_type)}
                            {vehicle.insurance_expiry
                              ? ` · ${formatExpiryLabel(vehicle.insurance_expiry)}`
                              : ""}
                          </div>
                          <div className="col-6 col-md-4">
                            <span className="text-uppercase text-muted d-block" style={{ fontSize: "0.65rem" }}>
                              Inspection
                            </span>
                            {vehicleRequiresInspection(vehicle)
                              ? formatExpiryLabel(vehicle.inspection_expiry)
                              : "Not required (private)"}
                          </div>
                          <div className="col-6 col-md-4">
                            <span className="text-uppercase text-muted d-block" style={{ fontSize: "0.65rem" }}>
                              Next service @ km
                            </span>
                            {vehicle.next_service_odometer != null
                              ? vehicle.next_service_odometer.toLocaleString()
                              : "—"}
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="card-bordered">
                      <div className="card-inner">
                        <Nav tabs className="nav-tabs-mb-icon nav-tabs-card mb-3">
                          {[
                            { id: "fuel", label: "Fuel" },
                            { id: "cleaning", label: "Cleaning" },
                            { id: "service", label: "Service" },
                            { id: "maintenance", label: "Maintenance" },
                          ].map((tab) => (
                            <NavItem key={tab.id}>
                              <NavLink
                                tag="button"
                                type="button"
                                className={classnames({ active: activeTab === tab.id })}
                                onClick={() => setActiveTab(tab.id)}
                              >
                                {tab.label}
                              </NavLink>
                            </NavItem>
                          ))}
                        </Nav>

                        <TabContent activeTab={activeTab}>
                          <TabPane tabId="fuel">
                            {selected.last_fuel && (
                              <Alert color="light" className="py-2 small mb-3">
                                Last fuel: {formatExpiryLabel(selected.last_fuel.fuel_date)} — KSh{" "}
                                {selected.last_fuel.amount_ksh?.toLocaleString()}
                                {selected.days_since_fuel != null
                                  ? ` (${selected.days_since_fuel} days ago)`
                                  : ""}
                              </Alert>
                            )}
                            <div className="row g-3 mb-4">
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Date</Label>
                                  <Input
                                    type="date"
                                    className="fleet-touch-input"
                                    value={fuelForm.fuel_date}
                                    onChange={(e) =>
                                      setFuelForm({ ...fuelForm, fuel_date: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Amount (KSh)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    className="fleet-touch-input"
                                    value={fuelForm.amount_ksh}
                                    onChange={(e) =>
                                      setFuelForm({ ...fuelForm, amount_ksh: e.target.value })
                                    }
                                    placeholder="e.g. 5000"
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Liters (optional)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    className="fleet-touch-input"
                                    value={fuelForm.liters}
                                    onChange={(e) =>
                                      setFuelForm({ ...fuelForm, liters: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Odometer (optional)</Label>
                                  <Input
                                    type="number"
                                    className="fleet-touch-input"
                                    value={fuelForm.odometer}
                                    onChange={(e) =>
                                      setFuelForm({ ...fuelForm, odometer: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-8">
                                <FormGroup>
                                  <Label>Notes</Label>
                                  <Input
                                    value={fuelForm.notes}
                                    onChange={(e) =>
                                      setFuelForm({ ...fuelForm, notes: e.target.value })
                                    }
                                    placeholder="Station, receipt no., etc."
                                  />
                                </FormGroup>
                              </div>
                            </div>
                            <Button
                              color="primary"
                              className="fleet-btn-touch mb-4"
                              onClick={saveFuel}
                              disabled={saving}
                            >
                              {saving ? <Spinner size="sm" /> : "Save fuel log"}
                            </Button>
                            <h6 className="title mb-2">Fuel history</h6>
                            <HistoryTable
                              rows={fuelHistory}
                              columns={[
                                {
                                  key: "date",
                                  label: "Date",
                                  render: (r) => formatExpiryLabel(r.fuel_date),
                                },
                                {
                                  key: "amount",
                                  label: "Amount",
                                  render: (r) => `KSh ${Number(r.amount_ksh).toLocaleString()}`,
                                },
                                {
                                  key: "days",
                                  label: "Days since prev.",
                                  render: (r) =>
                                    r.days_since_previous != null
                                      ? `${r.days_since_previous} days`
                                      : "—",
                                },
                                {
                                  key: "by",
                                  label: "Recorded by",
                                  render: (r) => r.recorded_by_name || "—",
                                },
                              ]}
                            />
                          </TabPane>

                          <TabPane tabId="cleaning">
                            {selected.last_cleaning && (
                              <Alert color="light" className="py-2 small mb-3">
                                Last cleaning: {formatExpiryLabel(selected.last_cleaning.event_date)}
                              </Alert>
                            )}
                            <div className="row g-3 mb-3">
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Date</Label>
                                  <Input
                                    type="date"
                                    className="fleet-touch-input"
                                    value={cleanForm.event_date}
                                    onChange={(e) =>
                                      setCleanForm({ ...cleanForm, event_date: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-8">
                                <FormGroup>
                                  <Label>Notes</Label>
                                  <Input
                                    value={cleanForm.notes}
                                    onChange={(e) =>
                                      setCleanForm({ ...cleanForm, notes: e.target.value })
                                    }
                                    placeholder="Full wash, interior, etc."
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-12">
                                <label className="btn btn-outline-secondary fleet-camera-btn mb-0">
                                  <Icon name="camera" className="mr-1" />
                                  Photo (optional)
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="d-none"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const b64 = await readImageFileAsBase64(file);
                                      setCleanForm({ ...cleanForm, image: b64 });
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                            <Button
                              color="primary"
                              className="fleet-btn-touch mb-4"
                              onClick={() => saveMaintenance("car_wash", cleanForm)}
                              disabled={saving}
                            >
                              {saving ? <Spinner size="sm" /> : "Save cleaning"}
                            </Button>
                            <h6 className="title mb-2">Cleaning history</h6>
                            <HistoryTable
                              rows={cleaningRows}
                              columns={[
                                {
                                  key: "date",
                                  label: "Date",
                                  render: (r) => formatExpiryLabel(r.event_date),
                                },
                                {
                                  key: "notes",
                                  label: "Notes",
                                  render: (r) => r.description || "—",
                                },
                                {
                                  key: "photo",
                                  label: "Photo",
                                  render: (r) =>
                                    r.image_url ? (
                                      <a
                                        href={fleetImageUrl(r.image_url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        View
                                      </a>
                                    ) : (
                                      "—"
                                    ),
                                },
                              ]}
                            />
                          </TabPane>

                          <TabPane tabId="service">
                            {selected.last_service && (
                              <Alert color="light" className="py-2 small mb-3">
                                Last service: {formatExpiryLabel(selected.last_service.event_date)}
                                {selected.last_service.next_service_odometer
                                  ? ` — next @ ${selected.last_service.next_service_odometer.toLocaleString()} km`
                                  : ""}
                              </Alert>
                            )}
                            <div className="row g-3 mb-3">
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Service date</Label>
                                  <Input
                                    type="date"
                                    className="fleet-touch-input"
                                    value={serviceForm.event_date}
                                    onChange={(e) =>
                                      setServiceForm({ ...serviceForm, event_date: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Next service @ km</Label>
                                  <Input
                                    type="number"
                                    className="fleet-touch-input"
                                    value={serviceForm.next_service_odometer}
                                    onChange={(e) =>
                                      setServiceForm({
                                        ...serviceForm,
                                        next_service_odometer: e.target.value,
                                      })
                                    }
                                    placeholder="Odometer reading"
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Cost (KSh)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    className="fleet-touch-input"
                                    value={serviceForm.cost}
                                    onChange={(e) =>
                                      setServiceForm({ ...serviceForm, cost: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-12">
                                <FormGroup>
                                  <Label>Work done</Label>
                                  <Input
                                    value={serviceForm.description}
                                    onChange={(e) =>
                                      setServiceForm({
                                        ...serviceForm,
                                        description: e.target.value,
                                      })
                                    }
                                    placeholder="Oil change, filters, etc."
                                  />
                                </FormGroup>
                              </div>
                            </div>
                            <Button
                              color="primary"
                              className="fleet-btn-touch mb-4"
                              onClick={() => saveMaintenance("service", serviceForm)}
                              disabled={saving}
                            >
                              {saving ? <Spinner size="sm" /> : "Save service record"}
                            </Button>
                            <h6 className="title mb-2">Service history</h6>
                            <HistoryTable
                              rows={serviceRows}
                              columns={[
                                {
                                  key: "date",
                                  label: "Date",
                                  render: (r) => formatExpiryLabel(r.event_date),
                                },
                                {
                                  key: "next",
                                  label: "Next @ km",
                                  render: (r) =>
                                    r.next_service_odometer
                                      ? `${r.next_service_odometer.toLocaleString()} km`
                                      : "—",
                                },
                                {
                                  key: "cost",
                                  label: "Cost",
                                  render: (r) =>
                                    r.cost != null ? `KSh ${Number(r.cost).toLocaleString()}` : "—",
                                },
                                {
                                  key: "notes",
                                  label: "Notes",
                                  render: (r) => r.description || "—",
                                },
                              ]}
                            />
                          </TabPane>

                          <TabPane tabId="maintenance">
                            {selected.open_maintenance && (
                              <Alert color="warning" className="py-2 small mb-3">
                                Open repair: {selected.open_maintenance.description || "In garage"} (
                                since {formatExpiryLabel(selected.open_maintenance.event_date)})
                              </Alert>
                            )}
                            <div className="row g-3 mb-3">
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Type</Label>
                                  <Input
                                    type="select"
                                    className="fleet-touch-input"
                                    value={maintForm.maintenance_kind}
                                    onChange={(e) =>
                                      setMaintForm({
                                        ...maintForm,
                                        maintenance_kind: e.target.value,
                                        driver_name_at_event:
                                          e.target.value === "breakdown"
                                            ? maintForm.driver_name_at_event
                                            : "",
                                      })
                                    }
                                  >
                                    <option value="normal">Normal maintenance</option>
                                    <option value="breakdown">Breakdown</option>
                                  </Input>
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Date</Label>
                                  <Input
                                    type="date"
                                    className="fleet-touch-input"
                                    value={maintForm.event_date}
                                    onChange={(e) =>
                                      setMaintForm({ ...maintForm, event_date: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Cost (KSh)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    className="fleet-touch-input"
                                    value={maintForm.cost}
                                    onChange={(e) =>
                                      setMaintForm({ ...maintForm, cost: e.target.value })
                                    }
                                  />
                                </FormGroup>
                              </div>
                              <div className="col-md-4">
                                <FormGroup>
                                  <Label>Status</Label>
                                  <Input
                                    type="select"
                                    className="fleet-touch-input"
                                    value={maintForm.status}
                                    onChange={(e) =>
                                      setMaintForm({ ...maintForm, status: e.target.value })
                                    }
                                  >
                                    <option value="closed">Completed</option>
                                    <option value="open">In garage / ongoing</option>
                                  </Input>
                                </FormGroup>
                              </div>
                              {maintForm.maintenance_kind === "breakdown" && (
                                <div className="col-md-4">
                                  <FormGroup>
                                    <Label>Driver at breakdown</Label>
                                    <Input
                                      className="fleet-touch-input"
                                      value={maintForm.driver_name_at_event}
                                      onChange={(e) =>
                                        setMaintForm({
                                          ...maintForm,
                                          driver_name_at_event: e.target.value,
                                        })
                                      }
                                      placeholder="Driver name (manual)"
                                    />
                                    <small className="text-muted">
                                      Who was driving when the car broke down
                                    </small>
                                  </FormGroup>
                                </div>
                              )}
                              <div className="col-12">
                                <FormGroup>
                                  <Label>Description</Label>
                                  <Input
                                    value={maintForm.description}
                                    onChange={(e) =>
                                      setMaintForm({ ...maintForm, description: e.target.value })
                                    }
                                    placeholder="Brakes, tyres, body work…"
                                  />
                                </FormGroup>
                              </div>
                            </div>
                            <Button
                              color="primary"
                              className="fleet-btn-touch mb-4"
                              onClick={() => saveMaintenance("maintenance", maintForm)}
                              disabled={saving}
                            >
                              {saving ? <Spinner size="sm" /> : "Save maintenance"}
                            </Button>
                            <h6 className="title mb-2">Maintenance history</h6>
                            <HistoryTable
                              rows={maintenanceRows}
                              columns={[
                                {
                                  key: "date",
                                  label: "Date",
                                  render: (r) => formatExpiryLabel(r.event_date),
                                },
                                {
                                  key: "type",
                                  label: "Type",
                                  render: (r) =>
                                    r.maintenance_kind === "breakdown" ? (
                                      <Badge color="danger">Breakdown</Badge>
                                    ) : (
                                      <Badge color="secondary">Normal</Badge>
                                    ),
                                },
                                {
                                  key: "driver",
                                  label: "Driver",
                                  render: (r) => r.driver_name_at_event || "—",
                                },
                                {
                                  key: "status",
                                  label: "Status",
                                  render: (r) => (
                                    <Badge color={r.status === "open" ? "warning" : "success"}>
                                      {r.status === "open" ? "Open" : "Closed"}
                                    </Badge>
                                  ),
                                },
                                {
                                  key: "cost",
                                  label: "Cost",
                                  render: (r) =>
                                    r.cost != null ? `KSh ${Number(r.cost).toLocaleString()}` : "—",
                                },
                                {
                                  key: "notes",
                                  label: "Notes",
                                  render: (r) => r.description || "—",
                                },
                              ]}
                            />
                          </TabPane>
                        </TabContent>
                      </div>
                    </Card>
                  </>
                ) : (
                  <Alert color="warning">Select a vehicle.</Alert>
                )}
              </>
            )}
          </Block>
        </FleetPageLayout>
      </Content>
    </React.Fragment>
  );
};

export default FleetCare;
