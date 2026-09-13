/**
 * LOS Area Report
 * Groups LOS tickets by nearest FAT (Fiber Access Terminal) point.
 * Shows which areas have the most LOS issues in a given period.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
} from "../../components/Component";
import { ticketsHttp as http } from "../../helpers/ticketsHttp";

// ─── LOS ticket types ─────────────────────────────────────────────────────────
const LOS_TYPES = [
  "No LOS no internet",
  "LOS",
  "PON blinking/bad signal",
  "Signal/ Power distribution",
];

// ─── Date Utilities ──────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, "0"); }
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfDay(d)  { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d)    { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function startOfWeek(d) {
  const r = new Date(d);
  const diff = r.getDay() === 0 ? -6 : 1 - r.getDay();
  r.setDate(r.getDate() + diff); r.setHours(0,0,0,0); return r;
}
function endOfWeek(d) {
  const s = startOfWeek(d); const r = new Date(s);
  r.setDate(r.getDate() + 6); r.setHours(23,59,59,999); return r;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23,59,59,999); }

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

function formatPeriodLabel(mode, anchor) {
  if (mode === "daily") {
    return anchor.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  }
  if (mode === "weekly") {
    const s = startOfWeek(anchor), e = endOfWeek(anchor);
    return `${s.toLocaleDateString(undefined,{day:"numeric",month:"short"})} – ${e.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}`;
  }
  return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

function getRange(mode, anchor) {
  if (mode === "daily")  return [startOfDay(anchor),  endOfDay(anchor)];
  if (mode === "weekly") return [startOfWeek(anchor), endOfWeek(anchor)];
  return                        [startOfMonth(anchor),endOfMonth(anchor)];
}

function shiftAnchor(mode, anchor, delta) {
  const d = new Date(anchor);
  if (mode === "daily")  { d.setDate(d.getDate() + delta); return d; }
  if (mode === "weekly") { d.setDate(d.getDate() + delta * 7); return d; }
  d.setMonth(d.getMonth() + delta); return d;
}

function isCurrentPeriod(mode, anchor) {
  const now = new Date();
  if (mode === "daily")  return anchor.toDateString() === now.toDateString();
  if (mode === "weekly") return startOfWeek(anchor).getTime() === startOfWeek(now).getTime();
  return anchor.getMonth() === now.getMonth() && anchor.getFullYear() === now.getFullYear();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  open:        { label: "Open",        color: "#1890ff", bg: "#e6f7ff" },
  in_progress: { label: "In Progress", color: "#fa8c16", bg: "#fff7e6" },
  resolved:    { label: "Resolved",    color: "#52c41a", bg: "#f6ffed" },
  closed:      { label: "Closed",      color: "#8c8c8c", bg: "#f5f5f5" },
  new:         { label: "New",         color: "#722ed1", bg: "#f9f0ff" },
};

function statusMeta(s) { return STATUS_META[s] || STATUS_META.open; }

function normaliseStatus(raw) {
  const s = (raw || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (s === "resolved" || s === "resolve") return "resolved";
  if (["closed","close","solved","installation_complete"].includes(s)) return "closed";
  if (s.includes("progress") || s.includes("ongoing")) return "in_progress";
  if (s === "new") return "new";
  return "open";
}

function formatDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
}

function formatAssigned(raw) {
  if (!raw || raw === "0" || raw === "-") return "Unassigned";
  const s = raw.toString().trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0)
        return arr.length === 1 ? parseName(arr[0]) : `${arr.length} assigned`;
    } catch {}
  }
  return parseName(s);
}

function parseName(s) {
  const m = s.match(/^(.+?)\s*\(/);
  if (m) return m[1].trim();
  if (s.includes("@"))
    return s.split("@")[0].split(/[._-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return s;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(areas, mode, anchor) {
  const period = formatPeriodLabel(mode, anchor).replace(/,/g, "");
  const lines = [
    [`LOS Area Report - ${period}`], [],
    ["Area (FAT)", "Hub", "Open", "In Progress", "Resolved", "Closed", "Total"],
    ...areas.map(a => [
      (a.fat_name || "").replace(/,/g, ";"),
      (a.hub_name || "").replace(/,/g, ";"),
      a.open, a.in_progress, a.resolved, a.closed, a.total,
    ]),
    [], ["--- Individual Tickets ---"],
    ["Area", "Ticket #", "Customer", "Type", "Subject", "Status", "Assigned To", "Date"],
    ...areas.flatMap(a => a.tickets.map(t => [
      (a.fat_name || "").replace(/,/g, ";"),
      t.number || t.id,
      (t.customer_name || "").replace(/,/g, ";"),
      (t.type || "").replace(/,/g, ";"),
      (t.subject || "").replace(/,/g, ";"),
      t.status || "",
      formatAssigned(t.assigned_to),
      formatDate(t.created_at),
    ])),
  ];
  const csv = lines.map(l => l.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `los-area-report-${anchor.toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

const TAB_MODES = ["daily", "weekly", "monthly"];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LOSReport() {
  const navigate = useNavigate();

  const [mode, setMode]         = useState("daily");
  const [anchor, setAnchor]     = useState(new Date());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [expanded, setExpanded] = useState({});

  const [rangeStart, rangeEnd] = useMemo(() => getRange(mode, anchor), [mode, anchor]);

  const fetchReport = useCallback(async (from, to) => {
    setLoading(true); setError(null);
    try {
      const res = await http.get(
        `tickets.php/los-report?from=${toDateStr(from)}&to=${toDateStr(to)}`
      );
      const d = res.data;
      if (d && d.success) { setData(d); setLoadedAt(new Date()); }
      else setError(d?.error || "Failed to load report.");
    } catch (err) {
      setError("Failed to connect to server. Please refresh.");
      console.error("LOSReport:", err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchReport(rangeStart, rangeEnd);
    setExpanded({});
  }, [rangeStart, rangeEnd, fetchReport]);

  const handleModeChange = (m) => { setMode(m); setAnchor(new Date()); };
  const goBack    = () => setAnchor(prev => shiftAnchor(mode, prev, -1));
  const goForward = () => setAnchor(prev => shiftAnchor(mode, prev, +1));
  const goToday   = () => setAnchor(new Date());
  const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const atToday     = isCurrentPeriod(mode, anchor);
  const periodLabel = formatPeriodLabel(mode, anchor);
  const areas       = data?.areas ?? [];
  const total       = data?.total ?? 0;

  const summary = useMemo(() =>
    areas.reduce((acc, a) => ({
      open:        acc.open        + (a.open        || 0),
      in_progress: acc.in_progress + (a.in_progress || 0),
      resolved:    acc.resolved    + (a.resolved    || 0),
      closed:      acc.closed      + (a.closed      || 0),
    }), { open: 0, in_progress: 0, resolved: 0, closed: 0 }),
  [areas]);

  const topArea = areas.find(a => a.area_key !== "unknown" && a.total > 0);

  return (
    <React.Fragment>
      <Head title="LOS Area Report" />
      <Content>

        {/* ── Header ── */}
        <BlockHead size="sm" style={{ marginBottom: 10 }}>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>LOS Area Report</BlockTitle>
              <p style={{ margin: 0, fontSize: 12, color: "#8094ae" }}>
                {LOS_TYPES.join(" · ")}
              </p>
            </BlockHeadContent>
            <BlockHeadContent>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => fetchReport(rangeStart, rangeEnd)} disabled={loading} style={btnStyle}>
                  ↻ Refresh
                </button>
                <button onClick={() => exportCSV(areas, mode, anchor)} disabled={loading || areas.length === 0} style={btnStyle}>
                  ⬇ Export CSV
                </button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {/* ── Mode Tabs ── */}
        <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
          {TAB_MODES.map(m => (
            <button key={m} onClick={() => handleModeChange(m)} style={{
              height: 30, padding: "0 18px", fontSize: 12, cursor: "pointer",
              fontWeight: mode === m ? 600 : 400,
              border: `1px solid ${mode === m ? "#6576ff" : "#e2e8f0"}`,
              borderRadius: 4,
              background: mode === m ? "#6576ff" : "#f5f6fa",
              color: mode === m ? "#fff" : "#526484",
              transition: "all 0.15s",
            }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Period Navigation ── */}
        <div style={periodNavStyle}>
          <button onClick={goBack} style={navBtnStyle}>‹</button>
          <span style={periodLabelStyle}>{periodLabel}</span>
          <button onClick={goForward} style={navBtnStyle} disabled={atToday}>›</button>
          {!atToday && (
            <button onClick={goToday} style={{ ...navBtnStyle, width: "auto", fontSize: 11, padding: "3px 10px" }}>Today</button>
          )}
          {loadedAt && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#8094ae" }}>
              Data as of {loadedAt.toLocaleTimeString()}
            </span>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: "#6576ff", fontSize: 14 }}>Loading LOS area data…</div>
        )}
        {error && (
          <div style={{ background: "#fff2f0", border: "1px solid #ffccc7", borderRadius: 6, padding: "10px 16px", color: "#cf1322", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* FAT location warning */}
            {!data.fat_available && (
              <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 6, padding: "10px 16px", color: "#874d00", marginBottom: 14, fontSize: 12 }}>
                ⚠️ <strong>FAT location data not available.</strong> Make sure the network map has active FAT points with coordinates. Tickets are grouped under "Unknown Area" until locations are set.
              </div>
            )}

            {/* ── Summary Cards ── */}
            <div style={cardsRowStyle}>
              <SummaryCard label="Total LOS"      value={total}                    color="#e84749" icon="🔴" />
              <SummaryCard label="Areas Affected" value={areas.filter(a => a.area_key !== "unknown" && a.total > 0).length} color="#6576ff" icon="📍" />
              <SummaryCard label="Open"           value={summary.open}             color="#1890ff" icon="🔵" />
              <SummaryCard label="In Progress"    value={summary.in_progress}      color="#fa8c16" icon="🔶" />
              <SummaryCard label="Resolved"       value={summary.resolved}         color="#52c41a" icon="✅" />
              <SummaryCard label="Worst Area"     value={topArea?.fat_name ?? "—"} color="#e84749" icon="🔺" small />
            </div>

            {/* ── Area List ── */}
            {areas.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#8094ae", fontSize: 14 }}>
                No LOS tickets found for this period.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {areas.map((area, idx) => {
                  const isUnknown  = area.area_key === "unknown";
                  const isExpanded = expanded[area.area_key];
                  const pct        = total > 0 ? (area.total / total) * 100 : 0;
                  const rankColor  = isUnknown ? "#8094ae"
                    : idx === 0 ? "#e84749"
                    : idx === 1 ? "#fa8c16"
                    : idx === 2 ? "#faad14"
                    : "#6576ff";

                  return (
                    <div key={area.area_key} style={{
                      border: `1px solid ${isExpanded ? "#6576ff" : "#e2e8f0"}`,
                      borderRadius: 8, background: "#fff", overflow: "hidden",
                    }}>
                      {/* ── Area header row ── */}
                      <div
                        onClick={() => toggleExpand(area.area_key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px", cursor: "pointer",
                          background: isExpanded ? "#f5f7ff" : "#fff",
                          transition: "background 0.15s",
                        }}
                      >
                        {/* Rank badge */}
                        {!isUnknown && (
                          <div style={{
                            minWidth: 28, height: 28, borderRadius: "50%",
                            background: rankColor + "1a", color: rankColor,
                            fontSize: 11, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            #{idx + 1}
                          </div>
                        )}
                        {isUnknown && (
                          <div style={{ minWidth: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                            ❓
                          </div>
                        )}

                        {/* Name + hub */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#344357", lineHeight: 1.3 }}>
                            {area.fat_name}
                          </div>
                          {area.hub_name && (
                            <div style={{ fontSize: 11, color: "#8094ae" }}>{area.hub_name}</div>
                          )}
                        </div>

                        {/* Status pills */}
                        <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                          {[
                            { key: "open",        label: "Open",     color: "#1890ff" },
                            { key: "in_progress", label: "In Prog.", color: "#fa8c16" },
                            { key: "resolved",    label: "Resolved", color: "#52c41a" },
                            { key: "closed",      label: "Closed",   color: "#8c8c8c" },
                          ].map(col => area[col.key] > 0 ? (
                            <span key={col.key} title={col.label} style={{
                              fontSize: 11, fontWeight: 700,
                              background: col.color + "1a", color: col.color,
                              padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap",
                            }}>
                              {area[col.key]} {col.label}
                            </span>
                          ) : null)}
                        </div>

                        {/* Bar + total */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 120 }}>
                          <div style={{ width: 80, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: rankColor, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 15, color: rankColor, minWidth: 24, textAlign: "right" }}>
                            {area.total}
                          </span>
                        </div>

                        {/* Expand arrow */}
                        <div style={{ fontSize: 18, color: "#8094ae", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "none", flexShrink: 0 }}>›</div>
                      </div>

                      {/* ── Ticket drill-down ── */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #f0f0f0" }}>
                          <div style={{ padding: "6px 14px", fontSize: 11, color: "#8094ae", background: "#f8fafc", borderBottom: "1px solid #f0f0f0" }}>
                            {area.tickets.length} ticket{area.tickets.length !== 1 ? "s" : ""} — click a row to open
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                  {["Ticket #","Customer","Type","Subject","Status","Assigned To","Date"].map(h => (
                                    <th key={h} style={thStyle}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {area.tickets.map((t, ti) => {
                                  const sm = statusMeta(normaliseStatus(t.status));
                                  const bg = t.archived ? "#fffbf0" : (ti % 2 === 0 ? "#fff" : "#fafbfc");
                                  return (
                                    <tr
                                      key={t.id}
                                      onClick={() => navigate(`/admin/tickets/view/${t.id}`)}
                                      style={{ background: bg, cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}
                                      onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                                      onMouseLeave={e => (e.currentTarget.style.background = bg)}
                                    >
                                      <td style={tdStyle}>
                                        <span style={{ fontWeight: 700, color: "#6576ff" }}>#{t.number || t.id}</span>
                                        {t.archived && (
                                          <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 600, background: "#fffbe6", color: "#d48806", border: "1px solid #ffe58f", borderRadius: 3, padding: "1px 4px" }}>ARC</span>
                                        )}
                                      </td>
                                      <td style={tdStyle}>{t.customer_name || "—"}</td>
                                      <td style={{ ...tdStyle, fontSize: 11, color: "#526484", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{t.type || "—"}</td>
                                      <td style={{ ...tdStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject || "—"}</td>
                                      <td style={tdStyle}>
                                        <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.color }}>
                                          {sm.label}
                                        </span>
                                      </td>
                                      <td style={tdStyle}>{formatAssigned(t.assigned_to)}</td>
                                      <td style={{ ...tdStyle, color: "#8094ae" }}>{formatDate(t.created_at)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </Content>
    </React.Fragment>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SummaryCard = ({ label, value, color, icon, small }) => (
  <div style={{
    flex: "1 1 110px", minWidth: 90,
    background: "#fff", border: "1px solid #e2e8f0",
    borderRadius: 8, padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{ fontSize: 18 }}>{icon}</div>
    <div style={{ fontSize: small ? 13 : 22, fontWeight: 700, color, lineHeight: 1.2, wordBreak: "break-word" }}>{value}</div>
    <div style={{ fontSize: 11, color: "#8094ae", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const btnStyle = {
  height: 30, padding: "0 12px", fontSize: 12, fontWeight: 500,
  border: "1px solid #e2e8f0", borderRadius: 4, background: "#f8fafc",
  color: "#526484", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
};
const periodNavStyle = {
  display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px",
};
const navBtnStyle = {
  width: 28, height: 28, border: "1px solid #e2e8f0", borderRadius: 4,
  background: "#f5f6fa", cursor: "pointer", fontSize: 18, lineHeight: 1,
  color: "#526484", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};
const periodLabelStyle = { fontSize: 14, fontWeight: 600, color: "#344357", flex: 1, textAlign: "center" };
const cardsRowStyle    = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 };
const thStyle = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11,
  color: "#526484", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
};
const tdStyle = { padding: "8px 12px", color: "#526484", fontSize: 12, whiteSpace: "nowrap" };
