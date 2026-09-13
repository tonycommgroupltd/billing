import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Col, Progress, Row, Spinner } from "reactstrap";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  PreviewCard,
  Button,
  Icon,
} from "../../components/Component";
import { http } from "../../helpers";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const phaseColor = {
  start: "secondary",
  dump: "info",
  transfer: "primary",
  restore: "warning",
  uploads: "info",
  done: "success",
  idle: "secondary",
};

function StatCard({ label, value, hint }) {
  return (
    <div className="card card-bordered h-100">
      <div className="card-inner py-3">
        <div className="text-soft small">{label}</div>
        <div className="fs-3 fw-bold">{value ?? "—"}</div>
        {hint ? <div className="text-soft small mt-1">{hint}</div> : null}
      </div>
    </div>
  );
}

function formatBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KiB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function formatTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StepRail({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="d-flex flex-column gap-2 mb-3">
      {steps.map((s) => {
        const done = s.state === "done";
        const current = s.state === "current";
        return (
          <div key={s.key} className="d-flex align-items-center gap-2">
            <span
              className={`rounded-circle d-inline-flex align-items-center justify-content-center ${
                done ? "bg-success" : current ? "bg-warning" : "bg-light"
              }`}
              style={{
                width: 22,
                height: 22,
                color: done || current ? "#fff" : "#8094ae",
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {done ? "✓" : current ? "…" : ""}
            </span>
            <span className={current ? "fw-bold" : done ? "text-success" : "text-soft"}>{s.label}</span>
            {current ? (
              <Badge color="warning" pill className="ms-1">
                now
              </Badge>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const HubSync = () => {
  const [data, setData] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [applyLines, setApplyLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logTab, setLogTab] = useState("activity");

  const load = useCallback(async () => {
    const opts = { timeout: 60000 };
    try {
      // Status first (progress UI). Logs are best-effort and must not block the page.
      const statusRes = await http.get("/hub-sync/status", opts);
      setData(statusRes.data);
      setError("");
      const [hourlyRes, applyRes] = await Promise.all([
        http.get("/hub-sync/log", { ...opts, params: { file: "hourly", lines: 80 } }).catch(() => ({ data: { lines: [] } })),
        http.get("/hub-sync/log", { ...opts, params: { file: "apply", lines: 80 } }).catch(() => ({ data: { lines: [] } })),
      ]);
      setLogLines(hourlyRes.data?.lines || []);
      setApplyLines(applyRes.data?.lines || []);
    } catch (err) {
      const msg = err.code === "ECONNABORTED"
        ? "Hub sync status timed out — MySQL may be busy restoring. Retry shortly."
        : (err.response?.data?.message || err.message || "Failed to load hub sync status");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const running = Boolean(data?.progress?.running);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ms = running ? 4000 : 15000;
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, running]);

  const latest = data?.latest || {};
  const live = data?.live || {};
  const apply = data?.last_apply || {};
  const history = data?.history || [];
  const progress = data?.progress || {};
  const activity = data?.activity || [];

  const chartData = useMemo(() => {
    const restoreRows = history.filter(
      (h) => h.main_db?.customers != null || h.tickets_db?.tickets != null || h.status === "ok"
    );
    const labels = restoreRows.map((h) => {
      const d = h.ts ? new Date(h.ts) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : h.phase || "";
    });
    const customers = restoreRows.map((h) => h.main_db?.customers ?? null);
    const users = restoreRows.map((h) => h.main_db?.users ?? null);
    const tickets = restoreRows.map((h) => h.tickets_db?.tickets ?? null);
    return {
      labels,
      datasets: [
        {
          label: "Customers (main DB)",
          data: customers,
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14,165,233,0.15)",
          tension: 0.25,
          fill: true,
          spanGaps: true,
        },
        {
          label: "Users (login)",
          data: users,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.08)",
          tension: 0.25,
          spanGaps: true,
        },
        {
          label: "Tickets",
          data: tickets,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.08)",
          tension: 0.25,
          spanGaps: true,
        },
      ],
    };
  }, [history]);

  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  const phase = progress.phase || latest.phase || "idle";
  const barColor = running ? "warning" : phase === "done" ? "success" : "secondary";

  return (
    <>
      <Head title="Hub Sync" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Hub database sync</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="primary" onClick={load} disabled={loading}>
                <Icon name="reload" />
                <span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {error ? <Alert color="danger">{error}</Alert> : null}

        <Block>
          <PreviewCard>
            {loading && !data ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : (
              <>
                <Row className="g-3 mb-3">
                  <Col md="3">
                    <StatCard label="Live customers" value={live.main_db?.customers} hint="tonycomm.customers" />
                  </Col>
                  <Col md="3">
                    <StatCard label="Live users (login)" value={live.main_db?.users} hint="tonycomm.users" />
                  </Col>
                  <Col md="3">
                    <StatCard label="Live tickets" value={live.tickets_db?.tickets} hint="tickets DB" />
                  </Col>
                  <Col md="3">
                    <StatCard
                      label="RADIUS radacct rows"
                      value={live.main_db?.radacct}
                      hint={live.counts_skipped ? "paused during sync" : "approx · accounting table"}
                    />
                  </Col>
                </Row>
                {live.counts_note ? (
                  <div className="text-soft small mb-3">{live.counts_note}</div>
                ) : null}

                <div className="card card-bordered mb-4">
                  <div className="card-inner">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <Badge color={phaseColor[phase] || "secondary"} pill>
                          {progress.step || phase}
                        </Badge>
                        <Badge color={running ? "warning" : phase === "done" ? "success" : "secondary"} pill>
                          {running ? "Sync in progress" : progress.status || latest.status || "idle"}
                        </Badge>
                      </div>
                      <div className="fw-bold fs-4">{percent}%</div>
                    </div>

                    <Progress
                      animated={running}
                      striped={running}
                      value={running && percent < 3 ? 3 : percent}
                      className="mb-2"
                      color={barColor}
                      style={{ height: 14 }}
                    />

                    <div className="d-flex flex-wrap justify-content-between gap-2 text-soft small mb-3">
                      <span>{progress.message || latest.message || "Waiting for the next Contabo hourly push."}</span>
                      <span>
                        {progress.elapsed_label ? `Elapsed ${progress.elapsed_label}` : null}
                        {progress.elapsed_label && progress.eta_label ? " · " : null}
                        {progress.eta_label || null}
                        {progress.eta_at && running ? ` · ~${new Date(progress.eta_at).toLocaleTimeString()}` : null}
                      </span>
                    </div>

                    {(progress.bytes_total || latest.main_db?.dump_bytes) && (
                      <div className="text-soft small mb-3">
                        Dump size:{" "}
                        {formatBytes(progress.bytes_total || latest.main_db?.dump_bytes) || "—"}
                        {latest.tickets_db?.dump_bytes
                          ? ` (tickets ${formatBytes(latest.tickets_db.dump_bytes)})`
                          : null}
                      </div>
                    )}

                    <Row className="g-3">
                      <Col lg="5">
                        <h6 className="mb-2">Pipeline</h6>
                        <StepRail steps={progress.steps} />
                      </Col>
                      <Col lg="7">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <h6 className="mb-0">What is happening</h6>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className={`btn btn-dim ${logTab === "activity" ? "btn-primary" : "btn-outline-light"}`}
                              onClick={() => setLogTab("activity")}
                            >
                              Activity
                            </button>
                            <button
                              type="button"
                              className={`btn btn-dim ${logTab === "apply" ? "btn-primary" : "btn-outline-light"}`}
                              onClick={() => setLogTab("apply")}
                            >
                              Hub restore log
                            </button>
                            <button
                              type="button"
                              className={`btn btn-dim ${logTab === "hourly" ? "btn-primary" : "btn-outline-light"}`}
                              onClick={() => setLogTab("hourly")}
                            >
                              Contabo log
                            </button>
                          </div>
                        </div>

                        {logTab === "activity" ? (
                          <div
                            className="bg-lighter rounded p-3"
                            style={{ maxHeight: 320, overflow: "auto", fontSize: 13 }}
                          >
                            {activity.length ? (
                              <ul className="list-unstyled mb-0">
                                {activity.map((a, i) => (
                                  <li
                                    key={`${a.ts}-${i}`}
                                    className="mb-2 pb-2"
                                    style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
                                  >
                                    <div className="d-flex justify-content-between gap-2">
                                      <strong>{a.step || a.phase || "step"}</strong>
                                      <span className="text-soft small text-nowrap">
                                        {a.percent != null ? `${a.percent}% · ` : ""}
                                        {formatTs(a.ts)}
                                      </span>
                                    </div>
                                    <div className="text-soft">{a.message || "—"}</div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-soft">No activity yet — a sync will list each wiring step here.</div>
                            )}
                          </div>
                        ) : (
                          <pre
                            className="bg-dark text-light p-3 rounded small mb-0"
                            style={{ maxHeight: 320, overflow: "auto", fontSize: 12 }}
                          >
                            {(logTab === "apply" ? applyLines : logLines).length
                              ? (logTab === "apply" ? applyLines : logLines).join("\n")
                              : `(no ${logTab}.log yet)`}
                          </pre>
                        )}
                      </Col>
                    </Row>
                  </div>
                </div>

                <h6 className="mb-2">Sync history (customers / users / tickets)</h6>
                <div style={{ height: 280 }} className="mb-4">
                  {chartData.labels.length ? (
                    <Line
                      data={chartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: "bottom" } },
                        scales: { y: { beginAtZero: false } },
                      }}
                    />
                  ) : (
                    <div className="text-soft">No chart points yet — run a sync to populate history.</div>
                  )}
                </div>

                <h6 className="mb-2">Last applied on hub</h6>
                <pre className="bg-lighter p-3 rounded small mb-0" style={{ maxHeight: 160, overflow: "auto" }}>
                  {JSON.stringify(
                    apply && Object.keys(apply).length
                      ? apply
                      : latest.main_db
                        ? { main_db: latest.main_db, tickets_db: latest.tickets_db }
                        : {},
                    null,
                    2
                  )}
                </pre>
              </>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </>
  );
};

export default HubSync;
