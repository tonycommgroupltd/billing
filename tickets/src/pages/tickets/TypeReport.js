/**
 * TypeReport — reusable full-detail report for a filtered set of ticket types.
 * Used by LOSReport.js and InstallationReport.js
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
import TicketsAPI from "../../helpers/TicketsAPI";

// ─── Date Utilities ──────────────────────────────────────────────────────────

function startOfDay(d)  { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d)    { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function startOfWeek(d) {
  const r = new Date(d);
  const diff = r.getDay() === 0 ? -6 : 1 - r.getDay();
  r.setDate(r.getDate() + diff);
  r.setHours(0,0,0,0);
  return r;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const r = new Date(s);
  r.setDate(r.getDate() + 6);
  r.setHours(23,59,59,999);
  return r;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23,59,59,999); }

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

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
  if (mode === "daily")  return [startOfDay(anchor),   endOfDay(anchor)];
  if (mode === "weekly") return [startOfWeek(anchor),  endOfWeek(anchor)];
  return                        [startOfMonth(anchor), endOfMonth(anchor)];
}

function shiftAnchor(mode, anchor, delta) {
  const d = new Date(anchor);
  if (mode === "daily")  { d.setDate(d.getDate() + delta); return d; }
  if (mode === "weekly") { d.setDate(d.getDate() + delta * 7); return d; }
  d.setMonth(d.getMonth() + delta);
  return d;
}

function isCurrentPeriod(mode, anchor) {
  const now = new Date();
  if (mode === "daily")  return anchor.toDateString() === now.toDateString();
  if (mode === "weekly") return startOfWeek(anchor).getTime() === startOfWeek(now).getTime();
  return anchor.getMonth() === now.getMonth() && anchor.getFullYear() === now.getFullYear();
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

const STATUS_META = {
  new:         { label: "New",         color: "#722ed1", bg: "#f9f0ff" },
  open:        { label: "Open",        color: "#1890ff", bg: "#e6f7ff" },
  in_progress: { label: "In Progress", color: "#fa8c16", bg: "#fff7e6" },
  resolved:    { label: "Resolved",    color: "#52c41a", bg: "#f6ffed" },
  closed:      { label: "Closed",      color: "#8c8c8c", bg: "#f5f5f5" },
};

function normaliseStatus(raw) {
  if (!raw) return "open";
  const s = raw.toString().toLowerCase().trim().replace(/[\s_-]+/g, "_");
  if (s === "resolved" || s === "resolve") return "resolved";
  if (s === "closed" || s === "close" || s === "solved" || s === "installation_complete") return "closed";
  if (s.includes("progress") || s.includes("ongoing")) return "in_progress";
  if (s === "new") return "new";
  return "open";
}

function formatDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
}

function formatAssignedTo(raw) {
  if (!raw || raw === "0" || raw === "-") return "Unassigned";
  const s = raw.toString().trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.length === 1 ? parseName(arr[0]) : `${arr.length} assigned`;
      }
    } catch {}
  }
  return parseName(s);
}

function parseName(s) {
  const m = s.match(/^(.+?)\s*\(/);
  if (m) return m[1].trim();
  if (s.includes("@")) {
    return s.split("@")[0].split(/[._-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return s;
}

// ─── Type Helpers ─────────────────────────────────────────────────────────────
function normaliseTypeLabel(raw) {
  if (!raw) return "";
  const s = raw.toString().trim();
  const lower = s.toLowerCase();
  if (lower === "installation") return "Installation";
  if (lower === "installation 2") return "Installation 2";
  // Collapse accidental case-only duplicates, keep original words.
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(rows, title, mode, anchor) {
  const periodLabel = formatPeriodLabel(mode, anchor).replace(/,/g, "");
  const headers = ["#", "Customer", "Type", "Subject", "Status", "Assigned To", "Date"];
  const lines = [
    [`${title} - ${periodLabel}`],
    [],
    headers,
    ...rows.map(t => [
      t.number || t.id,
      (t.customer?.name || t.customer_name || "").replace(/,/g, ";"),
      normaliseTypeLabel(t.type || "").replace(/,/g, ";"),
      (t.subject || "").replace(/,/g, ";"),
      t.status || "",
      formatAssignedTo(t.assignedTo || t.assigned_to),
      formatDate(t.created_at),
    ]),
  ];
  const csv = lines.map(l => l.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "-").toLowerCase()}-${anchor.toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TAB_MODES = ["daily", "weekly", "monthly"];

// ─── Main Component ───────────────────────────────────────────────────────────

const TypeReport = ({ title, types }) => {
  const navigate = useNavigate();

  const [mode, setMode]         = useState("daily");
  const [anchor, setAnchor]     = useState(new Date());
  const [allTickets, setAll]    = useState([]);
  const [loading, setLoading]   = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState({ field: "created_at", dir: "desc" });

  // ── Load all tickets (active + archived) once ────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, archivedRes] = await Promise.allSettled([
        TicketsAPI.getAll({ per_page: 0 }),
        TicketsAPI.getArchived({ per_page: 0 }),
      ]);
      let active = [], archived = [];
      if (activeRes.status === "fulfilled") {
        const d = activeRes.value;
        active = Array.isArray(d) ? d : (d?.data ?? d?.tickets ?? []);
      }
      if (archivedRes.status === "fulfilled") {
        const d = archivedRes.value;
        archived = Array.isArray(d) ? d : (d?.data ?? d?.tickets ?? []);
        archived = archived.map(t => ({ ...t, _archived: true }));
      }
      setAll([...active, ...archived]);
      setLoadedAt(new Date());
    } catch (err) {
      setError("Failed to load ticket data. Please refresh.");
      console.error("TypeReport load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Computed values ──────────────────────────────────────────────────────
  const typeSet = useMemo(() => new Set(types.map(t => t.toLowerCase())), [types]);

  const [rangeStart, rangeEnd] = useMemo(() => getRange(mode, anchor), [mode, anchor]);

  const periodTickets = useMemo(() => {
    return allTickets.filter(t => {
      if (!typeSet.has((t.type || "").toLowerCase().trim())) return false;
      const raw = t.created_at || t.createdAt;
      if (!raw) return false;
      const d = new Date(raw);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [allTickets, typeSet, rangeStart, rangeEnd]);

  const summary = useMemo(() => {
    const counts = { new: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const t of periodTickets) {
      const s = normaliseStatus(t.status);
      if (counts[s] !== undefined) counts[s]++;
      else counts.open++;
    }
    return { total: periodTickets.length, ...counts };
  }, [periodTickets]);

  const searched = useMemo(() => {
    if (!search.trim()) return periodTickets;
    const q = search.toLowerCase();
    return periodTickets.filter(t => {
      return (
        (t.number || t.id || "").toString().toLowerCase().includes(q) ||
        (t.customer?.name || t.customer_name || "").toLowerCase().includes(q) ||
        (t.subject || "").toLowerCase().includes(q) ||
        formatAssignedTo(t.assignedTo || t.assigned_to).toLowerCase().includes(q)
      );
    });
  }, [periodTickets, search]);

  const displayTypes = useMemo(() => {
    const uniq = new Set(types.map(t => normaliseTypeLabel(t)));
    return Array.from(uniq).filter(Boolean);
  }, [types]);

  const sorted = useMemo(() => {
    return [...searched].sort((a, b) => {
      let va, vb;
      switch (sort.field) {
        case "created_at":
          va = new Date(a.created_at || 0).getTime();
          vb = new Date(b.created_at || 0).getTime();
          break;
        case "customer":
          va = (a.customer?.name || a.customer_name || "").toLowerCase();
          vb = (b.customer?.name || b.customer_name || "").toLowerCase();
          break;
        case "status":
          va = normaliseStatus(a.status);
          vb = normaliseStatus(b.status);
          break;
        case "type":
          va = normaliseTypeLabel(a.type || "").toLowerCase();
          vb = normaliseTypeLabel(b.type || "").toLowerCase();
          break;
        default:
          va = (a[sort.field] || "").toString().toLowerCase();
          vb = (b[sort.field] || "").toString().toLowerCase();
      }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ?  1 : -1;
      return 0;
    });
  }, [searched, sort]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleSort = (field) => {
    setSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  };

  const goBack    = () => setAnchor(prev => shiftAnchor(mode, prev, -1));
  const goForward = () => setAnchor(prev => shiftAnchor(mode, prev, +1));
  const goToday   = () => setAnchor(new Date());
  const handleModeChange = (m) => { setMode(m); setAnchor(new Date()); };

  const periodLabel = formatPeriodLabel(mode, anchor);
  const atToday     = isCurrentPeriod(mode, anchor);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <React.Fragment>
      <Head title={title} />
      <Content>

        {/* ── Header ── */}
        <BlockHead size="sm" style={{ marginBottom: 10 }}>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>{title}</BlockTitle>
              <p style={{ margin: 0, fontSize: 12, color: "#8094ae" }}>
                {displayTypes.join(" · ")}
              </p>
            </BlockHeadContent>
            <BlockHeadContent>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={loadAll} disabled={loading} style={btnStyle}>
                  ↻ Refresh
                </button>
                <button
                  onClick={() => exportCSV(sorted, title, mode, anchor)}
                  disabled={loading || sorted.length === 0}
                  style={btnStyle}
                >
                  ⬇ Export CSV
                </button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {/* ── Mode Tabs ── */}
        <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
          {TAB_MODES.map(m => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              style={{
                height: 30, padding: "0 18px", fontSize: 12, cursor: "pointer",
                fontWeight: mode === m ? 600 : 400,
                border: `1px solid ${mode === m ? "#6576ff" : "#e2e8f0"}`,
                borderRadius: 4,
                background: mode === m ? "#6576ff" : "#f5f6fa",
                color: mode === m ? "#fff" : "#526484",
                transition: "all 0.15s",
              }}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Period Navigation ── */}
        <div style={periodNavStyle}>
          <button onClick={goBack} style={navBtnStyle} title="Previous period">‹</button>
          <span style={periodLabelStyle}>{periodLabel}</span>
          <button onClick={goForward} style={navBtnStyle} disabled={atToday} title="Next period">›</button>
          {!atToday && (
            <button
              onClick={goToday}
              style={{ ...navBtnStyle, width: "auto", fontSize: 11, padding: "3px 10px" }}
            >
              Today
            </button>
          )}
          {loadedAt && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#8094ae" }}>
              Data as of {loadedAt.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* ── Loading / Error ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#6576ff", fontSize: 14 }}>
            Loading ticket data…
          </div>
        )}
        {error && (
          <div style={{ background: "#fff2f0", border: "1px solid #ffccc7", borderRadius: 6, padding: "10px 16px", color: "#cf1322", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Summary Cards ── */}
            <div style={cardsRowStyle}>
              <SummaryCard label="Total"       value={summary.total}       color="#6576ff" icon="📋" />
              <SummaryCard label="New"         value={summary.new}         color="#722ed1" icon="🆕" />
              <SummaryCard label="Open"        value={summary.open}        color="#1890ff" icon="🔵" />
              <SummaryCard label="In Progress" value={summary.in_progress} color="#fa8c16" icon="🔶" />
              <SummaryCard label="Resolved"    value={summary.resolved}    color="#52c41a" icon="✅" />
              <SummaryCard label="Closed"      value={summary.closed}      color="#8c8c8c" icon="⬛" />
            </div>

            {/* ── Search within period ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Search by ticket #, customer, subject or assigned to…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  height: 30, padding: "0 10px", fontSize: 12,
                  border: "1px solid #e2e8f0", borderRadius: 4,
                  width: "100%", maxWidth: 400, outline: "none", color: "#526484",
                }}
              />
              {search.trim() !== "" && (
                <>
                  <span style={{ fontSize: 12, color: "#8094ae" }}>
                    {sorted.length} result{sorted.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => setSearch("")}
                    style={{ ...btnStyle, padding: "0 8px", fontSize: 11 }}
                  >
                    ✕ Clear
                  </button>
                </>
              )}
            </div>

            {/* ── Detail Table ── */}
            {sorted.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#8094ae", fontSize: 14 }}>
                {search ? "No tickets match your search." : "No tickets found for this period."}
              </div>
            ) : (
              <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid #f0f0f0", fontSize: 12, color: "#8094ae" }}>
                  Showing <strong style={{ color: "#344357" }}>{sorted.length}</strong> ticket{sorted.length !== 1 ? "s" : ""} · click a row to open
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                      <Th label="#"           field="number"     sort={sort} onSort={toggleSort} />
                      <Th label="Customer"    field="customer"   sort={sort} onSort={toggleSort} />
                      <Th label="Type"        field="type"       sort={sort} onSort={toggleSort} />
                      <Th label="Subject"     field="subject"    sort={sort} onSort={toggleSort} wide />
                      <Th label="Status"      field="status"     sort={sort} onSort={toggleSort} center />
                      <Th label="Assigned To" field="assignedTo" sort={sort} onSort={toggleSort} />
                      <Th label="Date"        field="created_at" sort={sort} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((t, idx) => {
                      const status   = normaliseStatus(t.status);
                      const meta     = STATUS_META[status] || STATUS_META.open;
                      const custName = t.customer?.name || t.customer_name || "—";
                      const isArch   = t._archived;
                      const baseBg   = isArch ? "#fffbf0" : (idx % 2 === 0 ? "#fff" : "#fafbfc");
                      return (
                        <tr
                          key={t.id}
                          onClick={() => navigate(`/admin/tickets/view/${t.id}`)}
                          style={{ background: baseBg, borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                          onMouseLeave={e => (e.currentTarget.style.background = baseBg)}
                        >
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: "#6576ff" }}>#{t.number || t.id}</span>
                            {isArch && (
                              <span style={{
                                marginLeft: 5, fontSize: 9, fontWeight: 600,
                                background: "#fffbe6", color: "#d48806",
                                border: "1px solid #ffe58f", borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                ARCHIVED
                              </span>
                            )}
                          </td>
                          <td style={tdStyle}>{custName}</td>
                          <td style={{ ...tdStyle, fontSize: 11, color: "#526484", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {normaliseTypeLabel(t.type || "") || "—"}
                          </td>
                          <td style={{ ...tdStyle, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.subject || "—"}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "2px 9px", borderRadius: 10,
                              fontSize: 11, fontWeight: 600,
                              background: meta.bg, color: meta.color,
                            }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {formatAssignedTo(t.assignedTo || t.assigned_to)}
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#8094ae", fontSize: 12 }}>
                            {formatDate(t.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </Content>
    </React.Fragment>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Th = ({ label, field, sort, onSort, center, wide }) => (
  <th
    onClick={() => onSort(field)}
    style={{
      padding: "10px 14px",
      textAlign: center ? "center" : "left",
      fontWeight: 600,
      fontSize: 12,
      color: sort.field === field ? "#6576ff" : "#526484",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      whiteSpace: "nowrap",
      cursor: "pointer",
      userSelect: "none",
      minWidth: wide ? 180 : undefined,
    }}
  >
    {label}
    <span style={{ fontSize: 10, marginLeft: 3, opacity: sort.field === field ? 1 : 0.3 }}>
      {sort.field === field ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  </th>
);

const SummaryCard = ({ label, value, color, icon }) => (
  <div style={{
    flex: "1 1 100px", minWidth: 90,
    background: "#fff", border: "1px solid #e2e8f0",
    borderRadius: 8, padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{ fontSize: 18 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
    <div style={{ fontSize: 11, color: "#8094ae", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {label}
    </div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const btnStyle = {
  height: 30, padding: "0 12px", fontSize: 12, fontWeight: 500,
  border: "1px solid #e2e8f0", borderRadius: 4, background: "#f8fafc",
  color: "#526484", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4,
};

const periodNavStyle = {
  display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
  background: "#fff", border: "1px solid #e2e8f0",
  borderRadius: 8, padding: "8px 14px",
};

const navBtnStyle = {
  width: 28, height: 28,
  border: "1px solid #e2e8f0", borderRadius: 4,
  background: "#f5f6fa", cursor: "pointer",
  fontSize: 18, lineHeight: 1, color: "#526484",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};

const periodLabelStyle = {
  fontSize: 14, fontWeight: 600, color: "#344357",
  flex: 1, textAlign: "center",
};

const cardsRowStyle = {
  display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16,
};

const tdStyle = {
  padding: "9px 14px", color: "#526484", fontSize: 13, whiteSpace: "nowrap",
};

export default TypeReport;
