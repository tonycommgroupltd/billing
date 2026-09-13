import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import DataTable from "react-data-table-component";
import { Badge, Card, Col, Collapse, Row } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../../components/Component";
import { http } from "../../../helpers";

const statusBadge = (status) =>
  status === "used"
    ? <Badge color="danger">In use</Badge>
    : <Badge color="success">Free</Badge>;

const NetworkList = ({ networks, expandedId, setExpandedId, addressColumns, isPool }) => (
  networks.map((network) => (
    <Card className="card-bordered mb-3" key={`${network.type}-${network.id}`}>
      <div
        className="card-header d-flex justify-content-between align-items-center"
        style={{ cursor: "pointer" }}
        onClick={() => setExpandedId(expandedId === network.id ? null : network.id)}
      >
        <div>
          <strong>{network.title}</strong>
          <span className="text-soft ms-2">{network.cidr}</span>
        </div>
        <div className="d-flex align-items-center" style={{ gap: "12px" }}>
          <span><strong className="text-danger">{network.used}</strong> in use</span>
          <span><strong className="text-success">{network.free}</strong> free</span>
          <Icon name={expandedId === network.id ? "upword-ios" : "downward-ios"} />
        </div>
      </div>
      <Collapse isOpen={expandedId === network.id}>
        <div className="card-body">
          {network.location && (
            <p className="text-soft mb-2" style={{ fontSize: "13px" }}>{network.location}</p>
          )}
          {network.purpose && (
            <p className="text-soft mb-3" style={{ fontSize: "13px" }}>{network.purpose}</p>
          )}
          {isPool ? (
            <>
              <p className="mb-3" style={{ fontSize: "13px" }}>
                Pool <code>{network.pool_name}</code> — showing up to 50 assigned IPs (of {network.used} total).
              </p>
              {(network.addresses || []).length > 0 ? (
                <DataTable columns={addressColumns} data={network.addresses} dense highlightOnHover />
              ) : (
                <span className="text-soft">No assignments in this pool.</span>
              )}
            </>
          ) : (
            <DataTable columns={addressColumns} data={network.addresses || []} dense highlightOnHover />
          )}
        </div>
      </Collapse>
    </Card>
  ))
);

const Ipv4Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scan, setScan] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const mountedRef = useRef(false);
  const requestRef = useRef(null);

  const fetchScan = useCallback(async (refresh = false) => {
    requestRef.current?.cancel("IPv4 scan replaced");
    const request = axios.CancelToken.source();
    requestRef.current = request;

    if (!mountedRef.current) return;
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const resp = await http.get("/ipv4-scan", {
        params: { refresh: refresh ? 1 : 0 },
        cancelToken: request.token,
      });
      if (!mountedRef.current || requestRef.current !== request) return;
      setScan(resp.data);
    } catch (error) {
      if (axios.isCancel(error) || !mountedRef.current || requestRef.current !== request) return;
      setScan(null);
    } finally {
      if (!mountedRef.current || requestRef.current !== request) return;
      requestRef.current = null;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchScan(false);
    return () => {
      mountedRef.current = false;
      requestRef.current?.cancel("IPv4 dashboard unmounted");
      requestRef.current = null;
    };
  }, [fetchScan]);

  const summary = scan?.summary || {};
  const publicNetworks = scan?.public_networks || (scan?.networks || []).filter((n) => n.type === "wan_block");
  const privateNetworks = scan?.private_networks || (scan?.networks || []).filter((n) => n.type === "private");

  const addressColumns = useMemo(
    () => [
      { name: "IP", selector: (row) => row.ip, sortable: true, width: "140px" },
      { name: "Status", cell: (row) => statusBadge(row.status), width: "100px" },
      { name: "Used for", selector: (row) => row.purpose || "—", wrap: true, grow: 2 },
      { name: "Detail", selector: (row) => row.detail || row.where || "—", wrap: true, grow: 1.2 },
    ],
    []
  );

  return (
    <React.Fragment>
      <Head title="IPv4 Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">IPv4 — Dashboard</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Row className="g-gs mb-4">
            <Col md="6">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <h6 className="mb-3">Public (102.0.x)</h6>
                  <Row className="g-2">
                    <Col xs="4"><div className="text-soft">Total</div><div className="h5 mb-0">{summary.public_total ?? 0}</div></Col>
                    <Col xs="4"><div className="text-soft">In use</div><div className="h5 mb-0 text-danger">{summary.public_used ?? 0}</div></Col>
                    <Col xs="4"><div className="text-soft">Free</div><div className="h5 mb-0 text-success">{summary.public_free ?? 0}</div></Col>
                  </Row>
                </div>
              </Card>
            </Col>
            <Col md="6">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <h6 className="mb-3">Private pools</h6>
                  <Row className="g-2">
                    <Col xs="4"><div className="text-soft">Total</div><div className="h5 mb-0">{summary.private_total ?? 0}</div></Col>
                    <Col xs="4"><div className="text-soft">In use</div><div className="h5 mb-0 text-danger">{summary.private_used ?? 0}</div></Col>
                    <Col xs="4"><div className="text-soft">Free</div><div className="h5 mb-0 text-success">{summary.private_free ?? 0}</div></Col>
                  </Row>
                </div>
              </Card>
            </Col>
          </Row>

          <PreviewCard>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="text-soft" style={{ fontSize: "13px" }}>
                {scan?.scanned_at ? `Last scan: ${new Date(scan.scanned_at).toLocaleString()}` : ""}
              </span>
              <Button color="primary" disabled={refreshing} onClick={() => fetchScan(true)}>
                {refreshing ? "Scanning…" : "Refresh scan"}
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-5 text-soft">Loading…</div>
            ) : (
              <>
                <h6 className="mb-3">Public addresses</h6>
                <NetworkList
                  networks={publicNetworks}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  addressColumns={addressColumns}
                  isPool={false}
                />

                <h6 className="mb-3 mt-4">Private address pools</h6>
                <NetworkList
                  networks={privateNetworks}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  addressColumns={addressColumns}
                  isPool
                />
              </>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Ipv4Dashboard;
