import React, { useState, useEffect, useCallback, useRef } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Row,
  Col,
  Icon,
} from "../../components/Component";
import { Card, Badge, Spinner, Table, Progress } from "reactstrap";
import { httpNode } from "../../helpers";
import { Line, Bar, Pie, Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, registerables } from "chart.js";

ChartJS.register(...registerables);

const toLocalDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const todayStr = () => toLocalDateStr(new Date());

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (n) => "KES " + Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 0 });
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
};

const COLORS = {
  primary: "#6576ff",
  success: "#1ee0ac",
  warning: "#f4bd0e",
  danger: "#e85347",
  info: "#09c2de",
  dark: "#364a63",
  purple: "#8091ff",
  teal: "#20c997",
  orange: "#fd7e14",
  pink: "#e75480",
};

const FinancialReport = () => {
  const [period, setPeriod] = useState("monthly");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportRef = useRef(null);

  const exportActiveUnpaid = async () => {
    setExporting(true);
    try {
      const res = await httpNode.get("/finance/report/active-unpaid-export");
      if (!res.data?.success || !res.data.list?.length) {
        alert("No unpaid data to download");
        return;
      }
      const rows = res.data.list;
      const headers = ["Customer", "Phone", "Billing Type", "Plan Price", "Bill To", "Days Overdue"];
      const csvRows = [headers.join(",")];
      rows.forEach((r) => {
        csvRows.push(
          [
            `"${(r.name || "").replace(/"/g, '""')}"`,
            r.phone || "",
            r.billing_type || "",
            r.plan_price || 0,
            r.bill_to ? String(r.bill_to).slice(0, 10) : "",
            r.days_overdue || 0,
          ].join(",")
        );
      });
      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `active_unpaid_${todayStr()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Download failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    try {
      // Clone the report content
      const clone = reportRef.current.cloneNode(true);

      // Convert all canvas elements to images so charts appear in the PDF
      const originalCanvases = reportRef.current.querySelectorAll("canvas");
      const clonedCanvases = clone.querySelectorAll("canvas");
      originalCanvases.forEach((canvas, i) => {
        try {
          const img = document.createElement("img");
          img.src = canvas.toDataURL("image/png");
          img.style.width = "100%";
          img.style.height = "auto";
          clonedCanvases[i].parentNode.replaceChild(img, clonedCanvases[i]);
        } catch (e) {
          console.warn("Could not convert canvas to image:", e);
        }
      });

      const printContent = clone.innerHTML;
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`<!DOCTYPE html><html><head><title>TonyComm Financial Report</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #fff; color: #364a63; }
          .print-header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #6576ff; }
          .print-header h1 { font-size: 22px; color: #364a63; margin: 0; }
          .print-header p { font-size: 11px; color: #8290a4; margin: 4px 0 0; }
          .card { border: 1px solid #e5e9f2 !important; border-radius: 6px; margin-bottom: 12px; break-inside: avoid; }
          .card-inner { padding: 16px; }
          img { max-width: 100% !important; height: auto !important; }
          .badge { font-size: 10px; }
          table { font-size: 11px; }
          .nk-block { margin-bottom: 16px; }
          @media print {
            body { padding: 0; }
            .card { box-shadow: none !important; border: 1px solid #ddd !important; }
            .btn { display: none !important; }
          }
        </style></head><body>
        <div class="print-header">
          <h1>TonyComm Financial Report</h1>
          <p>Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Period: ${period} &nbsp;|&nbsp; ${data ? data.startDate + " — " + data.endDate : ""}</p>
        </div>
        ${printContent}
      </body></html>`);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        setExportingPdf(false);
      }, 1500);
    } catch (err) {
      console.error("PDF export error:", err);
      setExportingPdf(false);
    }
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period });
      if (period === "daily") params.set("date", selectedDate);
      if (period === "monthly") {
        params.set("month", selectedMonth);
        params.set("year", selectedYear);
      }
      if (period === "yearly") params.set("year", selectedYear);

      const [reportRes, trendRes] = await Promise.all([
        httpNode.get(`/finance/report/summary?${params}`),
        httpNode.get("/finance/report/customer-growth"),
      ]);
      if (reportRes.data?.success) setData(reportRes.data);
      else setError("Failed to load report");
      if (trendRes.data?.success) setTrends(trendRes.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [period, selectedDate, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const years = [];
  const curYear = new Date().getFullYear();
  for (let y = curYear; y >= curYear - 5; y--) years.push(y);

  // ---- Chart Data Builders ----
  const buildRevenueLineChart = () => {
    if (!trends?.trends) return null;
    const labels = trends.trends.map((t) => {
      const [y, m] = t.month.split("-");
      return SHORT_MONTHS[parseInt(m) - 1] + " " + y.slice(2);
    });
    return {
      labels,
      datasets: [
        {
          label: "Total Revenue",
          data: trends.trends.map((t) => t.totalRevenue),
          borderColor: COLORS.primary,
          backgroundColor: "rgba(101,118,255,0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: COLORS.primary,
        },
        {
          label: "M-Pesa",
          data: trends.trends.map((t) => t.mpesaRevenue),
          borderColor: COLORS.success,
          backgroundColor: "rgba(30,224,172,0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: COLORS.success,
        },
        {
          label: "Manual Payments",
          data: trends.trends.map((t) => t.manualRevenue),
          borderColor: COLORS.info,
          backgroundColor: "rgba(9,194,222,0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: COLORS.info,
        },
      ],
    };
  };

  const buildRevenueBarChart = () => {
    if (!trends?.trends) return null;
    const labels = trends.trends.map((t) => {
      const [, m] = t.month.split("-");
      return SHORT_MONTHS[parseInt(m) - 1];
    });
    return {
      labels,
      datasets: [
        {
          label: "M-Pesa",
          data: trends.trends.map((t) => t.mpesaRevenue),
          backgroundColor: COLORS.success,
          borderRadius: 4,
          barPercentage: 0.6,
        },
        {
          label: "Manual",
          data: trends.trends.map((t) => t.manualRevenue),
          backgroundColor: COLORS.info,
          borderRadius: 4,
          barPercentage: 0.6,
        },
      ],
    };
  };

  const buildCustomerGrowthBar = () => {
    if (!trends?.trends) return null;
    const labels = trends.trends.map((t) => {
      const [, m] = t.month.split("-");
      return SHORT_MONTHS[parseInt(m) - 1];
    });
    return {
      labels,
      datasets: [
        {
          label: "New Customers",
          data: trends.trends.map((t) => t.newCustomers),
          backgroundColor: trends.trends.map((t, i, arr) => {
            if (i === 0) return COLORS.primary;
            return t.newCustomers >= arr[i - 1].newCustomers ? COLORS.success : COLORS.danger;
          }),
          borderRadius: 6,
          barPercentage: 0.5,
        },
      ],
    };
  };

  const buildCustomerPieChart = () => {
    if (!trends?.statusBreakdown) return null;
    const labels = Object.keys(trends.statusBreakdown);
    const values = Object.values(trends.statusBreakdown);
    const colorMap = {
      Active: COLORS.success,
      Expired: COLORS.warning,
      Blocked: COLORS.danger,
      New: COLORS.info,
    };
    return {
      labels: labels.map((l) => (l === "Active" ? "Active / Online" : l)),
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((l) => colorMap[l] || COLORS.purple),
          borderWidth: 2,
          borderColor: "#fff",
          hoverOffset: 8,
        },
      ],
    };
  };

  const buildRevenueDoughnut = () => {
    if (!data) return null;
    const mpesa = parseFloat(data.revenue.mpesa.amount) || 0;
    const manual = parseFloat(data.revenue.manual.amount) || 0;
    if (mpesa === 0 && manual === 0) return null;
    return {
      labels: ["M-Pesa", "Manual Payments"],
      datasets: [
        {
          data: [mpesa, manual],
          backgroundColor: [COLORS.success, COLORS.info],
          borderWidth: 3,
          borderColor: "#fff",
          hoverOffset: 6,
        },
      ],
    };
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, padding: 15, font: { size: 11 } } },
      tooltip: {
        backgroundColor: "rgba(54,74,99,0.95)",
        padding: 12,
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        callbacks: { label: (ctx) => `${ctx.dataset.label}: KES ${Number(ctx.raw).toLocaleString()}` },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.04)" },
        ticks: { font: { size: 10 }, callback: (v) => fmtShort(v) },
      },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, padding: 15, font: { size: 11 } } },
      tooltip: {
        backgroundColor: "rgba(54,74,99,0.95)",
        padding: 12,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: KES ${Number(ctx.raw).toLocaleString()}` },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.04)" },
        ticks: { font: { size: 10 }, callback: (v) => fmtShort(v) },
      },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  const customerBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(54,74,99,0.95)",
        padding: 12,
        callbacks: { label: (ctx) => `New Customers: ${ctx.raw}` },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.04)" },
        ticks: { font: { size: 10 }, stepSize: 1 },
      },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
      tooltip: {
        backgroundColor: "rgba(54,74,99,0.95)",
        padding: 12,
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return `${ctx.label}: ${fmtNum(ctx.raw)} (${pct}%)`;
          },
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
      tooltip: {
        backgroundColor: "rgba(54,74,99,0.95)",
        padding: 12,
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return `${ctx.label}: KES ${Number(ctx.raw).toLocaleString()} (${pct}%)`;
          },
        },
      },
    },
  };

  // Customer growth comparison
  const growthComparison = () => {
    if (!trends?.trends || trends.trends.length < 2) return null;
    const curr = trends.trends[trends.trends.length - 1];
    const prev = trends.trends[trends.trends.length - 2];
    const diff = curr.newCustomers - prev.newCustomers;
    const pct = prev.newCustomers > 0 ? ((diff / prev.newCustomers) * 100).toFixed(1) : curr.newCustomers > 0 ? 100 : 0;
    return { diff, pct, up: diff >= 0 };
  };

  const revenueComparison = () => {
    if (!trends?.trends || trends.trends.length < 2) return null;
    const curr = trends.trends[trends.trends.length - 1];
    const prev = trends.trends[trends.trends.length - 2];
    const diff = curr.totalRevenue - prev.totalRevenue;
    const pct = prev.totalRevenue > 0 ? ((diff / prev.totalRevenue) * 100).toFixed(1) : curr.totalRevenue > 0 ? 100 : 0;
    return { diff, pct, up: diff >= 0 };
  };

  const gc = growthComparison();
  const rc = revenueComparison();

  return (
    <>
      <Head title="Financial Report" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="report-profit" className="me-2" />
                Financial Report Dashboard
              </BlockTitle>
              <p className="text-soft">Comprehensive revenue, customer growth &amp; analytics</p>
            </BlockHeadContent>
            <BlockHeadContent>
              <button className="btn btn-outline-primary btn-sm" onClick={exportPdf} disabled={exportingPdf || loading}>
                {exportingPdf ? <Spinner size="sm" className="me-1" /> : <Icon name="file-pdf" className="me-1" />}
                Export PDF
              </button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        {/* Period Controls */}
        <Block>
          <Card className="card-bordered mb-4" style={{ borderLeft: "3px solid #6576ff" }}>
            <div className="card-inner py-3">
              <div className="d-flex flex-wrap align-items-center gap-3">
                <div className="d-flex align-items-center gap-2">
                  {["daily", "monthly", "yearly"].map((p) => (
                    <button
                      key={p}
                      className={`btn btn-sm ${period === p ? "btn-primary" : "btn-outline-light"}`}
                      onClick={() => setPeriod(p)}
                      style={{ minWidth: 80 }}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
                {period === "daily" && (
                  <input type="date" className="form-control form-control-sm" style={{ maxWidth: 170 }} value={selectedDate} max={todayStr()} onChange={(e) => setSelectedDate(e.target.value)} />
                )}
                {period === "monthly" && (
                  <div className="d-flex align-items-center gap-2">
                    <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}>
                      {MONTHS.map((m, i) => (<option key={i} value={i}>{m}</option>))}
                    </select>
                    <select className="form-select form-select-sm" style={{ maxWidth: 100 }} value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                      {years.map((y) => (<option key={y} value={y}>{y}</option>))}
                    </select>
                  </div>
                )}
                {period === "yearly" && (
                  <select className="form-select form-select-sm" style={{ maxWidth: 100 }} value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                    {years.map((y) => (<option key={y} value={y}>{y}</option>))}
                  </select>
                )}
                <span className="text-soft ms-auto" style={{ fontSize: 12 }}>
                  {data ? `${data.startDate} — ${data.endDate}` : ""}
                </span>
              </div>
            </div>
          </Card>
        </Block>

        {loading && <div className="text-center py-5"><Spinner color="primary" /></div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {data && !loading && (
          <div ref={reportRef}>
            {/* ===== KPI CARDS ===== */}
            <Block>
              <Row className="g-gs">
                <Col md="3" sm="6">
                  <Card className="card-bordered card-full" style={{ borderTop: "3px solid #1ee0ac" }}>
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="text-soft text-uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.5px" }}>Total Revenue</div>
                          <div className="mt-1" style={{ fontSize: 24, fontWeight: 700, color: COLORS.success }}>{fmt(data.revenue.totalRevenue)}</div>
                          <div className="text-soft mt-1" style={{ fontSize: 11 }}>{fmtNum(data.revenue.mpesa.count + data.revenue.manual.count)} transactions</div>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(30,224,172,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="coins" style={{ fontSize: 20, color: COLORS.success }} />
                        </div>
                      </div>
                      {rc && (
                        <div className="mt-2" style={{ fontSize: 11 }}>
                          <span style={{ color: rc.up ? COLORS.success : COLORS.danger, fontWeight: 600 }}>
                            <Icon name={rc.up ? "arrow-up" : "arrow-down"} /> {rc.up ? "+" : ""}{rc.pct}%
                          </span>
                          <span className="text-soft ms-1">vs last month</span>
                        </div>
                      )}
                    </div>
                  </Card>
                </Col>
                <Col md="3" sm="6">
                  <Card className="card-bordered card-full" style={{ borderTop: "3px solid #6576ff" }}>
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="text-soft text-uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.5px" }}>M-Pesa Revenue</div>
                          <div className="mt-1" style={{ fontSize: 24, fontWeight: 700, color: COLORS.primary }}>{fmt(data.revenue.mpesa.amount)}</div>
                          <div className="text-soft mt-1" style={{ fontSize: 11 }}>{fmtNum(data.revenue.mpesa.count)} transactions</div>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(101,118,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="mobile" style={{ fontSize: 20, color: COLORS.primary }} />
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col md="3" sm="6">
                  <Card className="card-bordered card-full" style={{ borderTop: "3px solid #09c2de" }}>
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="text-soft text-uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.5px" }}>Manual Payments</div>
                          <div className="mt-1" style={{ fontSize: 24, fontWeight: 700, color: COLORS.info }}>{fmt(data.revenue.manual.amount)}</div>
                          <div className="text-soft mt-1" style={{ fontSize: 11 }}>{fmtNum(data.revenue.manual.count)} payments</div>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(9,194,222,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="file-text" style={{ fontSize: 20, color: COLORS.info }} />
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col md="3" sm="6">
                  <Card className="card-bordered card-full" style={{ borderTop: "3px solid #f4bd0e" }}>
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="text-soft text-uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.5px" }}>New Customers</div>
                          <div className="mt-1" style={{ fontSize: 24, fontWeight: 700, color: COLORS.warning }}>{fmtNum(data.customers.newInPeriod)}</div>
                          <div className="text-soft mt-1" style={{ fontSize: 11 }}>this period</div>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(244,189,14,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="user-add" style={{ fontSize: 20, color: COLORS.warning }} />
                        </div>
                      </div>
                      {gc && (
                        <div className="mt-2" style={{ fontSize: 11 }}>
                          <span style={{ color: gc.up ? COLORS.success : COLORS.danger, fontWeight: 600 }}>
                            <Icon name={gc.up ? "arrow-up" : "arrow-down"} /> {gc.up ? "+" : ""}{gc.pct}%
                          </span>
                          <span className="text-soft ms-1">vs last month</span>
                        </div>
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>
            </Block>

            {/* ===== REVENUE TREND LINE CHART + REVENUE COMPOSITION DOUGHNUT ===== */}
            <Block className="mt-4">
              <Row className="g-gs">
                <Col xl="8" lg="7">
                  <Card className="card-bordered card-full">
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="title mb-0">Revenue Trends (12 Months)</h6>
                        <Badge color="light" className="text-soft">Line Chart</Badge>
                      </div>
                      <div style={{ height: 320 }}>
                        {buildRevenueLineChart() ? (
                          <Line data={buildRevenueLineChart()} options={lineOptions} />
                        ) : (
                          <div className="text-center text-soft py-5">No trend data available</div>
                        )}
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col xl="4" lg="5">
                  <Card className="card-bordered card-full">
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="title mb-0">Revenue Composition</h6>
                        <Badge color="light" className="text-soft">This Period</Badge>
                      </div>
                      <div style={{ height: 260 }} className="d-flex align-items-center justify-content-center">
                        {buildRevenueDoughnut() ? (
                          <Doughnut data={buildRevenueDoughnut()} options={doughnutOptions} />
                        ) : (
                          <div className="text-center text-soft">No revenue this period</div>
                        )}
                      </div>
                      {data.revenue.totalRevenue > 0 && (
                        <div className="mt-3 pt-2 border-top">
                          <div className="d-flex justify-content-between" style={{ fontSize: 12 }}>
                            <span><span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.success, display: "inline-block", marginRight: 6 }}></span>M-Pesa</span>
                            <span className="fw-bold">{fmt(data.revenue.mpesa.amount)} ({Math.round((data.revenue.mpesa.amount / data.revenue.totalRevenue) * 100)}%)</span>
                          </div>
                          <div className="d-flex justify-content-between mt-1" style={{ fontSize: 12 }}>
                            <span><span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.info, display: "inline-block", marginRight: 6 }}></span>Manual</span>
                            <span className="fw-bold">{fmt(data.revenue.manual.amount)} ({Math.round((data.revenue.manual.amount / data.revenue.totalRevenue) * 100)}%)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>
            </Block>

            {/* ===== REVENUE BAR CHART + CUSTOMER PIE CHART ===== */}
            <Block className="mt-4">
              <Row className="g-gs">
                <Col xl="8" lg="7">
                  <Card className="card-bordered card-full">
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="title mb-0">Monthly Revenue Breakdown</h6>
                        <Badge color="light" className="text-soft">Bar Chart</Badge>
                      </div>
                      <div style={{ height: 300 }}>
                        {buildRevenueBarChart() ? (
                          <Bar data={buildRevenueBarChart()} options={barOptions} />
                        ) : (
                          <div className="text-center text-soft py-5">No data available</div>
                        )}
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col xl="4" lg="5">
                  <Card className="card-bordered card-full">
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="title mb-0">Customer Overview</h6>
                        <Badge color="light" className="text-soft">Pie Chart</Badge>
                      </div>
                      <div style={{ height: 260 }} className="d-flex align-items-center justify-content-center">
                        {buildCustomerPieChart() ? (
                          <Pie data={buildCustomerPieChart()} options={pieOptions} />
                        ) : (
                          <div className="text-center text-soft">No customer data</div>
                        )}
                      </div>
                      {trends?.statusBreakdown && (
                        <div className="mt-3 pt-2 border-top">
                          {Object.entries(trends.statusBreakdown).map(([label, count]) => {
                            const total = Object.values(trends.statusBreakdown).reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                            return (
                              <div key={label} className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                                <span>{label === "Active" ? "Active / Online" : label}</span>
                                <span className="fw-bold">{fmtNum(count)} <span className="text-soft">({pct}%)</span></span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>
            </Block>

            {/* ===== CUSTOMER GROWTH BAR CHART ===== */}
            <Block className="mt-4">
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h6 className="title mb-1">Customer Growth Comparison</h6>
                      <p className="text-soft mb-0" style={{ fontSize: 12 }}>New customers per month — <span style={{ color: COLORS.success }}>green = growth</span> vs <span style={{ color: COLORS.danger }}>red = decline</span></p>
                    </div>
                    {gc && (
                      <div className="text-end">
                        <div style={{ fontSize: 20, fontWeight: 700, color: gc.up ? COLORS.success : COLORS.danger }}>
                          {gc.up ? "+" : ""}{gc.diff}
                        </div>
                        <div style={{ fontSize: 11, color: gc.up ? COLORS.success : COLORS.danger }}>
                          {gc.up ? "+" : ""}{gc.pct}% MoM
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ height: 260 }}>
                    {buildCustomerGrowthBar() ? (
                      <Bar data={buildCustomerGrowthBar()} options={customerBarOptions} />
                    ) : (
                      <div className="text-center text-soft py-5">No customer growth data available</div>
                    )}
                  </div>
                </div>
              </Card>
            </Block>

            {/* ===== ACTIVE BUT UNPAID + CUSTOMER STATUS + PAYMENT METHODS ===== */}
            <Block className="mt-4">
              <Row className="g-gs">
                <Col lg="6">
                  <Card className="card-bordered card-full" style={{ borderTop: "3px solid #e85347" }}>
                    <div className="card-inner">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="title mb-0">
                          <Icon name="alert-circle" className="text-danger me-1" />
                          Active But Unpaid
                          <Badge color="danger" pill className="ms-2">{fmtNum(data.customers.activeUnpaid.count)}</Badge>
                        </h6>
                        <button className="btn btn-sm btn-outline-success" onClick={exportActiveUnpaid} disabled={exporting} title="Export CSV">
                          {exporting ? <Spinner size="sm" /> : <Icon name="download" />}
                        </button>
                      </div>
                      <div className="d-flex gap-3 mb-3">
                        <small><Badge color="warning" pill className="me-1">{fmtNum(data.customers.activeUnpaid.prepaid || 0)}</Badge> Prepaid</small>
                        <small><Badge color="primary" pill className="me-1">{fmtNum(data.customers.activeUnpaid.recurring || 0)}</Badge> Recurring</small>
                      </div>
                      {data.customers.activeUnpaid.list.length > 0 ? (
                        <div style={{ maxHeight: 320, overflowY: "auto" }}>
                          <Table size="sm" borderless className="mb-0">
                            <thead>
                              <tr className="text-soft" style={{ fontSize: 11 }}>
                                <th>Customer</th>
                                <th>Phone</th>
                                <th>Type</th>
                                <th>Bill To</th>
                                <th>Days</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.customers.activeUnpaid.list.map((c, i) => (
                                <tr key={i} style={{ fontSize: 12 }}>
                                  <td className="text-truncate" style={{ maxWidth: 120 }}>{c.name}</td>
                                  <td>{c.phone || "N/A"}</td>
                                  <td><Badge color={String(c.billing_type).startsWith("Prepaid") ? "warning" : "primary"} pill style={{ fontSize: 10 }}>{c.billing_type || "N/A"}</Badge></td>
                                  <td>{c.bill_to ? String(c.bill_to).slice(0, 10) : "N/A"}</td>
                                  <td><Badge color={c.days_overdue > 30 ? "danger" : c.days_overdue > 7 ? "warning" : "info"} pill>{c.days_overdue}d</Badge></td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-center text-soft py-3"><Icon name="check-circle" className="text-success me-1" /> All active customers are paid up</div>
                      )}
                    </div>
                  </Card>
                </Col>
                <Col lg="3">
                  <Card className="card-bordered card-full">
                    <div className="card-inner">
                      <h6 className="title mb-3">Customer Status</h6>
                      <div className="d-flex flex-column gap-3">
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="text-soft" style={{ fontSize: 12 }}>Total Customers</span>
                          <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.dark }}>{fmtNum(data.customers.total)}</span>
                        </div>
                        {Object.entries(data.customers.statuses).map(([label, info]) => {
                          const total = data.customers.total || 1;
                          const pct = Math.round((info.count / total) * 100);
                          const color = label === "Active" ? "success" : label === "Expired" ? "warning" : "secondary";
                          return (
                            <div key={label}>
                              <div className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                                <span>{label === "Active" ? "Active / Online" : label}</span>
                                <span className="fw-bold">{fmtNum(info.count)} <span className="text-soft">({pct}%)</span></span>
                              </div>
                              <Progress value={pct} color={color} style={{ height: 6 }} />
                            </div>
                          );
                        })}
                        <hr className="my-1" />
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="text-soft" style={{ fontSize: 12 }}>New This Period</span>
                          <Badge color="primary" pill className="px-3">{fmtNum(data.customers.newInPeriod)}</Badge>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col lg="3">
                  <Card className="card-bordered card-full">
                    <div className="card-inner">
                      <h6 className="title mb-3">Payment Methods</h6>
                      {data.revenue.manual.byMethod && data.revenue.manual.byMethod.length > 0 ? (
                        <div className="d-flex flex-column gap-2">
                          {data.revenue.manual.byMethod.map((m, i) => {
                            const pct = data.revenue.manual.amount > 0 ? Math.round((parseFloat(m.amount) / data.revenue.manual.amount) * 100) : 0;
                            const colors = { cheque: "primary", bank_transfer: "info", cash: "success", card: "warning", other: "secondary" };
                            return (
                              <div key={i}>
                                <div className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                                  <span className="text-capitalize">{m.payment_method?.replace("_", " ")}</span>
                                  <span className="fw-bold">{fmt(m.amount)}</span>
                                </div>
                                <Progress value={pct} color={colors[m.payment_method] || "secondary"} style={{ height: 6 }} />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center text-soft py-3">No manual payments</div>
                      )}
                      <hr className="my-2" />
                      <div>
                        <div className="text-soft text-uppercase mb-2" style={{ fontSize: 10, fontWeight: 600 }}>Credit Summary</div>
                        <div className="d-flex justify-content-between" style={{ fontSize: 12 }}>
                          <span>Total Credit</span>
                          <span className="fw-bold" style={{ color: COLORS.danger }}>{fmt(data.credit.total)}</span>
                        </div>
                        <div className="d-flex justify-content-between mt-1" style={{ fontSize: 12 }}>
                          <span>This Period</span>
                          <span className="fw-bold">{fmt(data.credit.inPeriod.amount)}</span>
                        </div>
                        <div className="d-flex justify-content-between mt-1" style={{ fontSize: 12 }}>
                          <span>Customers w/ Credit</span>
                          <span className="fw-bold">{fmtNum(data.credit.customerCount)}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </Block>

            {/* ===== DAILY BREAKDOWN TABLE (Monthly view) ===== */}
            {period === "monthly" && data.dailyBreakdown && data.dailyBreakdown.length > 0 && (
              <Block className="mt-4">
                <Card className="card-bordered">
                  <div className="card-inner">
                    <h6 className="title mb-3">
                      <Icon name="calendar" className="me-1" />
                      Daily Breakdown — {MONTHS[selectedMonth]} {selectedYear}
                    </h6>
                    <div style={{ maxHeight: 400, overflowY: "auto" }}>
                      <Table size="sm" striped className="mb-0">
                        <thead>
                          <tr style={{ fontSize: 12 }}>
                            <th>Date</th>
                            <th className="text-end">M-Pesa</th>
                            <th className="text-end">Manual</th>
                            <th className="text-end">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.dailyBreakdown.map((d, i) => (
                            <tr key={i} style={{ fontSize: 12 }}>
                              <td>{d.date}</td>
                              <td className="text-end">{fmt(d.mpesa.amount)}</td>
                              <td className="text-end">{fmt(d.manual.amount)}</td>
                              <td className="text-end fw-bold">{fmt(d.totalRevenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontSize: 13, fontWeight: "bold", background: "#f5f6fa" }}>
                            <td>Total</td>
                            <td className="text-end">{fmt(data.revenue.mpesa.amount)}</td>
                            <td className="text-end">{fmt(data.revenue.manual.amount)}</td>
                            <td className="text-end">{fmt(data.revenue.totalRevenue)}</td>
                          </tr>
                        </tfoot>
                      </Table>
                    </div>
                  </div>
                </Card>
              </Block>
            )}

            {/* ===== MONTHLY BREAKDOWN TABLE (Yearly view) ===== */}
            {period === "yearly" && data.monthlyBreakdown && data.monthlyBreakdown.length > 0 && (
              <Block className="mt-4">
                <Card className="card-bordered">
                  <div className="card-inner">
                    <h6 className="title mb-3">
                      <Icon name="calendar" className="me-1" />
                      Monthly Breakdown — {selectedYear}
                    </h6>
                    <Table size="sm" striped className="mb-0">
                      <thead>
                        <tr style={{ fontSize: 12 }}>
                          <th>Month</th>
                          <th className="text-end">M-Pesa</th>
                          <th className="text-end">Manual</th>
                          <th className="text-end">Total Revenue</th>
                          <th className="text-end">New Customers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.monthlyBreakdown.map((m, i) => (
                          <tr key={i} style={{ fontSize: 12 }}>
                            <td>{MONTHS[m.month - 1]}</td>
                            <td className="text-end">{fmt(m.mpesa.amount)}</td>
                            <td className="text-end">{fmt(m.manual.amount)}</td>
                            <td className="text-end fw-bold">{fmt(m.totalRevenue)}</td>
                            <td className="text-end">{fmtNum(m.newCustomers)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontSize: 13, fontWeight: "bold", background: "#f5f6fa" }}>
                          <td>Total</td>
                          <td className="text-end">{fmt(data.revenue.mpesa.amount)}</td>
                          <td className="text-end">{fmt(data.revenue.manual.amount)}</td>
                          <td className="text-end">{fmt(data.revenue.totalRevenue)}</td>
                          <td className="text-end">{fmtNum(data.customers.newInPeriod)}</td>
                        </tr>
                      </tfoot>
                    </Table>
                  </div>
                </Card>
              </Block>
            )}
          </div>
        )}
      </Content>
    </>
  );
};

export default FinancialReport;
