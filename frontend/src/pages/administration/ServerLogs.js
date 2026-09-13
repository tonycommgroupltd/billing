import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Alert, Badge, Card, Col, FormGroup, Input, Label, Row } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BackTo,
  Button,
} from "../../components/Component";
import {
  LOG_GROUPS,
  fetchLogCatalog,
  fetchLogTail,
  fetchReportFile,
  getLogServers,
} from "../../helpers/serverLogsApi";

const lineOptions = [100, 200, 500, 1000];

const CATEGORY_MAP = {
  operations: "laravel",
  internal: "laravel",
  portal: "apache_access",
  files: "app_reports",
  email: "laravel",
  sms: "laravel",
  sessions: "system_auth",
  api: "apache_access",
  system: "system_syslog",
  radius: "radius",
  web: "apache_error",
};

const ERROR_LINE_RE =
  /\b(error|fatal|critical|crit|alert|emerg|exception|failed|failure|denied|refused|timeout)\b|]: Error:|PHP Fatal|PHP Parse|SQLSTATE\[|stack trace/i;

function prepareLogLines(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.reverse();
}

function isErrorLine(line) {
  return ERROR_LINE_RE.test(line);
}

const LogViewer = ({ content, loading }) => {
  const lines = useMemo(() => prepareLogLines(content), [content]);

  if (loading) {
    return <div style={{ color: "#94a3b8" }}>Loading…</div>;
  }

  if (!lines.length) {
    return <div style={{ color: "#94a3b8" }}>(empty)</div>;
  }

  return (
    <>
      {lines.map((line, idx) => (
        <div
          key={`${idx}-${line.slice(0, 40)}`}
          style={{
            color: isErrorLine(line) ? "#f87171" : "#e2e8f0",
            fontWeight: isErrorLine(line) ? 500 : 400,
            borderLeft: isErrorLine(line) ? "2px solid #ef4444" : "2px solid transparent",
            paddingLeft: "0.5rem",
            marginBottom: "2px",
          }}
        >
          {line}
        </div>
      ))}
    </>
  );
};

const ServerLogs = () => {
  const { category } = useParams();
  const servers = useMemo(() => getLogServers(), []);
  const [serverId, setServerId] = useState("production");
  const [catalog, setCatalog] = useState(null);
  const [selectedSource, setSelectedSource] = useState("laravel");
  const [selectedReport, setSelectedReport] = useState("");
  const [lines, setLines] = useState(200);
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    setError("");
    try {
      const { data } = await fetchLogCatalog(serverId);
      setCatalog(data);
      if (data?.sources?.length) {
        const mapped = category ? CATEGORY_MAP[category] : null;
        const preferred = mapped
          ? data.sources.find((s) => s.id === mapped && s.available)
          : null;
        const firstAvailable = preferred || data.sources.find((s) => s.available) || data.sources[0];
        const sourceId = mapped === "app_reports" ? "app_reports" : firstAvailable?.id || "system_syslog";
        setSelectedSource(sourceId);
      }
      if (data?.report_files?.length) {
        setSelectedReport(data.report_files[0].name);
      }
    } catch (err) {
      setCatalog(null);
      setError(err.response?.data?.message || err.message || "Failed to load log catalog");
    }
  }, [serverId, category]);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (selectedSource === "app_reports") {
        if (!selectedReport) {
          setContent("");
          setMeta(null);
          return;
        }
        const { data } = await fetchReportFile(serverId, selectedReport, lines);
        setContent(data.content || "");
        setMeta(data);
      } else {
        const { data } = await fetchLogTail(serverId, selectedSource, lines);
        setContent(data.content || "");
        setMeta(data);
      }
    } catch (err) {
      setContent("");
      setMeta(null);
      setError(err.response?.data?.message || err.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [serverId, selectedSource, selectedReport, lines]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (catalog) loadContent();
  }, [catalog, loadContent]);

  const groupedSources = useMemo(() => {
    if (!catalog?.sources) return [];
    const groups = {};
    catalog.sources.forEach((src) => {
      const g = src.group || "other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(src);
    });
    return Object.entries(groups);
  }, [catalog]);

  return (
    <React.Fragment>
      <Head title="Server logs" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BackTo link="/admin/administration" icon="arrow-left">
              Administration
            </BackTo>
            <BlockTitle page tag="h3" className="mt-3">
              Server logs
            </BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          {error && (
            <Alert color="danger" className="mb-3">
              {error}
            </Alert>
          )}

          <Row className="g-gs mb-3">
            <Col md="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <h6 className="mb-3">Server</h6>
                  {servers.map((srv) => (
                    <div key={srv.id} className="form-check mb-2">
                      <input
                        className="form-check-input"
                        type="radio"
                        id={`srv-${srv.id}`}
                        checked={serverId === srv.id}
                        onChange={() => setServerId(srv.id)}
                      />
                      <label className="form-check-label" htmlFor={`srv-${srv.id}`}>
                        {srv.label}
                      </label>
                      {srv.hint && (
                        <div className="text-soft" style={{ fontSize: "11px" }}>
                          {srv.hint}
                        </div>
                      )}
                    </div>
                  ))}
                  {catalog?.server && (
                    <Alert color="light" className="mt-3 mb-0 py-2" style={{ fontSize: "12px" }}>
                      Host: <strong>{catalog.server.hostname}</strong>
                      <br />
                      Role: <Badge color="info">{catalog.server.role}</Badge>
                    </Alert>
                  )}
                </div>
              </Card>
            </Col>

            <Col md="8">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="mb-0">Log source</h6>
                    <Button size="sm" outline disabled={loading} onClick={loadContent}>
                      {loading ? "Loading…" : "Refresh"}
                    </Button>
                  </div>

                  <Row className="g-2 mb-3">
                    <Col sm="8">
                      <FormGroup>
                        <Label>Category</Label>
                        <Input
                          type="select"
                          value={selectedSource}
                          onChange={(e) => setSelectedSource(e.target.value)}
                        >
                          {groupedSources.map(([group, items]) => (
                            <optgroup key={group} label={LOG_GROUPS[group] || group}>
                              {items.map((src) => (
                                <option key={src.id} value={src.id} disabled={!src.available}>
                                  {src.label}
                                  {!src.available ? " (unavailable)" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                          {(catalog?.report_files?.length > 0) && (
                            <option value="app_reports">App report files (JSON/log)</option>
                          )}
                        </Input>
                      </FormGroup>
                    </Col>
                    <Col sm="4">
                      <FormGroup>
                        <Label>Lines</Label>
                        <Input
                          type="select"
                          value={lines}
                          onChange={(e) => setLines(Number(e.target.value))}
                        >
                          {lineOptions.map((n) => (
                            <option key={n} value={n}>
                              Last {n}
                            </option>
                          ))}
                        </Input>
                      </FormGroup>
                    </Col>
                  </Row>

                  {selectedSource === "app_reports" && catalog?.report_files?.length > 0 && (
                    <FormGroup>
                      <Label>Report file</Label>
                      <Input
                        type="select"
                        value={selectedReport}
                        onChange={(e) => setSelectedReport(e.target.value)}
                      >
                        {catalog.report_files.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </Input>
                    </FormGroup>
                  )}

                  {meta && (
                    <p className="text-soft mb-2" style={{ fontSize: "12px" }}>
                      {meta.path || meta.name}
                      {meta.modified && <> · updated {new Date(meta.modified).toLocaleString()}</>}
                      {meta.size != null && <> · {(meta.size / 1024).toFixed(1)} KB</>}
                    </p>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Card className="card-bordered">
            <div className="card-inner">
              <div
                style={{
                  maxHeight: "60vh",
                  overflow: "auto",
                  fontSize: "12px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  background: "#0f172a",
                  padding: "1rem",
                  borderRadius: "6px",
                  wordBreak: "break-word",
                }}
              >
                <LogViewer content={content} loading={loading} />
              </div>
              <p className="text-soft mt-2 mb-0" style={{ fontSize: "12px" }}>
                Newest entries first. Errors highlighted in red.
              </p>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default ServerLogs;
