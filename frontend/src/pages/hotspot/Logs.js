import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Card, CardBody, Col, Input, Row, Spinner } from "reactstrap";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";
import HotspotNav from "./HotspotNav";
import "./hotspot.css";

const levelOf = (line) => {
  const text = String(line || "").toLowerCase();
  if (text.includes("error") || text.includes("failed") || text.includes("exception")) return "error";
  if (text.includes("warn") || text.includes("retry")) return "warn";
  return "info";
};

const formatSize = (value) => {
  const amount = Number(value || 0);
  if (amount >= 1048576) return `${(amount / 1048576).toFixed(2)} MB`;
  if (amount >= 1024) return `${(amount / 1024).toFixed(1)} KB`;
  return `${amount} B`;
};

const HotspotLogs = () => {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState("");
  const [lines, setLines] = useState([]);
  const [lineLimit, setLineLimit] = useState(200);
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    HotspotAPI.getLogs()
      .then((response) => {
        if (!mounted.current) return;
        const list = Array.isArray(response.data) ? response.data : [];
        setFiles(list);
        if (list.length) setSelected(list[0].name);
      })
      .catch((requestError) => {
        if (mounted.current) setError(requestError.response?.data?.error || "Could not load hotspot logs.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, []);

  const loadTail = useCallback(async (quiet = false) => {
    if (!selected) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await HotspotAPI.getLogTail(selected, Number(lineLimit));
      if (!mounted.current) return;
      setLines(Array.isArray(response.data?.lines) ? response.data.lines : []);
      setMetadata(response.data || null);
    } catch (requestError) {
      if (mounted.current) setError(requestError.response?.data?.error || "Could not read this log.");
    } finally {
      if (mounted.current && !quiet) setLoading(false);
    }
  }, [lineLimit, selected]);

  useEffect(() => {
    loadTail();
  }, [loadTail]);

  useEffect(() => {
    if (!autoRefresh || !selected) return undefined;
    const timer = setInterval(() => loadTail(true), 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadTail, selected]);

  const visibleLines = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return lines.filter((line) => {
      const rowLevel = levelOf(line);
      if (level && rowLevel !== level) return false;
      return !needle || String(line).toLowerCase().includes(needle);
    });
  }, [filter, level, lines]);

  return (
    <>
      <Head title="Hotspot logs" />
      <Content>
        <BlockHead size="sm">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 w-100">
            <BlockHeadContent>
              <BlockTitle page>Hotspot logs</BlockTitle>
            </BlockHeadContent>
            <Button color="primary" onClick={() => loadTail()} disabled={!selected || loading}>
              <Icon name="reload" className={loading ? "spinning" : ""} />
              <span>Refresh</span>
            </Button>
          </div>
        </BlockHead>
        <HotspotNav />
        {error && <Alert color="danger">{error}</Alert>}

        <Card className="hotspot-stat-card">
          <CardBody>
            <Row className="g-2 mb-3">
              <Col md="4">
                <Input type="select" value={selected} onChange={(event) => setSelected(event.target.value)}>
                  {files.length === 0 && <option value="">No log files</option>}
                  {files.map((file) => (
                    <option key={file.name} value={file.name}>
                      {file.name} ({formatSize(file.size)})
                    </option>
                  ))}
                </Input>
              </Col>
              <Col md="3">
                <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter log text" />
              </Col>
              <Col md="2">
                <Input type="select" value={level} onChange={(event) => setLevel(event.target.value)}>
                  <option value="">All levels</option>
                  <option value="error">Errors</option>
                  <option value="warn">Warnings</option>
                  <option value="info">Information</option>
                </Input>
              </Col>
              <Col md="2">
                <Input type="select" value={lineLimit} onChange={(event) => setLineLimit(Number(event.target.value))}>
                  <option value="100">100 lines</option>
                  <option value="200">200 lines</option>
                  <option value="500">500 lines</option>
                  <option value="1000">1000 lines</option>
                </Input>
              </Col>
              <Col md="1" className="d-flex align-items-center justify-content-center">
                <label className="small text-soft mb-0" title="Auto-refresh every 10 seconds">
                  <Input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                  /> Auto
                </label>
              </Col>
            </Row>

            <div className="d-flex justify-content-between small text-soft mb-2">
              <span>{metadata?.file || selected || "No log selected"}</span>
              <span>
                {visibleLines.length} lines
                {metadata?.modified_at ? ` · updated ${new Date(metadata.modified_at).toLocaleString()}` : ""}
              </span>
            </div>

            {loading && lines.length === 0 ? (
              <div className="text-center py-5"><Spinner color="primary" /></div>
            ) : (
              <div className="hotspot-log-view" role="log" aria-live="polite">
                {visibleLines.length === 0 ? (
                  <div className="text-center text-soft py-5">No matching log lines.</div>
                ) : visibleLines.map((line, index) => (
                  <div key={`${index}-${line.slice(0, 20)}`} className={`hotspot-log-line ${levelOf(line)}`}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </Content>
    </>
  );
};

export default HotspotLogs;
