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
} from "reactstrap";
import { format } from "date-fns";
import FleetAPI from "../../helpers/FleetAPI";
import FleetNav from "../../components/fleet/FleetNav";
import FleetPageLayout from "../../components/fleet/FleetPageLayout";
import { showError, showSuccess } from "../../utils/notifications";
import {
  fleetImageUrl,
  formatExpiryLabel,
  readImageFileAsBase64,
} from "../../utils/fleetRosterGroups";
import "../fleet/Fleet.css";

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

const CleaningForm = ({ vehicle, code, lastCleaning, onSaved }) => {
  const [eventDate, setEventDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readImageFileAsBase64(file);
    setPendingImage(base64);
    setPreview(base64);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await FleetAPI.saveMaintenance({
        vehicle_id: vehicle.id,
        event_type: "car_wash",
        event_date: eventDate,
        description: notes,
        ...(pendingImage ? { image: pendingImage } : {}),
        status: "closed",
      });
      if (res?.success) {
        showSuccess(`${code} cleaning recorded`);
        setNotes("");
        setPreview(null);
        setPendingImage(null);
        onSaved();
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
    <div className="fleet-odo-block">
      <FormGroup className="mb-2">
        <Label className="small mb-1">
          <strong>Cleaning date</strong>
        </Label>
        <Input
          type="date"
          className="fleet-touch-input"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
        />
      </FormGroup>
      <FormGroup className="mb-2">
        <Label className="small mb-1">
          <strong>Notes (optional)</strong>
        </Label>
        <Input
          type="text"
          className="fleet-touch-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. full wash, interior"
        />
      </FormGroup>
      <FormGroup className="mb-2">
        <Label className="small mb-1">
          <strong>Photo (optional)</strong>
        </Label>
        <label className="btn btn-outline-primary fleet-camera-btn mb-0">
          <Icon name="camera" className="mr-1" />
          {preview || lastCleaning?.image_url ? "Take / change photo" : "Attach cleaning photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="d-none"
            onChange={handleFile}
          />
        </label>
        {(preview || lastCleaning?.image_url) && (
          <img
            src={preview || fleetImageUrl(lastCleaning?.image_url)}
            alt="Cleaning"
            style={{
              display: "block",
              marginTop: 8,
              maxHeight: 120,
              maxWidth: "100%",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
        )}
        <small className="text-muted d-block mt-1">
          Date and notes are saved when you record cleaning. Photo is optional.
        </small>
      </FormGroup>
      <Button
        color="primary"
        className="fleet-btn-block-mobile fleet-btn-touch"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? <Spinner size="sm" /> : "Save cleaning record"}
      </Button>
    </div>
  );
};

const FleetCleaning = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState("PASSO");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await FleetAPI.getCleaningOverview();
      const list = res?.data || [];
      setItems(list);
      if (list.length && !list.find((x) => x.code === selectedCode)) {
        setSelectedCode(list[0].code);
      }
    } catch {
      setItems([]);
      showError("Failed to load cleaning records");
    } finally {
      setLoading(false);
    }
  }, [selectedCode]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = items.find((x) => x.code === selectedCode);

  return (
    <React.Fragment>
      <Head title="Car Cleaning" />
      <Content>
        <FleetPageLayout>
        <FleetNav />
        <BlockHead size="sm" className="fleet-page-head">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Car Cleaning</BlockTitle>
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
            <div className="text-center py-5">
              <Spinner color="primary" />
            </div>
          ) : (
            <>
              <Card className="card-bordered mb-3">
                <div className="card-inner">
                  <Label className="fw-bold mb-2">Select vehicle</Label>
                  <div className="fleet-vehicle-grid">
                    {items.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        className={`fleet-vehicle-card${
                          selectedCode === item.code ? " fleet-vehicle-card--active" : ""
                        }`}
                        onClick={() => setSelectedCode(item.code)}
                      >
                        <div className="fleet-plate">{item.code}</div>
                        <div className="fleet-meta">
                          {item.vehicle?.plate_number &&
                          !item.vehicle.plate_number.startsWith("TBD-") &&
                          item.vehicle.plate_number !== "—"
                            ? item.vehicle.plate_number
                            : "Plate TBD"}
                        </div>
                        {item.days_since_cleaning != null ? (
                          <div className="fleet-meta">
                            Last cleaned {item.days_since_cleaning} day
                            {item.days_since_cleaning !== 1 ? "s" : ""} ago
                          </div>
                        ) : (
                          <Badge color="warning" pill className="mt-1">
                            No cleaning recorded
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {selected ? (
                <>
                  <Card className="card-bordered mb-3">
                    <div className="card-inner">
                      <h6 className="title mb-3">Record cleaning — {selected.code}</h6>
                      {selected.last_cleaning ? (
                        <Alert color="light" className="py-2 small mb-3">
                          Last cleaning: {formatExpiryLabel(selected.last_cleaning.event_date)}
                          {selected.days_since_cleaning != null
                            ? ` (${selected.days_since_cleaning} days ago)`
                            : ""}
                        </Alert>
                      ) : null}
                      <CleaningForm
                        vehicle={selected.vehicle}
                        code={selected.code}
                        lastCleaning={selected.last_cleaning}
                        onSaved={load}
                      />
                    </div>
                  </Card>

                  <Card className="card-bordered">
                    <div className="card-inner">
                      <h6 className="title mb-3">Cleaning history — {selected.code}</h6>
                      {(selected.history || []).length === 0 ? (
                        <p className="text-muted mb-0">No cleaning records yet.</p>
                      ) : (
                        <>
                          <div className="fleet-history-table-wrap table-responsive">
                            <table className="table table-sm mb-0">
                              <thead style={{ background: "#f8f9fa", fontSize: "0.78rem" }}>
                                <tr>
                                  <th>Date</th>
                                  <th>Notes</th>
                                  <th>Photo</th>
                                  <th>Recorded by</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selected.history.map((row) => (
                                  <tr key={row.id}>
                                    <td style={{ whiteSpace: "nowrap" }}>
                                      {formatExpiryLabel(row.event_date)}
                                    </td>
                                    <td>{row.description || "—"}</td>
                                    <td>
                                      {row.image_url ? (
                                        <a
                                          href={fleetImageUrl(row.image_url)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <img
                                            src={fleetImageUrl(row.image_url)}
                                            alt="Cleaning"
                                            style={{
                                              height: 48,
                                              width: 64,
                                              objectFit: "cover",
                                              borderRadius: 4,
                                            }}
                                          />
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td>{row.recorded_by_name || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="fleet-history-cards">
                            {selected.history.map((row) => (
                              <div key={row.id} className="fleet-log-card-item">
                                <div className="fleet-log-card-item__date">
                                  {formatExpiryLabel(row.event_date)}
                                </div>
                                {row.description ? (
                                  <div className="fleet-log-card-item__row">
                                    <span>Notes</span>
                                    <span>{row.description}</span>
                                  </div>
                                ) : null}
                                {row.recorded_by_name ? (
                                  <div className="fleet-log-card-item__row">
                                    <span>Recorded by</span>
                                    <span>{row.recorded_by_name}</span>
                                  </div>
                                ) : null}
                                {row.image_url ? (
                                  <a
                                    href={fleetImageUrl(row.image_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="d-inline-block mt-2"
                                  >
                                    <img
                                      src={fleetImageUrl(row.image_url)}
                                      alt="Cleaning"
                                      style={{
                                        maxHeight: 100,
                                        maxWidth: "100%",
                                        borderRadius: 8,
                                        border: "1px solid #e5e7eb",
                                      }}
                                    />
                                  </a>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
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

export default FleetCleaning;
