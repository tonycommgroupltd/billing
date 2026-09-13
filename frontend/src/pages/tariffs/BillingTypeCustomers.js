import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "react-data-table-component";
import { Badge, Alert, Spinner } from "reactstrap";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  PreviewCard,
  Button,
  DataTablePagination,
  Icon,
} from "../../components/Component";
import { http } from "../../helpers";
import { downloadCompanyExcel } from "../../helpers/companyExcel";
import "./BillingTypeCustomers.css";

const BILLING_CONFIG = {
  recurring: {
    value: 1,
    title: "Recurring",
    blurb: "Invoice-based customers billed weekly, bi-weekly, or monthly.",
    icon: "repeat",
    accent: "primary",
  },
  prepaid: {
    value: 2,
    title: "Prepaid",
    blurb: "Customers who pay before their service period begins.",
    icon: "wallet",
    accent: "warning",
  },
};

const FILTER_OPTIONS = [
  { id: "all", label: "All", statKey: "total", icon: "users" },
  { id: "active", label: "Active", statKey: "active", icon: "check-circle" },
  { id: "online", label: "Online", statKey: "online", icon: "wifi" },
  {
    id: "online_credit",
    label: "Online · Credit",
    statKey: "online_credit",
    icon: "coins",
    featured: true,
  },
  { id: "expired", label: "Expired", statKey: "expired", icon: "clock" },
  { id: "disabled", label: "Disabled", statKey: "disabled", icon: "na" },
];

const PAYMENT_DATE_SORT_OPTIONS = [
  { id: "", label: "Last payment: default" },
  { id: "newest", label: "Last payment: newest" },
  { id: "oldest", label: "Last payment: oldest" },
];

function matchingServices(services = [], billingValue) {
  return services.filter((service) => {
    const value = service.billing_type?.value;
    if (billingValue === 2) return Number(value) === 2;
    return value == null || Number(value) === 1;
  });
}

function getCustomerStatus(services = []) {
  if (!services.length) return { label: "No service", color: "light" };
  if (services.some((s) => s.online === 1)) return { label: "Online", color: "success" };
  if (services.some((s) => s.status?.value === 2)) return { label: "Active", color: "primary" };
  if (services.some((s) => s.status?.value === 3)) return { label: "Expired", color: "warning" };
  if (services.some((s) => s.status?.value === 1)) return { label: "Disabled", color: "secondary" };
  return { label: services[0]?.status?.label || "Unknown", color: "secondary" };
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `KES ${amount.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function paymentRisk(row, billingValue) {
  const services = matchingServices(row.services || [], billingValue);
  const scoped = services.length ? services : row.services || [];
  const activeOrOnline = scoped.some((s) => s.online === 1 || s.status?.value === 2);
  if (!activeOrOnline) return null;
  const pay = row.last_payment;
  if (!pay) return "No payment on record";
  const billTo = scoped[0]?.bill_to ? new Date(scoped[0].bill_to) : null;
  const payDate = pay.date ? new Date(pay.date) : null;
  if (billTo && !Number.isNaN(billTo.getTime()) && billTo < new Date()) {
    if (!payDate || payDate < billTo) return "Active but overdue";
  }
  return null;
}

function rowToExport(row, billingValue, creditView) {
  const services = matchingServices(row.services || [], billingValue);
  const list = services.length ? services : row.services || [];
  const primary = list[0] || {};
  const status = getCustomerStatus(list.length ? list : row.services || []);
  const pay = row.last_payment || {};
  const online = list.some((service) => service.online === 1);

  if (creditView) {
    return {
      customer_id: row.id ?? "",
      customer: row.name || "",
      phone: row.phone_number || "",
      plan: primary.plan_title || "",
      login: primary.mikrotik_name || "",
      due_date: primary.bill_to ? formatDate(primary.bill_to) : "",
      credit_amount: pay.sum ?? "",
      credit_date: pay.date ? formatDate(pay.date) : "",
      granted_by: pay.granted_by || "Not recorded",
      credit_reason: pay.reason || "",
      online: online ? "Yes" : "No",
      remote_ip: primary.mikrotik_ipv4 || "",
      balance: row.balance ?? "",
    };
  }

  return {
    customer_id: row.id ?? "",
    customer: row.name || "",
    phone: row.phone_number || "",
    email: row.email || "",
    plan: primary.plan_title || "",
    login: primary.mikrotik_name || "",
    price: primary.price ?? primary.formatted_price ?? "",
    period: primary.billing_period?.label || "",
    status: status.label,
    due_date: primary.bill_to ? formatDate(primary.bill_to) : "",
    balance: row.balance ?? "",
    online: online ? "Yes" : "No",
    remote_ip: primary.mikrotik_ipv4 || "",
    last_payment_amount: pay.sum ?? "",
    last_payment_date: pay.date ? formatDate(pay.date) : "",
    payment_type: pay.payment_type_label || pay.payment_type || "",
    payment_reason: pay.reason || pay.trans_id || "",
    granted_by: pay.granted_by || "",
    risk: paymentRisk(row, billingValue) || "",
  };
}

function exportColumns(creditView) {
  if (creditView) {
    return [
      { key: "customer_id", header: "Customer ID", width: 12 },
      { key: "customer", header: "Customer", width: 24 },
      { key: "phone", header: "Phone", width: 14 },
      { key: "plan", header: "Plan", width: 18 },
      { key: "login", header: "Login", width: 16 },
      { key: "due_date", header: "Due date", width: 14 },
      { key: "credit_amount", header: "Credit amount", width: 14 },
      { key: "credit_date", header: "Credit date", width: 14 },
      { key: "granted_by", header: "Granted by", width: 18 },
      { key: "credit_reason", header: "Credit reason", width: 32 },
      { key: "online", header: "Online", width: 10 },
      { key: "remote_ip", header: "Remote IP", width: 14 },
      { key: "balance", header: "Balance", width: 12 },
    ];
  }

  return [
    { key: "customer_id", header: "Customer ID", width: 12 },
    { key: "customer", header: "Customer", width: 24 },
    { key: "phone", header: "Phone", width: 14 },
    { key: "email", header: "Email", width: 22 },
    { key: "plan", header: "Plan", width: 18 },
    { key: "login", header: "Login", width: 16 },
    { key: "price", header: "Price", width: 12 },
    { key: "period", header: "Period", width: 12 },
    { key: "status", header: "Status", width: 12 },
    { key: "due_date", header: "Due date", width: 14 },
    { key: "balance", header: "Balance", width: 12 },
    { key: "online", header: "Online", width: 10 },
    { key: "remote_ip", header: "Remote IP", width: 14 },
    { key: "last_payment_amount", header: "Last payment", width: 14 },
    { key: "last_payment_date", header: "Paid on", width: 14 },
    { key: "payment_type", header: "Payment type", width: 12 },
    { key: "payment_reason", header: "Payment reason", width: 28 },
    { key: "granted_by", header: "Granted by", width: 16 },
    { key: "risk", header: "Risk", width: 16 },
  ];
}

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

const BillingTypeCustomers = ({ type = "recurring" }) => {
  const config = BILLING_CONFIG[type] || BILLING_CONFIG.recurring;

  const [data, setData] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    online: 0,
    online_credit: 0,
    expired: 0,
    disabled: 0,
  });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [sort, setSort] = useState("asc");
  const [sortCol, setSortCol] = useState("id");
  const [searchText, setSearchText] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [paymentDateSort, setPaymentDateSort] = useState("");
  const [onuLoadingId, setOnuLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const creditView = filter === "online_credit";
  const activeFilterMeta = FILTER_OPTIONS.find((item) => item.id === filter) || FILTER_OPTIONS[0];

  const runPhoneSearch = useCallback(() => {
    setSearchText(searchDraft.trim());
    setPage(1);
  }, [searchDraft]);

  const clearPhoneSearch = useCallback(() => {
    setSearchDraft("");
    setSearchText("");
    setPage(1);
  }, []);

  useEffect(() => {
    setFilter("all");
    setPaymentDateSort("");
    setPage(1);
    setSearchDraft("");
    setSearchText("");
  }, [config.value]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await http.get("/list-customers-by-billing-type", {
        params: {
          billing_type: config.value,
          filter,
          payment_date_sort: paymentDateSort || undefined,
          q: searchText,
          page,
          per_page: perPage,
          sort_col: sortCol,
          sort,
        },
      });
      setData(response.data.data || []);
      setTotalRows(response.data.total || 0);
      setStats(
        response.data.stats || {
          total: 0,
          active: 0,
          online: 0,
          online_credit: 0,
          expired: 0,
          disabled: 0,
        }
      );
    } catch (err) {
      setData([]);
      setTotalRows(0);
      const status = err?.response?.status;
      if (status === 404) {
        setError("Billing-type API is not deployed on the server yet. Contact admin to deploy the latest backend.");
      } else {
        setError(err?.response?.data?.message || err?.message || "Failed to load customers");
      }
    } finally {
      setLoading(false);
    }
  }, [config.value, filter, paymentDateSort, searchText, page, perPage, sortCol, sort]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const exportExcel = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const pageSize = 200;
      let currentPage = 1;
      let totalPages = 1;
      const rows = [];

      while (currentPage <= totalPages) {
        const response = await http.get("/list-customers-by-billing-type", {
          params: {
            billing_type: config.value,
            filter,
            payment_date_sort: paymentDateSort || undefined,
            q: searchText,
            page: currentPage,
            per_page: pageSize,
            sort_col: sortCol,
            sort,
          },
        });
        const chunk = response.data.data || [];
        rows.push(...chunk);
        totalPages = Math.max(1, Number(response.data.total_pages) || 1);
        if (!chunk.length) break;
        currentPage += 1;
        if (currentPage > 100) break; // hard safety: max 20k rows
      }

      if (!rows.length) {
        window.alert("No customers to export for this filter.");
        return;
      }

      const isCredit = filter === "online_credit";
      const exportRows = rows.map((row) => rowToExport(row, config.value, isCredit));
      const filterLabel = activeFilterMeta.label || filter;
      const stamp = new Date().toISOString().slice(0, 10);
      const filterSlug = String(filterLabel)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await downloadCompanyExcel({
        companyName: "TonyComm Group Ltd",
        title: `${config.title} customers`,
        subtitle: `${filterLabel} list · ${exportRows.length.toLocaleString()} record${
          exportRows.length === 1 ? "" : "s"
        }${searchText ? ` · search “${searchText}”` : ""}`,
        sheetName: filterLabel.slice(0, 31),
        columns: exportColumns(isCredit),
        rows: exportRows,
        fileName: `TonyComm-${config.title.toLowerCase()}-${filterSlug}-${stamp}`,
        meta: [
          { label: "Billing type", value: config.title },
          { label: "Filter", value: filterLabel },
          { label: "Records", value: exportRows.length.toLocaleString() },
          {
            label: "Exported",
            value: new Date().toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ],
      });
    } catch (err) {
      window.alert(err?.response?.data?.message || err?.message || "Failed to export Excel");
    } finally {
      setExporting(false);
    }
  }, [
    exporting,
    config.value,
    config.title,
    filter,
    paymentDateSort,
    searchText,
    sortCol,
    sort,
    activeFilterMeta.label,
  ]);

  const selectFilter = (next) => {
    setFilter(next);
    setPage(1);
  };

  const selectPaymentDateSort = (next) => {
    setPaymentDateSort(next);
    setPage(1);
  };

  const openOnuWeb = async (row) => {
    const services = matchingServices(row.services || [], config.value);
    const service = services[0] || row.services?.[0];
    if (!service?.id) {
      window.alert("No internet service found for this customer.");
      return;
    }
    setOnuLoadingId(service.id);
    try {
      const response = await http.get(`/services/${service.id}/onu-web-access`);
      const payload = response.data || {};
      if (!payload.ok || !payload.url) {
        window.alert(payload.message || "Could not open ONU web UI.");
        return;
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.alert(err?.response?.data?.message || err?.message || "Failed to open ONU.");
    } finally {
      setOnuLoadingId(null);
    }
  };

  const columns = useMemo(() => {
    const base = [
      {
        id: 1,
        name: "Customer",
        cell: (row) => (
          <div className="btc-customer-cell">
            <div className={`btc-avatar bg-${config.accent}-dim text-${config.accent}`}>
              <span>{String(row.name || "?").trim().charAt(0).toUpperCase()}</span>
            </div>
            <div className="btc-customer-meta">
              <Link className="btc-customer-name" to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.id}`}>
                {row.name || "Unnamed customer"}
              </Link>
              <span className="btc-muted">#{row.id} · {row.phone_number || "No phone"}</span>
            </div>
          </div>
        ),
        selector: (row) => row.name,
        minWidth: "240px",
        sortable: true,
        ref: "name",
      },
      {
        id: 2,
        name: "Plan",
        cell: (row) => {
          const services = matchingServices(row.services || [], config.value);
          const list = services.length ? services : row.services || [];
          const primary = list[0];
          return (
            <div>
              <div className="btc-strong">{primary?.plan_title || "No plan"}</div>
              <div className="btc-muted">
                {primary?.mikrotik_name || "No login"}
                {list.length > 1 ? ` · +${list.length - 1}` : ""}
              </div>
            </div>
          );
        },
        minWidth: "170px",
        wrap: true,
      },
      {
        id: 3,
        name: "Billing",
        cell: (row) => {
          const list = matchingServices(row.services || [], config.value);
          const service = list[0] || row.services?.[0];
          return (
            <div>
              <div className="btc-strong">{formatMoney(service?.price ?? service?.formatted_price)}</div>
              <div className="btc-muted">{service?.billing_period?.label || config.title}</div>
            </div>
          );
        },
        minWidth: "120px",
        omit: creditView,
      },
      {
        id: 4,
        name: "Status",
        cell: (row) => {
          const scoped = matchingServices(row.services || [], config.value);
          const status = getCustomerStatus(scoped.length ? scoped : row.services);
          return <Badge color={status.color} pill className="btc-badge">{status.label}</Badge>;
        },
        minWidth: "110px",
        omit: creditView,
      },
      {
        id: 5,
        name: "Due date",
        cell: (row) => {
          const scoped = matchingServices(row.services || [], config.value);
          const due = scoped[0]?.bill_to || row.services?.[0]?.bill_to;
          const overdue = due && new Date(due) < new Date();
          return (
            <div>
              <div className={overdue ? "text-danger fw-medium" : "btc-strong"}>{formatDate(due)}</div>
              {overdue ? <div className="btc-muted text-danger">Past due</div> : null}
            </div>
          );
        },
        minWidth: "120px",
      },
      {
        id: 6,
        name: "Credit amount",
        cell: (row) => {
          const pay = row.last_payment;
          if (!pay || String(pay.payment_type).toLowerCase() !== "credit") {
            return <span className="btc-muted">—</span>;
          }
          return (
            <div>
              <div className="btc-strong">{formatMoney(pay.sum)}</div>
              <div className="btc-muted">{formatDate(pay.date)}</div>
            </div>
          );
        },
        minWidth: "130px",
        omit: !creditView,
      },
      {
        id: 7,
        name: "Granted by",
        cell: (row) => {
          const pay = row.last_payment;
          const by = pay?.granted_by;
          return by ? <span className="btc-strong">{by}</span> : <span className="btc-muted">Not recorded</span>;
        },
        minWidth: "140px",
        omit: !creditView,
      },
      {
        id: 8,
        name: "Credit reason",
        cell: (row) => {
          const pay = row.last_payment;
          const reason = pay?.reason;
          if (!reason) return <span className="btc-muted">—</span>;
          return (
            <div className="btc-reason" title={reason}>
              {reason}
            </div>
          );
        },
        minWidth: "220px",
        wrap: true,
        omit: !creditView,
      },
      {
        id: 9,
        name: "Balance",
        cell: (row) => (
          <span className={`fw-bold ${Number(row.balance) < 0 ? "text-danger" : "btc-strong"}`}>
            {formatMoney(row.balance)}
          </span>
        ),
        minWidth: "110px",
        omit: creditView,
      },
      {
        id: 10,
        name: "Last payment",
        cell: (row) => {
          const pay = row.last_payment;
          const risk = paymentRisk(row, config.value);
          if (!pay) {
            return (
              <div>
                <div className="btc-muted">Never paid</div>
                {risk ? (
                  <Badge color="danger" pill className="btc-badge-sm mt-1">
                    {risk}
                  </Badge>
                ) : null}
              </div>
            );
          }
          return (
            <div>
              <div className="btc-strong">{formatMoney(pay.sum)}</div>
              <div className="btc-muted">
                {formatDate(pay.date)} · {pay.payment_type_label || pay.payment_type}
              </div>
              {risk ? (
                <Badge color="warning" pill className="btc-badge-sm mt-1">
                  {risk}
                </Badge>
              ) : null}
            </div>
          );
        },
        minWidth: "150px",
        omit: creditView,
      },
      {
        id: 11,
        name: "Paid via / reason",
        cell: (row) => {
          const pay = row.last_payment;
          if (!pay) return <span className="btc-muted">—</span>;
          const type = String(pay.payment_type || "").toLowerCase();
          const label = pay.payment_type_label || (type ? type.charAt(0).toUpperCase() + type.slice(1) : "Payment");
          const reason = pay.reason || pay.trans_id || null;
          return (
            <div className="btc-reason-wrap">
              <div className="btc-strong">{label}</div>
              {pay.granted_by ? <div className="btc-muted">By {pay.granted_by}</div> : null}
              {reason ? (
                <div className="btc-reason" title={reason}>
                  {reason}
                </div>
              ) : (
                <div className="btc-muted">No reason recorded</div>
              )}
            </div>
          );
        },
        minWidth: "190px",
        wrap: true,
        omit: creditView,
      },
      {
        id: 12,
        name: "Connection",
        cell: (row) => {
          const services = matchingServices(row.services || [], config.value);
          const online = services.some((service) => service.online === 1);
          const ips = services.map((s) => s.mikrotik_ipv4).filter(Boolean);
          const service = services[0] || row.services?.[0];
          return (
            <div>
              <span className={`dot dot-${online ? "success" : "gray"} me-1`} />
              <span className={online ? "text-success fw-medium" : "btc-muted"}>
                {online ? "Online" : "Offline"}
              </span>
              {ips.length ? <div className="btc-muted">{ips[0]}</div> : null}
              {online && service?.id ? (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 mt-1"
                  style={{ fontSize: "11px" }}
                  disabled={onuLoadingId === service.id}
                  onClick={() => openOnuWeb(row)}
                >
                  {onuLoadingId === service.id ? "Opening…" : "Open ONU"}
                </button>
              ) : null}
            </div>
          );
        },
        minWidth: "130px",
      },
      {
        id: 13,
        name: "",
        button: true,
        width: "64px",
        cell: (row) => (
          <Link
            to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.id}`}
            className="btn btn-sm btn-icon btn-trigger"
            title="Open customer"
          >
            <Icon name="chevron-right" />
          </Link>
        ),
      },
    ];
    return base;
  }, [config.accent, config.title, config.value, creditView, onuLoadingId]);

  const handlePageChange = (nextPage) => setPage(nextPage);

  const handlePerRowsChange = (e, perPageO) => {
    const nextPerPage = Number(e?.target?.value ?? e);
    let newPage = 1;
    if (Number(perPageO) > nextPerPage && page !== 1) {
      newPage = Math.ceil(Number(perPageO) / nextPerPage) * (page - 1) + 1;
    } else if (page !== 1) {
      newPage = Math.ceil((Number(perPageO) / nextPerPage) * page);
    }
    setPerPage(nextPerPage);
    setPage(newPage);
  };

  const handleSort = async (column, sortDirection) => {
    setPaymentDateSort("");
    setSort(sortDirection);
    setSortCol(column.ref);
  };

  return (
    <React.Fragment>
      <Head title={`${config.title} customers`} />
      <Content>
        <div className="btc-page">
          <BlockHead size="sm" className="btc-head">
            <BlockBetween className="g-3">
              <BlockHeadContent>
                <div className="btc-kicker">Tariffs · Customers</div>
                <div className="d-flex align-items-center mt-1">
                  <div className={`btc-head-icon bg-${config.accent}-dim text-${config.accent}`}>
                    <Icon name={config.icon} />
                  </div>
                  <div>
                    <BlockTitle page tag="h3" className="mb-0">
                      {config.title} customers
                    </BlockTitle>
                    <p className="btc-blurb mb-0">{config.blurb}</p>
                  </div>
                </div>
              </BlockHeadContent>
              <BlockHeadContent>
                <div className="btc-head-actions">
                  <div className="btc-mode-switch" role="tablist" aria-label="Billing type">
                    <Link
                      to="/admin/tariffs/recurring"
                      className={`btc-mode-btn ${type === "recurring" ? "is-active" : ""}`}
                      role="tab"
                      aria-selected={type === "recurring"}
                    >
                      <Icon name="repeat" />
                      Recurring
                    </Link>
                    <Link
                      to="/admin/tariffs/prepaid"
                      className={`btc-mode-btn ${type === "prepaid" ? "is-active" : ""}`}
                      role="tab"
                      aria-selected={type === "prepaid"}
                    >
                      <Icon name="wallet" />
                      Prepaid
                    </Link>
                  </div>
                  <Button color="light" outline className="btn-dim" disabled={loading} onClick={fetchCustomers}>
                    <Icon name="reload" className={loading ? "spinning" : ""} />
                    <span>Refresh</span>
                  </Button>
                </div>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            {error && (
              <Alert color="danger" className="mb-3">
                {error}
              </Alert>
            )}

            <div className="btc-stat-strip" role="toolbar" aria-label="Customer filters">
              {FILTER_OPTIONS.map((item) => {
                const selected = filter === item.id;
                const count = stats[item.statKey] ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={[
                      "btc-stat",
                      selected ? "is-selected" : "",
                      item.featured ? "is-featured" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => selectFilter(item.id)}
                    aria-pressed={selected}
                  >
                    <span className="btc-stat-label">
                      <Icon name={item.icon} />
                      {item.label}
                    </span>
                    <span className="btc-stat-value">{Number(count).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>

            {creditView ? (
              <div className="btc-credit-banner">
                <div>
                  <strong>Online with credit</strong>
                  <span>
                    {" "}
                    — currently online customers whose latest payment was credit. Shows who granted it, the reason, and
                    due date.
                  </span>
                </div>
                <span className="btc-credit-count">{totalRows.toLocaleString()} listed</span>
              </div>
            ) : null}

            <PreviewCard bodyClass="p-0 btc-table-card">
              <div className="btc-toolbar">
                <div>
                  <h6 className="btc-toolbar-title mb-0">{activeFilterMeta.label}</h6>
                  <span className="btc-muted">
                    {totalRows.toLocaleString()} customer{totalRows === 1 ? "" : "s"}
                    {searchText ? ` matching “${searchText}”` : ""}
                  </span>
                </div>
                <div className="btc-toolbar-controls">
                  <Button
                    size="sm"
                    color="secondary"
                    outline
                    disabled={exporting || loading || totalRows === 0}
                    onClick={exportExcel}
                  >
                    <Icon name="download" />
                    <span>{exporting ? "Exporting…" : "Download Excel"}</span>
                  </Button>
                  <select
                    className="form-select form-select-sm"
                    value={paymentDateSort}
                    onChange={(event) => selectPaymentDateSort(event.target.value)}
                    aria-label="Sort by last payment date"
                  >
                    {PAYMENT_DATE_SORT_OPTIONS.map((item) => (
                      <option key={item.id || "default"} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select form-select-sm"
                    value={perPage}
                    onChange={(event) => handlePerRowsChange(event, perPage)}
                    aria-label="Rows per page"
                  >
                    <option value={10}>10 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <div className="btc-search">
                    <Icon name="search" className="btc-search-icon" />
                    <input
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Name or phone…"
                      value={searchDraft}
                      onChange={(event) => setSearchDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          runPhoneSearch();
                        }
                      }}
                      aria-label="Search by name or phone"
                    />
                    {searchDraft ? (
                      <button type="button" className="btc-search-clear" onClick={clearPhoneSearch} title="Clear">
                        <Icon name="cross" />
                      </button>
                    ) : null}
                  </div>
                  <Button size="sm" color="primary" onClick={runPhoneSearch} disabled={loading}>
                    Search
                  </Button>
                </div>
              </div>

              <DataTable
                columns={columns}
                data={data}
                progressPending={loading && data.length === 0}
                progressComponent={
                  <div className="btc-empty">
                    <Spinner size="sm" color="primary" className="me-2" />
                    <span className="btc-muted">Loading customers…</span>
                  </div>
                }
                pagination
                paginationServer
                paginationTotalRows={totalRows}
                onChangePage={handlePageChange}
                onChangeRowsPerPage={handlePerRowsChange}
                onSort={handleSort}
                sortServer
                defaultSortFieldId={1}
                paginationComponent={() =>
                  totalRows > 0 ? (
                    <DataTablePagination
                      itemPerPage={perPage}
                      totalItems={totalRows}
                      paginate={handlePageChange}
                      currentPage={page}
                      onChangeRowsPerPage={handlePerRowsChange}
                      setRowsPerPage={setPerPage}
                    />
                  ) : null
                }
                highlightOnHover
                responsive
                persistTableHead
                customStyles={tableStyles}
                noDataComponent={
                  <div className="btc-empty">
                    <div className="btc-empty-icon">
                      <Icon name={creditView ? "coins" : "users"} />
                    </div>
                    <h6 className="mb-1">No customers found</h6>
                    <p className="btc-muted mb-0">
                      {searchText
                        ? "Try a different name or phone number."
                        : creditView
                          ? `No online ${config.title.toLowerCase()} customers are currently on credit.`
                          : `No ${config.title.toLowerCase()} customers match this filter.`}
                    </p>
                  </div>
                }
              />
            </PreviewCard>
          </Block>
        </div>
      </Content>
    </React.Fragment>
  );
};

export default BillingTypeCustomers;
