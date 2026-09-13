import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Badge, Card, Col, Row, Alert } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Icon, PreviewCard } from "../../../components/Component";
import { vpnHttp } from "../../../helpers/vpnHttp";
import { CommandBlock, PeerBadges } from "./vpnShared";

const VpnDashboard = () => {
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState(null);

  const fetchHubs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await vpnHttp.get("/hubs");
      setHubs(resp.data?.hubs || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load VPN hubs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHubs();
  }, [fetchHubs]);

  const refreshHub = async (hubId) => {
    setRefreshingId(hubId);
    try {
      const resp = await vpnHttp.get(`/hubs/${hubId}/status`);
      const updated = resp.data?.hub;
      if (updated) {
        setHubs((prev) => prev.map((h) => (h.id === hubId ? { ...h, ...updated } : h)));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Hub refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const importPeers = async (hubId) => {
    setRefreshingId(hubId);
    setError("");
    try {
      const resp = await vpnHttp.post(`/hubs/${hubId}/import-peers`);
      const count = resp.data?.imported_count ?? 0;
      await fetchHubs();
      if (count === 0) {
        setError("No new peers to import — live peers may already be registered.");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Import failed");
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <React.Fragment>
      <Head title="VPN Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">VPN Dashboard</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          {error ? <Alert color="danger" toggle={() => setError("")}>{error}</Alert> : null}

          {loading ? (
            <div className="text-center py-5 text-soft">Loading…</div>
          ) : (
            hubs.map((hub) => (
              <Card className="card-bordered mb-4" key={hub.id}>
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                    <div>
                      <h6 className="mb-1">{hub.name}</h6>
                      <span className="text-soft">{hub.host} · {hub.subnet}</span>
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      <Badge color={hub.location_type === "cloud" ? "info" : "primary"}>{hub.location_type}</Badge>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={refreshingId === hub.id}
                        onClick={() => importPeers(hub.id)}
                      >
                        Import peers
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={refreshingId === hub.id}
                        onClick={() => refreshHub(hub.id)}
                      >
                        <Icon name="reload" /> Refresh
                      </button>
                    </div>
                  </div>

                  <Row className="g-gs mb-3">
                    <Col sm="4" md="3">
                      <PreviewCard className="h-100">
                        <span className="sub-text">Configured peers</span>
                        <h4 className="title mb-0">{hub.peers_count ?? 0}</h4>
                      </PreviewCard>
                    </Col>
                    <Col sm="4" md="3">
                      <PreviewCard className="h-100">
                        <span className="sub-text">Live on WireGuard</span>
                        <h4 className="title mb-0">{hub.server_peers_count ?? (hub.server_peers || []).length}</h4>
                      </PreviewCard>
                    </Col>
                    <Col sm="4" md="3">
                      <PreviewCard className="h-100">
                        <span className="sub-text">Available slots</span>
                        <h4 className="title mb-0">
                          {Math.max(0, 246 - (hub.peers_count ?? (hub.peers || []).length))}
                        </h4>
                      </PreviewCard>
                    </Col>
                    <Col sm="4" md="3">
                      <PreviewCard className="h-100">
                        <span className="sub-text">Next free IP</span>
                        <h4 className="title mb-0" style={{ fontSize: "1.1rem" }}>{hub.next_free_tunnel_ip || "—"}</h4>
                      </PreviewCard>
                    </Col>
                    <Col sm="12" md="3">
                      <PreviewCard className="h-100">
                        <span className="sub-text">SSH</span>
                        <h4 className="title mb-0">
                          <Badge color={hub.ssh_configured ? "success" : "warning"}>
                            {hub.ssh_configured ? "Ready" : "No password"}
                          </Badge>
                        </h4>
                      </PreviewCard>
                    </Col>
                  </Row>

                  <h6 className="mb-2">Configured peers</h6>
                  {(hub.peers || []).length === 0 ? (
                    <p className="text-soft mb-3">
                      No peers in TonyComm yet.
                      {(hub.server_peers_count ?? 0) > 0 ? (
                        <> Live WireGuard has <strong>{hub.server_peers_count}</strong> peer(s) — click <strong>Import peers</strong> to register them.</>
                      ) : (
                        <> <Link to={`${process.env.PUBLIC_URL}/admin/networking/vpn/add`}>Add a peer</Link> or import from WireGuard after Refresh.</>
                      )}
                    </p>
                  ) : (
                    <ul className="list-group list-group-flush mb-3">
                      {(hub.peers || []).map((peer) => (
                        <li key={peer.id} className="list-group-item px-0">
                          <div className="d-flex justify-content-between flex-wrap gap-2">
                            <div>
                              <strong>{peer.name}</strong>
                              <code className="ms-2">{peer.tunnel_ip}</code>
                              <div className="mt-1"><PeerBadges peer={peer} /></div>
                            </div>
                            <Link to={`${process.env.PUBLIC_URL}/admin/networking/vpn/list`} className="text-primary" style={{ fontSize: "13px" }}>View in list</Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {(hub.server_peers || []).length > 0 && (
                    <>
                      <h6 className="mb-2">Live peers on hub (wg show)</h6>
                      <ul className="list-group list-group-flush">
                        {hub.server_peers.map((sp, idx) => (
                          <li key={idx} className="list-group-item px-0" style={{ fontSize: "13px" }}>
                            <code>{(sp.public_key || "").slice(0, 20)}…</code>
                            <span className="text-soft ms-2">{sp.allowed_ips || ""}</span>
                            {sp.latest_handshake ? <span className="text-soft ms-2">· {sp.latest_handshake}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {hub.hub_public_key ? (
                    <div className="mt-3">
                      <div className="text-soft mb-1" style={{ fontSize: "12px" }}>Hub public key</div>
                      <CommandBlock text={hub.hub_public_key} />
                    </div>
                  ) : null}
                </div>
              </Card>
            ))
          )}
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default VpnDashboard;
