import React, { useEffect, useMemo, useState } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Icon,
} from "../../../components/Component";
import { Card, Col, Row, Spinner } from "reactstrap";
import classnames from "classnames";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { http } from "../../../helpers";
import { Link } from "react-router-dom";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const COLORS = {
  in: "#09c2de",
  inSoft: "rgba(9, 194, 222, 0.12)",
  out: "#f4bd0e",
  outSoft: "rgba(244, 189, 14, 0.12)",
  primary: "#6576ff",
  grid: "rgba(148, 163, 184, 0.16)",
  tick: "#8094ae",
  text: "#364a63",
};

const useIsMobile = (breakpoint = 768) => {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    mq.addListener?.(apply);
    return () => {
      mq.removeEventListener?.("change", apply);
      mq.removeListener?.(apply);
    };
  }, [breakpoint]);
  return mobile;
};

const formatBps = (bits) => {
  const n = Number(bits) || 0;
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
};

const pickRates = (row) => {
  if (!row || row.error) return { inBps: null, outBps: null };
  return {
    inBps: row.internet_in_bps ?? row.rx_bps ?? null,
    outBps: row.internet_out_bps ?? row.customer_tx_bps ?? null,
  };
};

const formatTick = (iso, compact, spanHours) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en", { month: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (compact || (spanHours != null && spanHours <= 36)) return `${hh}:${mm}`;
  return `${dd} ${mon}`;
};

const shortIfaces = (raw) => {
  if (!raw) return "—";
  const parts = String(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} +${parts.length - 1}`;
};

const preparePoints = (rawPoints) => {
  const pts = Array.isArray(rawPoints) ? rawPoints : [];
  if (!pts.length) return { points: [], trimmed: false, spanHours: 0 };

  const withOutIdx = pts.findIndex((p) => p.out != null);
  let working = pts;
  let trimmed = false;
  if (withOutIdx > 0 && withOutIdx < pts.length - 2) {
    working = pts.slice(withOutIdx);
    trimmed = true;
  }

  // Drop leading out samples that are obvious pre-fix glitches (< 25% of later median out)
  const outs = working.map((p) => p.out).filter((v) => v != null && v > 0);
  if (outs.length >= 4) {
    const sorted = [...outs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let start = 0;
    while (
      start < working.length - 2 &&
      working[start].out != null &&
      median > 0 &&
      working[start].out < median * 0.25
    ) {
      start += 1;
      trimmed = true;
    }
    if (start > 0) working = working.slice(start);
  }

  const maxPts = 96;
  if (working.length > maxPts) {
    const step = Math.ceil(working.length / maxPts);
    const sampled = [];
    for (let i = 0; i < working.length; i += step) sampled.push(working[i]);
    const last = working[working.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    working = sampled;
  }

  const t0 = new Date(working[0].t).getTime();
  const t1 = new Date(working[working.length - 1].t).getTime();
  const spanHours =
    Number.isFinite(t0) && Number.isFinite(t1) ? (t1 - t0) / 3600000 : 0;

  return { points: working, trimmed, spanHours };
};

const historyChart = (points, compact, spanHours) => {
  const labels = points.map((p) => formatTick(p.t, compact, spanHours));
  const inData = points.map((p) => {
    const v = p.in != null ? p.in : p.rx;
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  });
  const outData = points.map((p) =>
    p.out != null && Number.isFinite(Number(p.out)) ? Number(p.out) : null
  );
  const hasOut = outData.some((v) => v != null);
  const tooltipTimes = points.map((p) => formatTick(p.t, false, 1));
  const tickEvery = Math.max(1, Math.ceil(labels.length / (compact ? 4 : 7)));

  return {
    labels,
    tooltipTimes,
    tickEvery,
    datasets: [
      {
        label: "Internet in",
        data: inData,
        borderColor: COLORS.in,
        backgroundColor: "transparent",
        fill: false,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.28,
      },
      ...(hasOut
        ? [
            {
              label: "Internet out",
              data: outData,
              borderColor: COLORS.out,
              backgroundColor: "transparent",
              fill: false,
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.28,
              spanGaps: false,
            },
          ]
        : []),
    ],
  };
};

const buildChartOptions = (compact, tooltipTimes = [], tickEvery = 1) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: "index", intersect: false },
  layout: {
    padding: { top: 8, right: 8, bottom: 4, left: 0 },
  },
  plugins: {
    legend: {
      position: "top",
      align: "end",
      labels: {
        usePointStyle: true,
        pointStyle: "line",
        boxWidth: 16,
        padding: 14,
        color: COLORS.tick,
        font: { size: 12, weight: "600" },
      },
    },
    tooltip: {
      backgroundColor: "rgba(54, 74, 99, 0.95)",
      titleColor: "#fff",
      bodyColor: "#e5e9f2",
      padding: 12,
      cornerRadius: 6,
      displayColors: true,
      callbacks: {
        title: (items) => {
          const i = items?.[0]?.dataIndex;
          if (i == null) return "";
          return tooltipTimes[i] || items[0].label || "";
        },
        label: (ctx) => {
          const y = ctx.parsed?.y;
          if (y == null || Number.isNaN(y)) return `${ctx.dataset.label}: —`;
          return `${ctx.dataset.label}: ${formatBps(y)}`;
        },
      },
    },
  },
  scales: {
    x: {
      type: "category",
      offset: false,
      grid: { display: false },
      ticks: {
        maxRotation: 0,
        minRotation: 0,
        autoSkip: false,
        color: COLORS.tick,
        font: { size: compact ? 10 : 11 },
        callback(value, index) {
          const last = this.chart.data.labels.length - 1;
          if (index === 0 || index === last) return this.getLabelForValue(value);
          if (index % tickEvery !== 0) return "";
          return this.getLabelForValue(value);
        },
      },
    },
    y: {
      beginAtZero: true,
      grace: "8%",
      grid: { color: COLORS.grid, drawTicks: false, borderDash: [4, 4] },
      ticks: {
        maxTicksLimit: 6,
        color: COLORS.tick,
        font: { size: compact ? 10 : 11 },
        callback: (v) => formatBps(v),
      },
    },
  },
});

const RANGE_TABS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
];

const PAGE_CSS = `
.bw-page .bw-router {
  border: 1px solid #e5e9f2;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  height: 100%;
  transition: border-color .15s ease, box-shadow .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.bw-page .bw-router:hover {
  border-color: #c5cee0;
  box-shadow: 0 4px 14px rgba(54, 74, 99, 0.06);
}
.bw-page .bw-router.is-active {
  border-color: #6576ff;
  box-shadow: 0 0 0 1px rgba(101, 118, 255, 0.25), 0 6px 18px rgba(101, 118, 255, 0.08);
}
.bw-page .bw-router-inner {
  padding: 1.15rem 1.25rem 1.2rem;
}
.bw-page .bw-router-name {
  font-size: 15px;
  font-weight: 700;
  color: #364a63;
  line-height: 1.3;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bw-page .bw-router-host {
  font-size: 12px;
  color: #8094ae;
  margin-top: 2px;
}
.bw-page .bw-router-link {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8094ae;
  background: #f5f6fa;
  flex-shrink: 0;
}
.bw-page .bw-router-link:hover {
  color: #6576ff;
  background: rgba(101, 118, 255, 0.1);
}
.bw-page .bw-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eef2f7;
}
.bw-page .bw-metric-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8094ae;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.bw-page .bw-metric-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bw-page .bw-metric-value {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.bw-page .bw-metric-iface {
  margin-top: 6px;
  font-size: 11px;
  color: #8094ae;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bw-page .bw-chart-panel {
  border: 1px solid #e5e9f2;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.bw-page .bw-chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem 1.35rem;
  border-bottom: 1px solid #eef2f7;
}
.bw-page .bw-chart-title {
  font-size: 16px;
  font-weight: 700;
  color: #364a63;
  margin: 0 0 0.45rem;
}
.bw-page .bw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bw-page .bw-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f5f6fa;
  color: #526484;
  font-size: 12px;
  font-weight: 500;
  max-width: 100%;
}
.bw-page .bw-chip strong {
  color: #364a63;
  font-weight: 700;
}
.bw-page .bw-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bw-page .bw-range {
  display: inline-flex;
  background: #f5f6fa;
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}
.bw-page .bw-range button {
  border: 0;
  background: transparent;
  color: #8094ae;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 8px 14px;
  border-radius: 6px;
  min-width: 48px;
  min-height: 36px;
}
.bw-page .bw-range button.active {
  background: #fff;
  color: #364a63;
  box-shadow: 0 1px 3px rgba(54, 74, 99, 0.12);
}
.bw-page .bw-chart-body {
  padding: 0.75rem 1rem 1rem;
  position: relative;
}
.bw-page .bw-chart-canvas {
  height: 380px;
  position: relative;
}
.bw-page .bw-empty {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8094ae;
  font-size: 14px;
  text-align: center;
  padding: 1.5rem;
}
@media (max-width: 767.98px) {
  .bw-page .bw-router-inner { padding: 1rem; }
  .bw-page .bw-metric-value { font-size: 1.15rem; }
  .bw-page .bw-chart-head { padding: 1rem; }
  .bw-page .bw-chart-body { padding: 0.5rem 0.65rem 0.85rem; }
  .bw-page .bw-chart-canvas { height: 280px; }
  .bw-page .bw-range { width: 100%; }
  .bw-page .bw-range button { flex: 1; }
}
`;

const Bandwidth = () => {
  const isMobile = useIsMobile(768);
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [range, setRange] = useState("1h");
  const [history, setHistory] = useState({
    points: [],
    wan_interface: null,
    customer_interface: null,
  });
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const { data } = await http.get("/routers/bandwidth");
        if (cancelled) return;
        const list = data?.routers || [];
        setRouters(list);
        setError(null);
        setSelectedId((prev) => prev || list[0]?.id || null);
      } catch (e) {
        if (cancelled) return;
        setError(e?.response?.data?.message || e.message || "Failed to load bandwidth");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadOverview();
    const t = setInterval(loadOverview, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const { data } = await http.get(`/routers/${selectedId}/bandwidth/history`, {
          params: { range },
        });
        if (cancelled) return;
        setHistory({
          points: data?.points || [],
          wan_interface: data?.wan_interface || data?.interface || null,
          customer_interface: data?.customer_interface || null,
          title: data?.router?.title,
        });
      } catch (_) {
        if (cancelled) return;
        setHistory({ points: [], wan_interface: null, customer_interface: null });
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedId, range]);

  const selected = routers.find((r) => r.id === selectedId);
  const live = selected?.live && !selected.live.error ? selected.live : null;
  const latest = selected?.latest;
  const selectedRates = pickRates(live || latest);

  const prepared = useMemo(() => preparePoints(history.points || []), [history.points]);
  const chartData = useMemo(
    () => historyChart(prepared.points, isMobile, prepared.spanHours),
    [prepared.points, prepared.spanHours, isMobile]
  );
  const chartOptions = useMemo(
    () =>
      buildChartOptions(
        isMobile,
        chartData.tooltipTimes || [],
        chartData.tickEvery || 1
      ),
    [isMobile, chartData.tooltipTimes, chartData.tickEvery]
  );
  const hasCustomerOut = prepared.points.some((p) => p.out != null);

  const wanLabel =
    history.wan_interface || live?.wan_interface || latest?.wan_interface || "—";
  const outLabel = shortIfaces(
    history.customer_interface ||
      live?.customer_interface ||
      latest?.customer_interface
  );

  return (
    <>
      <Head title="Router bandwidth" />
      <style>{PAGE_CSS}</style>
      <Content>
        <div className="bw-page">
          <BlockHead size="sm">
            <BlockHeadContent>
              <BlockTitle page>Router bandwidth</BlockTitle>
              <BlockDes>
                Live ISP inbound vs customer uplink throughput for each MikroTik.
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>

          {loading && (
            <div className="text-center py-5">
              <Spinner color="primary" />
            </div>
          )}

          {error && !loading && (
            <Card className="card-bordered mb-4">
              <div className="card-inner text-danger">{error}</div>
            </Card>
          )}

          {!loading && (
            <>
              <Block>
                <Row className="g-gs">
                  {routers.map((r) => {
                    const L = r.live && !r.live.error ? r.live : r.latest;
                    const { inBps, outBps } = pickRates(L);
                    const active = r.id === selectedId;
                    const wan =
                      L?.wan_interface || r.monitor_interface || L?.interface || "—";
                    const outIf = shortIfaces(
                      L?.customer_interface || r.customer_interface
                    );
                    return (
                      <Col xs="12" sm="6" xxl="3" key={r.id}>
                        <div
                          className={classnames("bw-router", { "is-active": active })}
                          onClick={() => setSelectedId(r.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedId(r.id);
                            }
                          }}
                        >
                          <div className="bw-router-inner">
                            <div className="d-flex justify-content-between align-items-start gap-2">
                              <div style={{ minWidth: 0 }}>
                                <h6 className="bw-router-name">{r.title}</h6>
                                <div className="bw-router-host">{r.host}</div>
                              </div>
                              <Link
                                to={`/admin/networking/routers/view/${r.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="bw-router-link"
                                aria-label={`Open ${r.title}`}
                                title="Open router"
                              >
                                <Icon name="external" />
                              </Link>
                            </div>

                            {r.live?.error ? (
                              <div className="text-danger small mt-3">{r.live.error}</div>
                            ) : (
                              <div className="bw-metrics">
                                <div>
                                  <div className="bw-metric-label">
                                    <span
                                      className="bw-metric-dot"
                                      style={{ background: COLORS.in }}
                                    />
                                    In
                                  </div>
                                  <div
                                    className="bw-metric-value"
                                    style={{ color: COLORS.in }}
                                  >
                                    {inBps == null ? "—" : formatBps(inBps)}
                                  </div>
                                  <div className="bw-metric-iface" title={wan}>
                                    {wan}
                                  </div>
                                </div>
                                <div>
                                  <div className="bw-metric-label">
                                    <span
                                      className="bw-metric-dot"
                                      style={{ background: COLORS.out }}
                                    />
                                    Out
                                  </div>
                                  <div
                                    className="bw-metric-value"
                                    style={{ color: COLORS.out }}
                                  >
                                    {outBps == null ? "—" : formatBps(outBps)}
                                  </div>
                                  <div className="bw-metric-iface" title={outIf}>
                                    {outIf}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </Block>

              <Block>
                <div className="bw-chart-panel">
                  <div className="bw-chart-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h6 className="bw-chart-title">
                        {selected?.title || "Select a router"}
                      </h6>
                      <div className="bw-chips">
                        <span className="bw-chip" title={wanLabel}>
                          <span
                            className="bw-chip-dot"
                            style={{ background: COLORS.in }}
                          />
                          In <strong>{formatBps(selectedRates.inBps || 0)}</strong>
                          <span className="text-soft">· {wanLabel}</span>
                        </span>
                        <span className="bw-chip" title={outLabel}>
                          <span
                            className="bw-chip-dot"
                            style={{ background: COLORS.out }}
                          />
                          Out{" "}
                          <strong>
                            {selectedRates.outBps == null
                              ? "—"
                              : formatBps(selectedRates.outBps)}
                          </strong>
                          <span className="text-soft">· {outLabel}</span>
                        </span>
                      </div>
                    </div>

                    <div className="bw-range">
                      {RANGE_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={classnames({ active: range === tab.id })}
                          onClick={() => setRange(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bw-chart-body">
                    {historyLoading ? (
                      <div className="bw-empty">
                        <Spinner size="sm" className="me-2" /> Loading…
                      </div>
                    ) : history.points.length === 0 ? (
                      <div className="bw-empty">
                        No history yet. Samples are collected every minute.
                      </div>
                    ) : (
                      <div className="bw-chart-canvas">
                        {!hasCustomerOut ? (
                          <div className="text-warning small mb-2 px-1">
                            Out samples not available in this range yet.
                          </div>
                        ) : null}
                        <div style={{ height: hasCustomerOut ? "100%" : "calc(100% - 24px)" }}>
                          <Line data={chartData} options={chartOptions} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Block>
            </>
          )}
        </div>
      </Content>
    </>
  );
};

export default Bandwidth;
