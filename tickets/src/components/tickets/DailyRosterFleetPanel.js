import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import { Icon } from "../Component";
import FleetAPI from "../../helpers/FleetAPI";
import { showError, showSuccess } from "../../utils/notifications";
import {
  buildFleetVehicleRows,
  fleetDriverDisplayName,
  fleetImageUrl,
  fleetInsuranceTypeLabel,
  formatExpiryLabel,
  readImageFileAsBase64,
  resolveFleetDriverOptionId,
  vehicleRequiresInspection,
} from "../../utils/fleetRosterGroups";

const CODE_ACCENTS = {
  PASSO: "#6576ff",
  KDN: "#1ee0ac",
  KDS: "#f4bd0e",
  KDX: "#816bff",
};

const plateLabel = (vehicle) => {
  const plate = vehicle?.plate_number;
  if (!plate || plate === "—" || plate === "TBD" || plate.startsWith("TBD-")) {
    return "Plate TBD";
  }
  return plate;
};

const StepPill = ({ label, done }) => (
  <span className={`fleet-step-pill${done ? " fleet-step-pill--done" : ""}`}>
    {done ? <Icon name="check" className="mr-1" /> : null}
    {label}
  </span>
);

const OdometerBlock = ({ label, reading, onReadingChange, savedImage, onSave, saving, done }) => {
  const [preview, setPreview] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readImageFileAsBase64(file);
    setPendingImage(base64);
    setPreview(base64);
    e.target.value = "";
  };

  const handleSave = () => {
    onSave({
      reading,
      image: pendingImage,
      hasSavedImage: !!savedImage,
    });
    setPendingImage(null);
  };

  const displayImage = preview || savedImage;

  return (
    <div className={`fleet-odo-block${done ? " fleet-odo-block--done" : ""}`}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <Label className="small mb-0">
          <strong>{label}</strong>
        </Label>
        {done ? (
          <Badge color="success" pill className="fleet-odo-badge">
            Saved
          </Badge>
        ) : (
          <Badge color="light" pill className="fleet-odo-badge text-muted">
            Pending
          </Badge>
        )}
      </div>
      <Input
        type="number"
        placeholder="Reading in km"
        className="fleet-touch-input mb-2"
        value={reading}
        onChange={(e) => onReadingChange(e.target.value)}
      />
      <label className="btn btn-outline-light fleet-camera-btn mb-0 fleet-camera-btn--subtle">
        <Icon name="camera" className="mr-1" />
        {displayImage ? "Change photo" : "Photo (optional)"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="d-none"
          onChange={handleFile}
        />
      </label>
      {displayImage ? (
        <img
          src={typeof displayImage === "string" && displayImage.startsWith("data:")
            ? displayImage
            : fleetImageUrl(displayImage)}
          alt={label}
          className="fleet-odo-preview"
        />
      ) : null}
      <Button
        color={done ? "success" : "primary"}
        size="sm"
        outline={done}
        className="mt-2 fleet-btn-block-mobile fleet-btn-touch"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? <Spinner size="sm" /> : done ? `Update ${label.toLowerCase()}` : `Save ${label.toLowerCase()}`}
      </Button>
    </div>
  );
};

const VehicleRosterCard = ({ code, vehicle, rosterDate, driverOptions, onRefresh }) => {
  const [driverId, setDriverId] = useState("");
  const [startOdo, setStartOdo] = useState("");
  const [endOdo, setEndOdo] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [savingEnd, setSavingEnd] = useState(false);

  useEffect(() => {
    if (!vehicle) return;
    setDriverId(resolveFleetDriverOptionId(vehicle.daily_assignment, driverOptions));
    setStartOdo(vehicle.today_log?.start_odometer ?? vehicle.suggested_start ?? "");
    setEndOdo(vehicle.today_log?.end_odometer ?? "");
  }, [vehicle, driverOptions]);

  const savedDriverName = vehicle?.daily_assignment?.driver_name?.trim() || "";
  const hasMorning =
    vehicle?.today_log?.start_odometer != null && vehicle.today_log.start_odometer !== "";
  const hasEvening =
    vehicle?.today_log?.end_odometer != null && vehicle.today_log.end_odometer !== "";
  const hasDriver = !!savedDriverName;

  const dailyKm = useMemo(() => {
    const log = vehicle?.today_log;
    if (log?.distance_km != null && log.start_odometer != null && log.end_odometer != null) {
      return log.distance_km;
    }
    const s = log?.start_odometer ?? (startOdo !== "" ? Number(startOdo) : null);
    const e = log?.end_odometer ?? (endOdo !== "" ? Number(endOdo) : null);
    if (s != null && e != null && Number.isFinite(s) && Number.isFinite(e) && e >= s) {
      return e - s;
    }
    return null;
  }, [vehicle, startOdo, endOdo]);

  const accent = CODE_ACCENTS[code] || "#6576ff";

  if (!vehicle) {
    return (
      <Card className="fleet-vehicle-card-v2 mb-3">
        <div className="card-inner py-4 text-center">
          <Spinner color="primary" size="sm" />
          <p className="text-muted small mt-2 mb-0">Loading {code}…</p>
        </div>
      </Card>
    );
  }

  const handleAssign = async () => {
    if (!driverId) {
      showError("Select a driver from the list");
      return;
    }
    const option = driverOptions.find((o) => String(o.id) === String(driverId));
    const name = fleetDriverDisplayName(option);
    if (!name) {
      showError("Invalid driver selection");
      return;
    }
    setSavingAssign(true);
    try {
      const res = await FleetAPI.saveDailyAssignments({
        roster_date: rosterDate,
        assignments: [
          {
            vehicle_id: vehicle.id,
            driver_id: Number(driverId),
            driver_name: name,
            roster_team_title: code,
          },
        ],
      });
      if (res?.success) {
        showSuccess(`${code}: ${name} assigned`);
        onRefresh();
      } else {
        showError(res?.error || "Failed to save driver");
      }
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to save driver");
    } finally {
      setSavingAssign(false);
    }
  };

  const saveOdometer = async (type, { reading, image, hasSavedImage }) => {
    if (reading === "" || reading == null) {
      showError("Enter the odometer reading");
      return;
    }
    const setSaving = type === "start" ? setSavingStart : setSavingEnd;
    setSaving(true);
    try {
      const payload = {
        vehicle_id: vehicle.id,
        log_date: rosterDate,
      };
      if (type === "start") {
        payload.start_odometer = Number(reading);
        if (image) payload.start_odometer_image = image;
        if (endOdo !== "") payload.end_odometer = Number(endOdo);
      } else {
        payload.end_odometer = Number(reading);
        if (image) payload.end_odometer_image = image;
        if (startOdo !== "") payload.start_odometer = Number(startOdo);
      }
      const res = await FleetAPI.saveLog(payload);
      if (res?.success) {
        showSuccess(`${type === "start" ? "Morning" : "Evening"} odometer saved`);
        onRefresh();
      } else {
        showError(res?.error || "Failed to save");
      }
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="fleet-vehicle-card-v2 mb-3">
      <div className="fleet-vehicle-card-v2__header" style={{ borderLeftColor: accent }}>
        <div>
          <span className="fleet-vehicle-card-v2__code" style={{ background: accent }}>
            {code}
          </span>
          <span className="fleet-vehicle-card-v2__plate">{plateLabel(vehicle)}</span>
        </div>
        <div className="fleet-vehicle-card-v2__steps">
          <StepPill label="Driver" done={hasDriver} />
          <StepPill label="AM" done={hasMorning} />
          <StepPill label="PM" done={hasEvening} />
        </div>
      </div>

      <div className="card-inner pt-3 pb-3">
        <Row className="g-3">
          <Col xs="12" lg="4">
            <div className="fleet-info-grid">
              <div className="fleet-info-grid__item">
                <span className="fleet-info-grid__label">Last odometer</span>
                <span className="fleet-info-grid__value">
                  {vehicle.last_odometer != null
                    ? `${vehicle.last_odometer.toLocaleString()} km`
                    : "—"}
                </span>
              </div>
              <div className="fleet-info-grid__item">
                <span className="fleet-info-grid__label">Insurance</span>
                <span className="fleet-info-grid__value">
                  {fleetInsuranceTypeLabel(vehicle.insurance_type)}
                </span>
              </div>
              <div className="fleet-info-grid__item">
                <span className="fleet-info-grid__label">Inspection</span>
                <span className="fleet-info-grid__value">
                  {vehicleRequiresInspection(vehicle)
                    ? formatExpiryLabel(vehicle.inspection_expiry)
                    : "Not required"}
                </span>
              </div>
              <div className="fleet-info-grid__item">
                <span className="fleet-info-grid__label">Service @ km</span>
                <span className="fleet-info-grid__value">
                  {vehicle.next_service_odometer != null
                    ? vehicle.next_service_odometer.toLocaleString()
                    : "—"}
                </span>
              </div>
            </div>
          </Col>

          <Col xs="12" lg="8">
            <div className="fleet-driver-panel mb-3">
              <div className="fleet-driver-panel__head">
                <div>
                  <strong>Today&apos;s driver</strong>
                  {hasDriver ? (
                    <div className="fleet-driver-panel__saved">
                      <Icon name="user-check" className="text-success mr-1" />
                      {savedDriverName}
                    </div>
                  ) : (
                    <div className="text-muted small">Not assigned yet</div>
                  )}
                </div>
              </div>
              <FormGroup className="mb-0">
                <Label className="small text-muted mb-1">Technician / engineer</Label>
                <div className="fleet-driver-row">
                  <Input
                    type="select"
                    className="fleet-touch-input fleet-driver-select"
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                  >
                    <option value="">— Select driver —</option>
                    {driverOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name || opt.label}
                      </option>
                    ))}
                  </Input>
                  <Button
                    color="primary"
                    className="fleet-btn-touch fleet-btn-block-mobile"
                    onClick={handleAssign}
                    disabled={savingAssign || !driverId}
                  >
                    {savingAssign ? <Spinner size="sm" /> : "Assign driver"}
                  </Button>
                </div>
              </FormGroup>
            </div>

            <Row className="g-2">
              <Col md="6">
                <OdometerBlock
                  label="Morning odometer"
                  reading={startOdo}
                  onReadingChange={setStartOdo}
                  savedImage={vehicle.today_log?.start_odometer_image}
                  onSave={(data) => saveOdometer("start", data)}
                  saving={savingStart}
                  done={hasMorning}
                />
              </Col>
              <Col md="6">
                <OdometerBlock
                  label="Evening odometer"
                  reading={endOdo}
                  onReadingChange={setEndOdo}
                  savedImage={vehicle.today_log?.end_odometer_image}
                  onSave={(data) => saveOdometer("end", data)}
                  saving={savingEnd}
                  done={hasEvening}
                />
              </Col>
            </Row>

            {dailyKm != null && (
              <div className="fleet-distance-hero mt-3">
                <span className="fleet-distance-hero__label">Distance today</span>
                <span className="fleet-distance-hero__value">{dailyKm.toLocaleString()} km</span>
              </div>
            )}
          </Col>
        </Row>
      </div>
    </Card>
  );
};

const DailyRosterFleetPanel = ({ rosterDate, driverOptions = [], embedded = false }) => {
  const [loading, setLoading] = useState(false);
  const [fleetData, setFleetData] = useState(null);

  const loadFleet = useCallback(async () => {
    if (!rosterDate) return;
    setLoading(true);
    try {
      const res = await FleetAPI.getRosterDay(rosterDate);
      if (res?.data) setFleetData(res.data);
    } catch {
      showError("Failed to load vehicles for this date");
    } finally {
      setLoading(false);
    }
  }, [rosterDate]);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  const mergedGroups = useMemo(
    () => buildFleetVehicleRows([], fleetData?.groups),
    [fleetData]
  );

  const dayStats = useMemo(() => {
    let drivers = 0;
    let morning = 0;
    let evening = 0;
    let totalKm = 0;
    mergedGroups.forEach((g) => {
      const v = g.vehicle;
      if (!v) return;
      if (v.daily_assignment?.driver_name) drivers += 1;
      if (v.today_log?.start_odometer != null) morning += 1;
      if (v.today_log?.end_odometer != null) evening += 1;
      if (v.today_log?.distance_km != null) totalKm += v.today_log.distance_km;
    });
    return { drivers, morning, evening, totalKm, total: mergedGroups.length };
  }, [mergedGroups]);

  if (loading && !fleetData) {
    const loadingEl = (
      <div className="text-center py-5">
        <Spinner color="primary" />
      </div>
    );
    if (embedded) return loadingEl;
    return (
      <Card className="card-bordered mt-4">
        <div className="card-inner">{loadingEl}</div>
      </Card>
    );
  }

  const summaryBar = (
    <div className="fleet-day-summary mb-3">
      <div className="fleet-day-summary__item">
        <span className="fleet-day-summary__value">
          {dayStats.drivers}/{dayStats.total}
        </span>
        <span className="fleet-day-summary__label">Drivers assigned</span>
      </div>
      <div className="fleet-day-summary__item">
        <span className="fleet-day-summary__value">
          {dayStats.morning}/{dayStats.total}
        </span>
        <span className="fleet-day-summary__label">Morning logged</span>
      </div>
      <div className="fleet-day-summary__item">
        <span className="fleet-day-summary__value">
          {dayStats.evening}/{dayStats.total}
        </span>
        <span className="fleet-day-summary__label">Evening logged</span>
      </div>
      <div className="fleet-day-summary__item fleet-day-summary__item--highlight">
        <span className="fleet-day-summary__value">{dayStats.totalKm.toLocaleString()} km</span>
        <span className="fleet-day-summary__label">Total distance</span>
      </div>
    </div>
  );

  const vehicleCards = mergedGroups.map((group) => (
    <VehicleRosterCard
      key={group.code}
      code={group.code}
      vehicle={group.vehicle}
      rosterDate={rosterDate}
      driverOptions={driverOptions}
      onRefresh={loadFleet}
    />
  ));

  if (embedded) {
    return (
      <>
        {summaryBar}
        {vehicleCards}
      </>
    );
  }

  return (
    <Card className="card-bordered mt-4">
      <div className="card-inner">
        <h6 className="title mb-1">Vehicles — {rosterDate}</h6>
        <p className="text-muted small mb-3">
          PASSO, KDN, KDS, KDX — assign driver, log odometer, track daily km.
        </p>
        {summaryBar}
        {vehicleCards}
      </div>
    </Card>
  );
};

export default DailyRosterFleetPanel;
