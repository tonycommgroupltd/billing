import React, { useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "react-data-table-component";
import { Badge, Modal, ModalBody, ModalHeader, Spinner } from "reactstrap";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";
import { loadPackageUsage } from "../../helpers/packageUsageClient";
import "./PackageUsage.css";

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `KES ${amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
};

const speedChip = (title) => {
  const match = String(title || "").match(/^(\d+(?:\.\d+)?)\s*(Mbps|Gbps)$/i);
  if (!match) return "PKG";
  return `${match[1]}${match[2].charAt(0).toUpperCase()}`;
};

const tableStyles = {
  headRow: {
    style: {
      minHeight: "44px",
      backgroundColor: "#f7f9fc",
      borderBottom: "1px solid #e3e8ef",
    },
  },
  headCells: {
    style: {
      color: "#6b7c93",
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      paddingLeft: "14px",
      paddingRight: "14px",
    },
  },
  rows: {
    style: {
      minHeight: "62px",
      borderBottomColor: "#edf1f7",
      cursor: "pointer",
    },
    highlightOnHoverStyle: {
      backgroundColor: "#f8fafc",
      borderBottomColor: "#edf1f7",
      outline: "none",
    },
  },
  cells: {
    style: {
      color: "#364a63",
      fontSize: "13px",
      paddingTop: "10px",
      paddingBottom: "10px",
      paddingLeft: "14px",
      paddingRight: "14px",
    },
  },
};

const PackageUsage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadPackageUsage({ includeEmpty: showEmpty });
      setSummary(result.summary);
      setRows(result.data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load package usage");
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [showEmpty]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const names = (row.name_breakdown || []).map((v) => v.title).join(" ");
      return [row.title, row.price, names]
        .filter((v) => v != null && v !== "")
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search]);

  const openDetails = (plan) => {
    setSelectedPlan(plan);
    setDetailOpen(true);
  };

  const closeDetails = () => {
    setDetailOpen(false);
    setSelectedPlan(null);
  };

  const summaryCards = [
    { label: "Packages", value: summary?.plans ?? 0, icon: "package", tone: "" },
    { label: "Customers", value: summary?.customers ?? 0, icon: "users", tone: "" },
    { label: "Online", value: summary?.online ?? 0, icon: "wifi", tone: "is-online" },
    { label: "Offline", value: summary?.offline ?? 0, icon: "minus-circle", tone: "is-offline" },
    { label: "Active", value: summary?.active ?? 0, icon: "check-circle", tone: "" },
    { label: "Expired", value: summary?.expired ?? 0, icon: "clock", tone: "is-expired" },
  ];

  const breakdown = selectedPlan?.name_breakdown || [];

  const columns = useMemo(
    () => [
      {
        name: "Package",
        grow: 2,
        selector: (row) => row.title,
        sortable: true,
        cell: (row) => (
          <div className="pkg-pkg-cell">
            <div className="pkg-speed-badge">{speedChip(row.title)}</div>
            <div>
              <div className="pkg-strong">{row.title}</div>
              <div className="pkg-muted">{formatMoney(row.price)}</div>
            </div>
          </div>
        ),
      },
      {
        name: "Customers",
        width: "110px",
        selector: (row) => row.customer_count,
        sortable: true,
        center: true,
        cell: (row) => <span className="fw-bold">{Number(row.customer_count || 0).toLocaleString()}</span>,
      },
      {
        name: "Services",
        width: "100px",
        selector: (row) => row.service_count,
        sortable: true,
        center: true,
        cell: (row) => Number(row.service_count || 0).toLocaleString(),
      },
      {
        name: "Online",
        width: "100px",
        selector: (row) => row.online_count,
        sortable: true,
        center: true,
        cell: (row) => <Badge color="success" className="badge-dim">{row.online_count || 0}</Badge>,
      },
      {
        name: "Offline",
        width: "100px",
        selector: (row) => row.offline_count,
        sortable: true,
        center: true,
        cell: (row) => <Badge color="warning" className="badge-dim">{row.offline_count || 0}</Badge>,
      },
      {
        name: "Expired",
        width: "100px",
        selector: (row) => row.expired_count,
        sortable: true,
        center: true,
        cell: (row) => <Badge color="light">{row.expired_count || 0}</Badge>,
      },
      {
        name: "",
        width: "118px",
        right: true,
        cell: (row) => (
          <Button
            size="sm"
            color="primary"
            outline
            className="btn-dim"
            onClick={(e) => {
              e.stopPropagation();
              openDetails(row);
            }}
          >
            Details
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <React.Fragment>
      <Head title="Package Usage" />
      <Content>
        <div className="pkg-page">
          <BlockHead size="sm">
            <BlockBetween className="g-3">
              <BlockHeadContent>
                <div className="pkg-kicker">Tariffs · Analytics</div>
                <div className="d-flex align-items-center mt-1">
                  <div className="pkg-head-icon">
                    <Icon name="package" />
                  </div>
                  <div>
                    <BlockTitle page tag="h3" className="mb-0">
                      Package Usage
                    </BlockTitle>
                    <p className="pkg-blurb mb-0">
                      Unique packages by speed and price. Click any row for the plan-name breakdown.
                    </p>
                  </div>
                </div>
              </BlockHeadContent>
              <BlockHeadContent>
                <Button color="primary" onClick={load} disabled={loading}>
                  <Icon name="reload" className={loading ? "spinning" : ""} />
                  <span>Refresh</span>
                </Button>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            <div className="pkg-stat-strip">
              {summaryCards.map((card) => (
                <div key={card.label} className={`pkg-stat ${card.tone}`.trim()}>
                  <span className="pkg-stat-label">
                    <Icon name={card.icon} />
                    {card.label}
                  </span>
                  <span className="pkg-stat-value">
                    {loading ? "—" : Number(card.value || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {error ? <div className="alert alert-danger">{error}</div> : null}

            <PreviewCard bodyClass="p-0 pkg-table-card">
              <div className="pkg-toolbar">
                <div>
                  <h6 className="pkg-toolbar-title">Packages</h6>
                  <span className="pkg-muted">
                    {filteredRows.length.toLocaleString()} package
                    {filteredRows.length === 1 ? "" : "s"}
                    {search ? ` matching “${search}”` : ""}
                  </span>
                </div>
                <div className="pkg-toolbar-controls">
                  <label className="pkg-check">
                    <input
                      type="checkbox"
                      checked={showEmpty}
                      onChange={(e) => setShowEmpty(e.target.checked)}
                    />
                    Show empty packages
                  </label>
                  <div className="pkg-search">
                    <Icon name="search" className="pkg-search-icon" />
                    <input
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Search package..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search packages"
                    />
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="pkg-empty">
                  <Spinner color="primary" size="sm" className="me-2" />
                  <span className="pkg-muted">Loading packages…</span>
                </div>
              ) : (
                <DataTable
                  data={filteredRows}
                  columns={columns}
                  noHeader
                  highlightOnHover
                  pointerOnHover
                  persistTableHead
                  responsive
                  keyField="group_key"
                  customStyles={tableStyles}
                  onRowClicked={(row) => openDetails(row)}
                  noDataComponent={
                    <div className="pkg-empty">
                      <div className="pkg-empty-icon">
                        <Icon name="package" />
                      </div>
                      <h6 className="mb-1">No packages found</h6>
                      <p className="pkg-muted mb-0">
                        {search ? "Try a different search." : "No packages match the current options."}
                      </p>
                    </div>
                  }
                />
              )}
            </PreviewCard>
          </Block>
        </div>
      </Content>

      <Modal
        isOpen={detailOpen}
        toggle={closeDetails}
        className="modal-dialog-centered pkg-modal"
        size="lg"
      >
        <ModalHeader toggle={closeDetails}>
          <div className="pkg-modal-kicker">Package details</div>
          <div className="pkg-modal-title">{selectedPlan?.title || "Package"}</div>
          <div className="pkg-modal-price">{formatMoney(selectedPlan?.price)}</div>
        </ModalHeader>
        <ModalBody>
          <div className="pkg-summary-grid">
            <div className="pkg-summary-item">
              <div className="label">Customers</div>
              <div className="value">{(selectedPlan?.customer_count || 0).toLocaleString()}</div>
            </div>
            <div className="pkg-summary-item">
              <div className="label">Services</div>
              <div className="value">{(selectedPlan?.service_count || 0).toLocaleString()}</div>
            </div>
            <div className="pkg-summary-item is-online">
              <div className="label">Online</div>
              <div className="value">{(selectedPlan?.online_count || 0).toLocaleString()}</div>
            </div>
            <div className="pkg-summary-item is-offline">
              <div className="label">Offline</div>
              <div className="value">{(selectedPlan?.offline_count || 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="pkg-section-label">Plan names used for this package</div>

          {!breakdown.length ? (
            <div className="text-center text-soft py-4">No detail names for this package.</div>
          ) : (
            <div className="table-responsive pkg-breakdown">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Plan name</th>
                    <th className="text-end">Customers</th>
                    <th className="text-end">Services</th>
                    <th className="text-end">Online</th>
                    <th className="text-end">Offline</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((item) => (
                    <tr key={item.title}>
                      <td className="fw-medium">{item.title}</td>
                      <td className="text-end fw-bold">{item.customer_count ?? 0}</td>
                      <td className="text-end">{item.service_count ?? 0}</td>
                      <td className="text-end">
                        <Badge color="success" className="badge-dim">
                          {item.online_count ?? 0}
                        </Badge>
                      </td>
                      <td className="text-end">
                        <Badge color="warning" className="badge-dim">
                          {item.offline_count ?? 0}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModalBody>
      </Modal>
    </React.Fragment>
  );
};

export default PackageUsage;
