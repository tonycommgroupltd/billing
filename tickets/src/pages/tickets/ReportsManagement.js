import React, { useState, useEffect } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Card, Badge, Button as RSButton, Spinner, Alert } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";

const API_BASE = "/api/reports-management";
const DIRECT_REPORTS_BASE = "http://78.159.111.191:3500/api/reports-management";
const REPORTS_API_KEY = "tcom-api-key-2024";

async function fetchReportsJson(path, options = {}) {
  const localUrl = `${API_BASE}${path}`;
  const directUrl = `${DIRECT_REPORTS_BASE}${path}`;

  const parseJsonSafe = async (response) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unexpected non-JSON response (${response.status}): ${text.slice(0, 120)}`);
    }
  };

  // 1) Try local proxy first
  try {
    const localRes = await fetch(localUrl, options);
    const localJson = await parseJsonSafe(localRes);
    if (!localRes.ok) {
      throw new Error(localJson?.error || `HTTP ${localRes.status}`);
    }
    return localJson;
  } catch (localErr) {
    // 2) Fallback directly to reports server (bypasses bad local proxy rewrites)
    const directHeaders = {
      ...(options.headers || {}),
      "x-api-key": REPORTS_API_KEY,
    };
    const directRes = await fetch(directUrl, { ...options, headers: directHeaders });
    const directJson = await parseJsonSafe(directRes);
    if (!directRes.ok) {
      throw new Error(directJson?.error || `HTTP ${directRes.status}`);
    }
    return directJson;
  }
}

const ReportsManagement = () => {
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [cronStatus, setCronStatus] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [logLines, setLogLines] = useState(100);

  // Load logs on mount
  useEffect(() => {
    loadLogs();
    loadCronStatus();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReportsJson(`/logs?lines=${logLines}`);
      if (data.success) {
        setLogs(data.logs || "No logs available");
      } else {
        setError(data.error || "Failed to load logs");
      }
    } catch (err) {
      console.error("Error loading logs:", err);
      setError("Failed to load logs: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCronStatus = async () => {
    try {
      const data = await fetchReportsJson("/cron/status");
      if (data.success) {
        setCronStatus(data);
      }
    } catch (err) {
      console.error("Error loading cron status:", err);
    }
  };

  const triggerReport = async (mode, skipSms = false) => {
    if (!window.confirm(`Are you sure you want to trigger the ${mode} report?`)) {
      return;
    }

    setTriggering(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await fetchReportsJson("/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode, skipSms }),
      });

      if (data.success) {
        setSuccess(data.message);
        // Reload logs after 2 seconds to show new entries
        setTimeout(loadLogs, 2000);
      } else {
        setError(data.error || "Failed to trigger report");
      }
    } catch (err) {
      console.error("Error triggering report:", err);
      setError("Failed to trigger report: " + err.message);
    } finally {
      setTriggering(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm("Are you sure you want to clear all logs?")) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await fetchReportsJson("/logs/clear", {
        method: "POST",
      });

      if (data.success) {
        setSuccess("Logs cleared successfully");
        setLogs("");
      } else {
        setError(data.error || "Failed to clear logs");
      }
    } catch (err) {
      console.error("Error clearing logs:", err);
      setError("Failed to clear logs: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head title="Reports Management" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Daily Reports Management</BlockTitle>
              <BlockDes className="text-soft">
                View logs and manually trigger daily email/SMS reports
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="light" outline className="bg-white d-none d-sm-inline-flex" onClick={loadLogs}>
                <Icon name="reload" />
                <span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {error && (
          <Alert color="danger" className="alert-icon">
            <Icon name="alert-circle" />
            <strong>Error:</strong> {error}
          </Alert>
        )}

        {success && (
          <Alert color="success" className="alert-icon">
            <Icon name="check-circle" />
            <strong>Success:</strong> {success}
          </Alert>
        )}

        <Block>
          {/* Cron Status Card */}
          {cronStatus && (
            <PreviewCard className="mb-3">
              <div className="card-inner">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="title mb-1">Cron Job Status</h6>
                    <Badge color={cronStatus.active ? "success" : "warning"}>
                      {cronStatus.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <Icon name="clock" className="text-soft" style={{ fontSize: 32 }} />
                </div>
                {cronStatus.jobs && cronStatus.jobs.length > 0 && (
                  <div className="mt-3">
                    <small className="text-soft">Scheduled Jobs:</small>
                    <div className="mt-2">
                      {cronStatus.jobs.map((job, idx) => (
                        <div key={idx} className="text-sm font-mono bg-light p-2 rounded mb-1">
                          {job}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PreviewCard>
          )}

          {/* Trigger Reports Card */}
          <PreviewCard className="mb-3">
            <div className="card-inner">
              <h6 className="title mb-3">Trigger Report Manually</h6>
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  color="primary"
                  size="md"
                  onClick={() => triggerReport("morning", false)}
                  disabled={triggering}
                >
                  {triggering ? <Spinner size="sm" /> : <Icon name="sun" />}
                  <span>Send Morning Report</span>
                </Button>
                <Button
                  color="info"
                  size="md"
                  onClick={() => triggerReport("evening", false)}
                  disabled={triggering}
                >
                  {triggering ? <Spinner size="sm" /> : <Icon name="moon" />}
                  <span>Send Evening Report</span>
                </Button>
                <Button
                  color="warning"
                  size="md"
                  outline
                  onClick={() => triggerReport("morning", true)}
                  disabled={triggering}
                >
                  <Icon name="mail" />
                  <span>Morning (Email Only)</span>
                </Button>
                <Button
                  color="warning"
                  size="md"
                  outline
                  onClick={() => triggerReport("evening", true)}
                  disabled={triggering}
                >
                  <Icon name="mail" />
                  <span>Evening (Email Only)</span>
                </Button>
              </div>
              <div className="mt-3">
                <small className="text-soft">
                  <Icon name="info" /> Reports are sent to configured recipients. Check logs below for status.
                </small>
              </div>
            </div>
          </PreviewCard>

          {/* Logs Card */}
          <PreviewCard>
            <div className="card-inner">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="title mb-0">Report Logs</h6>
                <div className="d-flex gap-2">
                  <select
                    className="form-select form-select-sm"
                    style={{ width: 120 }}
                    value={logLines}
                    onChange={(e) => setLogLines(Number(e.target.value))}
                  >
                    <option value={50}>Last 50</option>
                    <option value={100}>Last 100</option>
                    <option value={200}>Last 200</option>
                    <option value={500}>Last 500</option>
                  </select>
                  <RSButton size="sm" color="secondary" outline onClick={loadLogs} disabled={loading}>
                    {loading ? <Spinner size="sm" /> : <Icon name="reload" />}
                  </RSButton>
                  <RSButton size="sm" color="danger" outline onClick={clearLogs} disabled={loading}>
                    <Icon name="trash" />
                  </RSButton>
                </div>
              </div>
              <div
                style={{
                  backgroundColor: "#1e1e1e",
                  color: "#d4d4d4",
                  padding: "1rem",
                  borderRadius: "4px",
                  fontFamily: "Consolas, Monaco, monospace",
                  fontSize: "12px",
                  maxHeight: "500px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {loading ? (
                  <div className="text-center py-4">
                    <Spinner color="light" />
                  </div>
                ) : logs ? (
                  logs
                ) : (
                  <div className="text-muted">No logs available</div>
                )}
              </div>
              <div className="mt-2">
                <small className="text-soft">Log file: /var/log/tcom-report.log</small>
              </div>
            </div>
          </PreviewCard>
        </Block>
      </Content>
    </>
  );
};

export default ReportsManagement;
