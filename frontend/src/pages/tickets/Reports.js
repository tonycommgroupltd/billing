/**
 * Ticket Reports Dashboard
 * Section 1: All New Tickets by Type (cards)
 * Section 2: Daily Tracker (day/month/year view)
 * Section 3: Dashboard gauges & charts
 * Section 4: Historical tickets by type with date filtering
 * All sections exportable as PDF
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  Row,
  Col,
  Icon,
} from "../../components/Component";
import { Card, Badge, Spinner, Progress } from "reactstrap";
import TicketsAPI from "../../helpers/TicketsAPI";
import { getTypeLabelById } from "../../config/ticketTypes";
import { Bar, Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, registerables } from "chart.js";

ChartJS.register(...registerables);

const STATUS_LABELS = {
  new: "New", open: "Work in progress", pending: "Pending", solved: "Solved",
  closed: "Closed", resolved: "Resolved", "installation complete": "Installation Complete",
  waiting_customer: "Waiting on Customer", waiting_agent: "Waiting on Agent",
  waiting_power: "Waiting on Power", customer_unreachable: "Customer Unreachable",
  booked_later: "Booked Later", out_of_range: "Out of Range",
  installed_elsewhere: "Installed Elsewhere", long_distance: "Long Distance",
  pole_needed: "Pole Needed",
};

const TYPE_COLORS = [
  "#6576ff","#1ee0ac","#e85347","#f4bd0e","#09c2de","#816bff","#ff63a5",
  "#2c3782","#13c2c2","#eb2f96","#fa8c16","#52c41a","#722ed1","#1890ff",
  "#d4380d","#9254de","#cf1322","#597ef7",
];

function getStatus(raw) {
  if (!raw) return "";
  return raw.toString().toLowerCase().trim();
}
function getStatusLabel(key) {
  return STATUS_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function normaliseType(raw) {
  if (!raw) return "Other";
  return raw.toString().trim();
}
function getTypeColor(index) {
  return TYPE_COLORS[index % TYPE_COLORS.length];
}
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtDate = (d) => d.toISOString().slice(0, 10);
const todayStr = () => fmtDate(new Date());

function exportPDF(elementId, title) {
  const src = document.getElementById(elementId);
  if (!src) return;
  const win = window.open("", "_blank");
  const clone = src.cloneNode(true);
  const canvases = src.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");
  canvases.forEach((c, i) => {
    try {
      const img = document.createElement("img");
      img.src = c.toDataURL("image/png");
      img.style.width = c.style.width || c.offsetWidth + "px";
      img.style.maxWidth = "100%";
      cloneCanvases[i].parentNode.replaceChild(img, cloneCanvases[i]);
    } catch (e) { /* ignore */ }
  });
  win.document.write('<!DOCTYPE html><html><head><title>' + title + '</title>');
  win.document.write('<style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}');
  win.document.write('table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}');
  win.document.write('th{background:#f5f6fa}.card{border:1px solid #e5e9f2;border-radius:6px;padding:12px;margin-bottom:10px}');
  win.document.write('@media print{body{padding:0}}</style></head><body>');
  win.document.write('<h2>' + title + '</h2><p>Generated: ' + new Date().toLocaleString() + '</p><hr/>');
  win.document.write(clone.innerHTML);
  win.document.write("</body></html>");
  win.document.close();
  setTimeout(function() { win.print(); }, 400);
}

/* ======================================================================= */
/* MAIN COMPONENT                                                           */
/* ======================================================================= */

const TicketReports = () => {
  const [allTickets, setAllTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadAllTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, archivedRes] = await Promise.allSettled([
        TicketsAPI.getAll({ per_page: 0 }),
        TicketsAPI.getArchived({ per_page: 0 }),
      ]);
      var active = [], archived = [];
      if (activeRes.status === "fulfilled") {
        var d = activeRes.value;
        active = Array.isArray(d) ? d : (d && d.data ? d.data : (d && d.tickets ? d.tickets : []));
      }
      if (archivedRes.status === "fulfilled") {
        var d2 = archivedRes.value;
        archived = Array.isArray(d2) ? d2 : (d2 && d2.data ? d2.data : (d2 && d2.tickets ? d2.tickets : []));
        archived = archived.map(function(t) { return Object.assign({}, t, { _archived: true }); });
      }
      setAllTickets([].concat(active, archived));
    } catch (err) {
      setError("Failed to load ticket data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function() { loadAllTickets(); }, [loadAllTickets]);

  return (
    <React.Fragment>
      <Head title="Ticket Reports" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="report-profit" className="me-2" />
                Ticket Reports
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <button className="btn btn-sm btn-outline-light" onClick={loadAllTickets} disabled={loading}>
                {loading ? <Spinner size="sm" className="me-1" /> : <Icon name="reload" className="me-1" />}
                Refresh
              </button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {loading && <div className="text-center py-5"><Spinner color="primary" /></div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && (
          <React.Fragment>
            <SectionNewTickets tickets={allTickets} />
            <SectionDailyTracker tickets={allTickets} />
            <SectionDashboard tickets={allTickets} />
            <SectionHistorical tickets={allTickets} />
          </React.Fragment>
        )}
      </Content>
    </React.Fragment>
  );
};

/* ======================================================================= */
/* SECTION 1 - ALL NEW TICKETS BY TYPE                                      */
/* ======================================================================= */

var SectionNewTickets = function(props) {
  var tickets = props.tickets;

  var newByType = useMemo(function() {
    var map = {};
    tickets.forEach(function(t) {
      if (getStatus(t.status) === "new") {
        // Use typeLabel if available, otherwise look up the label by ID; fall back to raw value
        var typeId = (t.type ?? '').toString();
        var typeLabel = (t.typeLabel ?? '').toString();
        
        // Use typeLabel if available, otherwise convert ID to label
        var displayType = typeLabel;
        if (!displayType || displayType === '') {
          displayType = getTypeLabelById(typeId) || typeId;
        }
        
        var normalizedType = displayType;
        map[normalizedType] = (map[normalizedType] || 0) + 1;
      }
    });
    return Object.entries(map).sort(function(a, b) { return b[1] - a[1]; });
  }, [tickets]);

  var totalNew = newByType.reduce(function(s, item) { return s + item[1]; }, 0);

  return (
    <Block>
      <div id="section-new-tickets">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="title mb-0">
            <Icon name="alert-circle" className="me-1 text-info" />
            All New Tickets by Type
            <Badge color="info" pill className="ms-2">{totalNew}</Badge>
          </h6>
          <button className="btn btn-sm btn-outline-primary" onClick={function() { exportPDF("section-new-tickets", "New Tickets by Type"); }}>
            <Icon name="file-pdf" className="me-1" /> Export PDF
          </button>
        </div>
        {newByType.length === 0 ? (
          <div className="text-center py-4 text-soft">No tickets with "New" status</div>
        ) : (
          <Row className="g-gs">
            {newByType.map(function(item, i) {
              var type = item[0], count = item[1];
              return (
                <Col sm="6" md="4" lg="3" xl="2" key={type}>
                  <Card 
                    className="card-bordered card-full" 
                    style={{ borderTop: "3px solid " + getTypeColor(i), cursor: "pointer" }}
                    onClick={function() { window.location.href = "/admin/tickets/list?type=" + encodeURIComponent(type) + "&status=new"; }}
                  >
                    <div className="card-inner py-3">
                      <div className="text-soft text-uppercase" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>{type}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: getTypeColor(i) }}>{count}</div>
                      <Badge color="info" pill style={{ fontSize: 10 }}>New</Badge>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </div>
    </Block>
  );
};

/* ======================================================================= */
/* SECTION 2 - DAILY TRACKER                                                */
/* ======================================================================= */

var SectionDailyTracker = function(props) {
  var viewState = useState("day");
  var view = viewState[0], setView = viewState[1];
  var dateState = useState(todayStr());
  var selectedDate = dateState[0], setSelectedDate = dateState[1];
  var monthState = useState(new Date().getMonth());
  var selectedMonth = monthState[0], setSelectedMonth = monthState[1];
  var yearState = useState(new Date().getFullYear());
  var selectedYear = yearState[0], setSelectedYear = yearState[1];

  // Snapshot data from API
  var snapshotState = useState(null);
  var snapshot = snapshotState[0], setSnapshot = snapshotState[1];
  var rangeState = useState(null);
  var rangeData = rangeState[0], setRangeData = rangeState[1];
  var loadingState = useState(false);
  var snapLoading = loadingState[0], setSnapLoading = loadingState[1];
  var errorState = useState(null);
  var snapError = errorState[0], setSnapError = errorState[1];
  var mountedRef = React.useRef(true);

  useEffect(function() {
    mountedRef.current = true;
    return function() { mountedRef.current = false; };
  }, []);

  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function getWeekRange(ds) {
    var d = new Date(ds + "T00:00:00");
    var day = d.getDay();
    var diffToMon = day === 0 ? -6 : 1 - day;
    var mon = new Date(d); mon.setDate(mon.getDate() + diffToMon);
    var sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    return { start: fmtDate(mon), end: fmtDate(sun) };
  }

  var weekRange = useMemo(function() { return getWeekRange(selectedDate); }, [selectedDate]);

  // Load snapshot for day view
  var loadDaySnapshot = useCallback(function(date) {
    setSnapLoading(true);
    setSnapError(null);
    var promise = date === todayStr()
      ? TicketsAPI.getSnapshotToday()
      : TicketsAPI.getSnapshotByDate(date);
    promise.then(function(data) {
      if (mountedRef.current) { setSnapshot(data); }
    }).catch(function(err) {
      if (mountedRef.current) {
        setSnapshot(null);
        setSnapError("Could not load snapshot. Make sure ticket-snapshots.php is deployed to the server.");
      }
    }).finally(function() {
      if (mountedRef.current) { setSnapLoading(false); }
    });
  }, []);

  // Load range data for week/month/year
  var loadRange = useCallback(function(from, to) {
    setSnapLoading(true);
    setSnapError(null);
    TicketsAPI.getSnapshotRange(from, to).then(function(data) {
      if (mountedRef.current) { setRangeData(data); }
    }).catch(function() {
      if (mountedRef.current) {
        setRangeData(null);
        setSnapError("Could not load snapshot data. Make sure ticket-snapshots.php is deployed to the server.");
      }
    }).finally(function() {
      if (mountedRef.current) { setSnapLoading(false); }
    });
  }, []);

  // Fetch data whenever view/date/month/year changes
  useEffect(function() {
    if (view === "day") {
      loadDaySnapshot(selectedDate);
    } else if (view === "week") {
      loadRange(weekRange.start, weekRange.end);
    } else if (view === "month") {
      var first = selectedYear + "-" + String(selectedMonth + 1).padStart(2, "0") + "-01";
      var lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      var last = selectedYear + "-" + String(selectedMonth + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");
      loadRange(first, last);
    } else if (view === "year") {
      loadRange(selectedYear + "-01-01", selectedYear + "-12-31");
    }
  }, [view, selectedDate, weekRange, selectedMonth, selectedYear, loadDaySnapshot, loadRange]);

  // Auto-refresh today's snapshot every 30 seconds (only if no error)
  useEffect(function() {
    if (view !== "day" || selectedDate !== todayStr() || snapError) return;
    var interval = setInterval(function() { loadDaySnapshot(todayStr()); }, 30000);
    return function() { clearInterval(interval); };
  }, [view, selectedDate, loadDaySnapshot, snapError]);

  var years = [];
  for (var y = new Date().getFullYear(); y >= 2024; y--) years.push(y);

  // Extract summary from snapshot (day view)
  var total = snapshot ? snapshot.total : 0;
  var attended = snapshot ? snapshot.attended : 0;
  var pending = snapshot ? snapshot.pending : 0;
  var rate = snapshot ? snapshot.rate : 0;
  var byType = snapshot ? (snapshot.by_type || []) : [];

  // For range views, compute totals
  var rangeDays = rangeData ? (rangeData.days || []) : [];
  var rangeTotal = rangeDays.reduce(function(s, d) { return s + d.total; }, 0);
  var rangeAttended = rangeDays.reduce(function(s, d) { return s + d.attended; }, 0);
  var rangePending = rangeDays.reduce(function(s, d) { return s + d.pending; }, 0);
  var rangeRate = rangeTotal > 0 ? Math.round((rangeAttended / rangeTotal) * 100) : 0;

  // Pick which totals to show based on view
  var dispTotal = view === "day" ? total : rangeTotal;
  var dispAttended = view === "day" ? attended : rangeAttended;
  var dispPending = view === "day" ? pending : rangePending;
  var dispRate = view === "day" ? rate : rangeRate;

  return (
    <Block className="mt-5 pt-4">
      <div id="section-daily-tracker">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h6 className="title mb-0">
            <Icon name="calendar" className="me-1 text-primary" />
            Ticket Tracker
          </h6>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap mt-2 mb-4" style={{ paddingBottom: 8 }}>
            {["day","week","month","year"].map(function(v) {
              return (
                <button key={v} className={"btn btn-sm " + (view === v ? "btn-primary" : "btn-outline-light")}
                  onClick={function() { setView(v); }} style={{ textTransform: "capitalize" }}>{v}</button>
              );
            })}
            {(view === "day" || view === "week") && (
              <input type="date" className="form-control form-control-sm" style={{ maxWidth: 160 }}
                value={selectedDate} max={todayStr()} onChange={function(e) { setSelectedDate(e.target.value); }} />
            )}
            {view === "week" && (
              <span className="text-soft" style={{ fontSize: 11 }}>({weekRange.start} &ndash; {weekRange.end})</span>
            )}
            {view === "month" && (
              <React.Fragment>
                <select className="form-select form-select-sm" style={{ maxWidth: 130 }}
                  value={selectedMonth} onChange={function(e) { setSelectedMonth(parseInt(e.target.value)); }}>
                  {MONTHS.map(function(m, i) { return <option key={i} value={i}>{m}</option>; })}
                </select>
                <select className="form-select form-select-sm" style={{ maxWidth: 90 }}
                  value={selectedYear} onChange={function(e) { setSelectedYear(parseInt(e.target.value)); }}>
                  {years.map(function(y) { return <option key={y} value={y}>{y}</option>; })}
                </select>
              </React.Fragment>
            )}
            {view === "year" && (
              <select className="form-select form-select-sm" style={{ maxWidth: 90 }}
                value={selectedYear} onChange={function(e) { setSelectedYear(parseInt(e.target.value)); }}>
                {years.map(function(y) { return <option key={y} value={y}>{y}</option>; })}
              </select>
            )}
            {view === "day" && selectedDate === todayStr() && (
              <button className="btn btn-sm btn-outline-success" onClick={function() { loadDaySnapshot(todayStr()); }} disabled={snapLoading}>
                <Icon name="reload" className="me-1" />{snapLoading ? "Syncing..." : "Sync"}
              </button>
            )}
            <button className="btn btn-sm btn-outline-primary" onClick={function() { exportPDF("section-daily-tracker", "Ticket Tracker Report"); }}>
              <Icon name="file-pdf" className="me-1" /> PDF
            </button>
        </div>

        {snapLoading && <div className="text-center py-2"><Spinner size="sm" color="primary" className="me-1" /> Loading snapshot...</div>}
        {snapError && <div className="alert alert-warning">{snapError}</div>}

        {/* Summary cards */}
        <Row className="g-gs mb-4 mt-4">
          <Col sm="6" md="3">
            <Card className="card-bordered" style={{ borderTop: "3px solid #6576ff" }}>
              <div className="card-inner py-2">
                <div className="text-soft" style={{ fontSize: 10, fontWeight: 600 }}>TOTAL NEW TICKETS</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#6576ff" }}>{fmtNum(dispTotal)}</div>
              </div>
            </Card>
          </Col>
          <Col sm="6" md="3">
            <Card className="card-bordered" style={{ borderTop: "3px solid #52c41a" }}>
              <div className="card-inner py-2">
                <div className="text-soft" style={{ fontSize: 10, fontWeight: 600 }}>ATTENDED</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#52c41a" }}>{fmtNum(dispAttended)}</div>
              </div>
            </Card>
          </Col>
          <Col sm="6" md="3">
            <Card className="card-bordered" style={{ borderTop: "3px solid #e85347" }}>
              <div className="card-inner py-2">
                <div className="text-soft" style={{ fontSize: 10, fontWeight: 600 }}>PENDING (STILL NEW)</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#e85347" }}>{fmtNum(dispPending)}</div>
              </div>
            </Card>
          </Col>
          <Col sm="6" md="3">
            <Card className="card-bordered" style={{ borderTop: "3px solid #fa8c16" }}>
              <div className="card-inner py-2">
                <div className="text-soft" style={{ fontSize: 10, fontWeight: 600 }}>ATTENDANCE RATE</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: dispRate >= 80 ? "#52c41a" : dispRate >= 50 ? "#fa8c16" : "#e85347" }}>{dispRate}%</div>
                <Progress value={dispRate} style={{ height: 5 }} color={dispRate >= 80 ? "success" : dispRate >= 50 ? "warning" : "danger"} />
              </div>
            </Card>
          </Col>
        </Row>

        {/* DAY VIEW - type breakdown from snapshot */}
        {view === "day" && !snapLoading && (
          <Card className="card-bordered">
            <div className="card-inner">
              <h6 className="title mb-3">
                {selectedDate === todayStr() ? "Today" : selectedDate} &ndash; New Tickets by Type
              </h6>
              {byType.length === 0 ? (
                <div className="text-center py-4 text-soft">{snapshot ? "No new tickets snapshot for this date" : "Loading..."}</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ minWidth: 180 }}>Type</th>
                        <th className="text-center" style={{ fontWeight: 700 }}>Total</th>
                        <th className="text-center" style={{ color: "#52c41a" }}>Attended</th>
                        <th className="text-center" style={{ color: "#e85347" }}>Pending</th>
                        <th className="text-center">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byType.map(function(row, i) {
                        var pct = row.total > 0 ? Math.round((row.attended / row.total) * 100) : 0;
                        return (
                          <tr key={row.type} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                            <td>
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: getTypeColor(i), marginRight: 6 }} />
                              <strong>{row.type}</strong>
                            </td>
                            <td className="text-center fw-bold">{row.total}</td>
                            <td className="text-center">
                              {row.attended > 0 ? <Badge color="success" pill>{row.attended}</Badge> : <span className="text-muted">0</span>}
                            </td>
                            <td className="text-center">
                              {row.pending > 0 ? <Badge color="danger" pill>{row.pending}</Badge> : <span className="text-muted">0</span>}
                            </td>
                            <td className="text-center">
                              <div className="d-flex align-items-center justify-content-center gap-1">
                                <Progress value={pct} style={{ width: 50, height: 6 }}
                                  color={pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger"} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: pct >= 80 ? "#52c41a" : pct >= 50 ? "#fa8c16" : "#e85347" }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f0f4ff", fontWeight: 700, borderTop: "2px solid #d0d7e8" }}>
                        <td>TOTAL</td>
                        <td className="text-center">{total}</td>
                        <td className="text-center" style={{ color: "#52c41a" }}>{attended}</td>
                        <td className="text-center" style={{ color: "#e85347" }}>{pending}</td>
                        <td className="text-center" style={{ color: rate >= 80 ? "#52c41a" : "#fa8c16" }}>{rate}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* WEEK / MONTH / YEAR VIEW - daily summary from range API */}
        {view !== "day" && !snapLoading && (
          <Card className="card-bordered">
            <div className="card-inner">
              <h6 className="title mb-3">
                {view === "week" && ("Week: " + weekRange.start + " \u2013 " + weekRange.end)}
                {view === "month" && (MONTHS[selectedMonth] + " " + selectedYear + " \u2013 Daily Summary")}
                {view === "year" && (selectedYear + " \u2013 Monthly Summary")}
              </h6>
              {rangeDays.length === 0 ? (
                <div className="text-center py-4 text-soft">No snapshot data for this period</div>
              ) : (
                <div style={{ overflowX: "auto", maxHeight: 450 }}>
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
                        <th>Date</th>
                        <th>Day</th>
                        <th className="text-center">Total</th>
                        <th className="text-center" style={{ color: "#52c41a" }}>Attended</th>
                        <th className="text-center" style={{ color: "#e85347" }}>Pending</th>
                        <th className="text-center">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rangeDays.map(function(d, i) {
                        var isToday = d.date === todayStr();
                        var dt = new Date(d.date + "T00:00:00");
                        return (
                          <tr key={d.date} style={{ background: isToday ? "#f0f4ff" : i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                            <td style={{ fontWeight: isToday ? 700 : 400 }}>
                              {d.date}{isToday && <Badge color="primary" pill className="ms-1" style={{ fontSize: 9 }}>Today</Badge>}
                            </td>
                            <td>{DAY_NAMES[dt.getDay()]}</td>
                            <td className="text-center fw-bold">{fmtNum(d.total)}</td>
                            <td className="text-center">{d.attended > 0 ? <Badge color="success" pill>{fmtNum(d.attended)}</Badge> : "0"}</td>
                            <td className="text-center">{d.pending > 0 ? <Badge color="danger" pill>{fmtNum(d.pending)}</Badge> : "0"}</td>
                            <td className="text-center">
                              <span style={{ fontWeight: 600, color: d.rate >= 80 ? "#52c41a" : d.rate >= 50 ? "#fa8c16" : "#e85347" }}>{d.rate}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </Block>
  );
};
/* ======================================================================= */
/* SECTION 3 - DASHBOARD                                                    */
/* ======================================================================= */

var SectionDashboard = function(props) {
  var snapshotState = useState(null);
  var snapshot = snapshotState[0], setSnapshot = snapshotState[1];
  var loadingState = useState(false);
  var dashLoading = loadingState[0], setDashLoading = loadingState[1];
  var mountedRef = React.useRef(true);

  useEffect(function() {
    mountedRef.current = true;
    return function() { mountedRef.current = false; };
  }, []);

  useEffect(function() {
    setDashLoading(true);
    TicketsAPI.getSnapshotToday().then(function(data) {
      if (mountedRef.current) setSnapshot(data);
    }).catch(function() {}).finally(function() {
      if (mountedRef.current) setDashLoading(false);
    });
  }, []);

  var total = snapshot ? snapshot.total : 0;
  var attended = snapshot ? snapshot.attended : 0;
  var pending = snapshot ? snapshot.pending : 0;
  var rate = total > 0 ? Math.round((attended / total) * 100) : 0;
  var byType = snapshot ? (snapshot.by_type || []) : [];

  var typeEntries = byType.map(function(t) { return [t.type, { attended: t.attended, pending: t.pending, total: t.total }]; });

  var gaugeData = {
    labels: ["Attended", "Pending"],
    datasets: [{
      data: [attended, pending],
      backgroundColor: ["#52c41a", "#e85347"],
      borderWidth: 0, circumference: 180, rotation: 270,
    }],
  };
  var gaugeOpts = {
    responsive: true, maintainAspectRatio: false, cutout: "75%",
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
  };

  var top10 = typeEntries.slice(0, 10);
  var barData = {
    labels: top10.map(function(e) { var t = e[0]; return t.length > 16 ? t.slice(0, 14) + "..." : t; }),
    datasets: [
      { label: "Attended", data: top10.map(function(e) { return e[1].attended; }), backgroundColor: "#52c41a", borderRadius: 3 },
      { label: "Pending", data: top10.map(function(e) { return e[1].pending; }), backgroundColor: "#e85347", borderRadius: 3 },
    ],
  };
  var barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "top", labels: { usePointStyle: true, font: { size: 11 } } } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
      y: { stacked: true, beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" } },
    },
  };

  var typeDoughnutData = {
    labels: typeEntries.slice(0, 12).map(function(e) { return e[0]; }),
    datasets: [{
      data: typeEntries.slice(0, 12).map(function(e) { return e[1].total; }),
      backgroundColor: typeEntries.slice(0, 12).map(function(_, i) { return getTypeColor(i); }),
      borderWidth: 2, borderColor: "#fff",
    }],
  };

  return (
    <Block className="mt-5 pt-4">
      <div id="section-dashboard">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="title mb-0">
            <Icon name="growth" className="me-1 text-success" />
            Dashboard - Today's Attendance Overview
          </h6>
          <button className="btn btn-sm btn-outline-primary" onClick={function() { exportPDF("section-dashboard", "Ticket Dashboard"); }}>
            <Icon name="file-pdf" className="me-1" /> PDF
          </button>
        </div>

        <Row className="g-gs">
          <Col lg="4">
            <Card className="card-bordered card-full">
              <div className="card-inner text-center">
                <h6 className="title mb-2">Attendance Gauge</h6>
                {dashLoading ? <div className="text-center py-4"><Spinner size="sm" color="primary" /></div> : (
                <React.Fragment>
                <div style={{ height: 180, position: "relative" }}>
                  <Doughnut data={gaugeData} options={gaugeOpts} />
                  <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)" }}>
                    <span style={{ fontSize: 32, fontWeight: 700, color: rate >= 80 ? "#52c41a" : rate >= 50 ? "#fa8c16" : "#e85347" }}>{rate}%</span>
                    <div className="text-soft" style={{ fontSize: 11 }}>of {fmtNum(total)} tickets</div>
                  </div>
                </div>
                <div className="d-flex justify-content-center gap-4 mt-2" style={{ fontSize: 12 }}>
                  <span><span style={{ color: "#52c41a", fontWeight: 700 }}>{fmtNum(attended)}</span> Attended</span>
                  <span><span style={{ color: "#e85347", fontWeight: 700 }}>{fmtNum(pending)}</span> Pending</span>
                </div>
                </React.Fragment>
                )}
              </div>
            </Card>
          </Col>
          <Col lg="4">
            <Card className="card-bordered card-full">
              <div className="card-inner">
                <h6 className="title mb-2">Attended vs Pending by Type</h6>
                <div style={{ height: 250 }}>
                  <Bar data={barData} options={barOpts} />
                </div>
              </div>
            </Card>
          </Col>
          <Col lg="4">
            <Card className="card-bordered card-full">
              <div className="card-inner">
                <h6 className="title mb-2">Ticket Distribution by Type</h6>
                <div style={{ height: 250 }}>
                  <Doughnut data={typeDoughnutData} options={{
                    responsive: true, maintainAspectRatio: false, cutout: "55%",
                    plugins: {
                      legend: { position: "right", labels: { usePointStyle: true, font: { size: 9 }, padding: 6 } },
                      tooltip: { callbacks: {
                        label: function(ctx) { var t = ctx.dataset.data.reduce(function(a,b){return a+b;},0); return ctx.label + ": " + ctx.raw + " (" + (ctx.raw/t*100).toFixed(1) + "%)"; }
                      }},
                    },
                  }} />
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </Block>
  );
};

/* ======================================================================= */
/* SECTION 4 - HISTORICAL TICKETS BY TYPE WITH DATE FILTERING               */
/* ======================================================================= */

var SectionHistorical = function(props) {
  var tickets = props.tickets;
  var modeState = useState("month");
  var filterMode = modeState[0], setFilterMode = modeState[1];

  var initFrom = function() { var d = new Date(); d.setDate(1); return fmtDate(d); };
  var fromState = useState(initFrom());
  var dateFrom = fromState[0], setDateFrom = fromState[1];
  var toState = useState(todayStr());
  var dateTo = toState[0], setDateTo = toState[1];

  var applyPreset = function(mode) {
    var now = new Date();
    if (mode === "day") {
      setDateFrom(todayStr());
      setDateTo(todayStr());
    } else if (mode === "week") {
      var start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      setDateFrom(fmtDate(start));
      setDateTo(todayStr());
    } else if (mode === "month") {
      var startM = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(fmtDate(startM));
      setDateTo(todayStr());
    }
    setFilterMode(mode);
  };

  var filtered = useMemo(function() {
    return tickets.filter(function(t) {
      var raw = t.created_at || t.createdAt || t.date;
      if (!raw) return false;
      var d = fmtDate(new Date(raw));
      return d >= dateFrom && d <= dateTo;
    });
  }, [tickets, dateFrom, dateTo]);

  var byType = useMemo(function() {
    var map = {};
    filtered.forEach(function(t) {
      var type = normaliseType(t.type);
      if (!map[type]) map[type] = { type: type, total: 0, statuses: {} };
      map[type].total++;
      var st = getStatus(t.status);
      map[type].statuses[st] = (map[type].statuses[st] || 0) + 1;
    });
    return Object.values(map).sort(function(a, b) { return b.total - a.total; });
  }, [filtered]);

  var allStatuses = useMemo(function() {
    var set = {};
    byType.forEach(function(r) { Object.keys(r.statuses).forEach(function(s) { set[s] = true; }); });
    return Object.keys(set).sort();
  }, [byType]);

  var grandTotal = filtered.length;
  var dateLabel = dateFrom === dateTo ? dateFrom : dateFrom + " to " + dateTo;

  return (
    <Block className="mt-5 pt-4 mb-5">
      <div id="section-historical">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h6 className="title mb-0">
            <Icon name="histroy" className="me-1 text-warning" />
            Tickets Created by Type &amp; Status
            <span className="text-soft fw-normal ms-2" style={{ fontSize: 12 }}>({dateLabel})</span>
          </h6>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap mt-2 mb-4" style={{ paddingBottom: 8 }}>
            {["day","week","month"].map(function(m) {
              return (
                <button key={m} className={"btn btn-sm " + (filterMode === m ? "btn-warning" : "btn-outline-light")}
                  onClick={function() { applyPreset(m); }} style={{ textTransform: "capitalize" }}>
                  {m === "day" ? "Today" : "This " + m}
                </button>
              );
            })}
            <span className="text-soft" style={{ fontSize: 11 }}>or</span>
            <input type="date" className="form-control form-control-sm" style={{ maxWidth: 145 }}
              value={dateFrom} max={dateTo} onChange={function(e) { setDateFrom(e.target.value); }} />
            <span className="text-soft">to</span>
            <input type="date" className="form-control form-control-sm" style={{ maxWidth: 145 }}
              value={dateTo} min={dateFrom} max={todayStr()} onChange={function(e) { setDateTo(e.target.value); }} />
            <button className="btn btn-sm btn-outline-primary" onClick={function() { exportPDF("section-historical", "Tickets by Type and Status"); }}>
              <Icon name="file-pdf" className="me-1" /> PDF
            </button>
        </div>

        {/* Type cards */}
        <Row className="g-gs mb-3">
          {byType.map(function(item, i) {
            return (
              <Col sm="6" md="4" lg="3" xl="2" key={item.type}>
                <Card className="card-bordered" style={{ borderLeft: "3px solid " + getTypeColor(i) }}>
                  <div className="card-inner py-2 px-3">
                    <div className="text-soft" style={{ fontSize: 10, fontWeight: 600 }}>{item.type}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: getTypeColor(i) }}>{fmtNum(item.total)}</div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* Full table */}
        <Card className="card-bordered">
          <div className="card-inner">
            <div style={{ overflowX: "auto" }}>
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ minWidth: 180 }}>Type</th>
                    <th className="text-center fw-bold">Total</th>
                    {allStatuses.map(function(s) {
                      return <th key={s} className="text-center" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{getStatusLabel(s)}</th>;
                    })}
                    <th className="text-center">%</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map(function(row, i) {
                    var pct = grandTotal > 0 ? ((row.total / grandTotal) * 100).toFixed(1) : 0;
                    return (
                      <tr key={row.type} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: getTypeColor(i), marginRight: 6 }} />
                          <strong>{row.type}</strong>
                        </td>
                        <td className="text-center fw-bold">{row.total}</td>
                        {allStatuses.map(function(s) {
                          var cnt = row.statuses[s] || 0;
                          return (
                            <td key={s} className="text-center">
                              {cnt > 0 ? <span style={{ fontWeight: 600 }}>{cnt}</span> : <span className="text-muted">&mdash;</span>}
                            </td>
                          );
                        })}
                        <td className="text-center">
                          <div className="d-flex align-items-center justify-content-center gap-1">
                            <Progress value={parseFloat(pct)} style={{ width: 40, height: 5 }} color="primary" />
                            <span className="text-soft" style={{ fontSize: 10 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f0f4ff", fontWeight: 700, borderTop: "2px solid #d0d7e8" }}>
                    <td>TOTAL</td>
                    <td className="text-center">{fmtNum(grandTotal)}</td>
                    {allStatuses.map(function(s) {
                      var cnt = byType.reduce(function(sum, r) { return sum + (r.statuses[s] || 0); }, 0);
                      return <td key={s} className="text-center">{fmtNum(cnt)}</td>;
                    })}
                    <td className="text-center text-soft">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-4 text-soft">No tickets found for the selected date range</div>
            )}
          </div>
        </Card>
      </div>
    </Block>
  );
};

export default TicketReports;
