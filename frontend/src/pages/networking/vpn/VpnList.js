import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import DataTable from "react-data-table-component";
import { Alert, Badge } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, PreviewCard } from "../../../components/Component";
import { vpnHttp } from "../../../helpers/vpnHttp";
import { PeerBadges } from "./vpnShared";

const hubShort = (name) => {
  if (!name) return "—";
  if (/local/i.test(name)) return "Local";
  if (/cloud/i.test(name)) return "Cloud";
  return name;
};

const VpnList = () => {
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyPeerId, setBusyPeerId] = useState(null);
  const [hubFilter, setHubFilter] = useState("all");
  const [message, setMessage] = useState("");

  const fetchPeers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await vpnHttp.get("/peers");
      setPeers(resp.data?.peers || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load peers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeers();
  }, [fetchPeers]);

  const syncPeer = async (peerId) => {
    setBusyPeerId(peerId);
    setMessage("");
    try {
      const resp = await vpnHttp.post(`/peers/${peerId}/sync`);
      setMessage(resp.data?.message || "Peer synced");
      fetchPeers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusyPeerId(null);
    }
  };

  const testPeer = async (peerId) => {
    setBusyPeerId(peerId);
    setMessage("");
    try {
      const resp = await vpnHttp.post(`/peers/${peerId}/test`);
      const ok = resp.data?.ok;
      setMessage(ok ? "Reachable" : (resp.data?.message || "Unreachable"));
      fetchPeers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusyPeerId(null);
    }
  };

  const hubs = useMemo(() => {
    const map = new Map();
    peers.forEach((p) => {
      if (p.hub_id) map.set(p.hub_id, p.hub_name || p.hub_id);
    });
    return Array.from(map.entries());
  }, [peers]);

  const filtered = useMemo(() => {
    if (hubFilter === "all") return peers;
    return peers.filter((p) => p.hub_id === hubFilter);
  }, [peers, hubFilter]);

  const columns = useMemo(
    () => [
      {
        name: "Hub",
        selector: (row) => row.hub_name,
        sortable: true,
        width: "90px",
        cell: (row) => (
          <Badge color={row.hub_location_type === "cloud" ? "info" : "primary"} pill>
            {hubShort(row.hub_name)}
          </Badge>
        ),
      },
      {
        name: "Name",
        selector: (row) => row.name,
        sortable: true,
        grow: 1,
        wrap: true,
        style: { minWidth: "140px" },
      },
      {
        name: "Tunnel IP",
        selector: (row) => row.tunnel_ip,
        sortable: true,
        width: "120px",
        cell: (row) => <code style={{ fontSize: "12px" }}>{row.tunnel_ip || "—"}</code>,
      },
      {
        name: "Type",
        selector: (row) => row.peer_type,
        width: "90px",
      },
      {
        name: "Status",
        width: "160px",
        cell: (row) => <PeerBadges peer={row} />,
      },
      {
        name: "Public key",
        selector: (row) => row.public_key,
        grow: 2,
        wrap: true,
        cell: (row) => (
          <code title={row.public_key} style={{ fontSize: "11px", wordBreak: "break-all" }}>
            {row.public_key ? `${row.public_key.slice(0, 20)}…` : "—"}
          </code>
        ),
      },
      {
        name: "Actions",
        width: "170px",
        ignoreRowClick: true,
        allowOverflow: true,
        button: true,
        cell: (row) => {
          const busy = busyPeerId === row.id;
          return (
            <div className="d-flex align-items-center" style={{ gap: "6px", whiteSpace: "nowrap" }}>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                style={{ minWidth: "58px" }}
                disabled={busy}
                onClick={() => syncPeer(row.id)}
              >
                {busy ? "…" : "Sync"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                style={{ minWidth: "58px" }}
                disabled={busy}
                onClick={() => testPeer(row.id)}
              >
                {busy ? "…" : "Test"}
              </button>
            </div>
          );
        },
      },
    ],
    [busyPeerId]
  );

  return (
    <React.Fragment>
      <Head title="VPN Peers" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <BlockTitle page tag="h3">
                  VPN — List
                </BlockTitle>
                <p className="text-soft mb-0" style={{ fontSize: "13px" }}>
                  {peers.length} peers configured
                </p>
              </div>
              <div className="d-flex gap-2">
                <Link
                  to={`${process.env.PUBLIC_URL}/admin/networking/vpn/dashboard`}
                  className="btn btn-outline-light btn-sm"
                >
                  Dashboard
                </Link>
                <Link
                  to={`${process.env.PUBLIC_URL}/admin/networking/vpn/add`}
                  className="btn btn-primary btn-sm"
                >
                  Add peer
                </Link>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          {error ? (
            <Alert color="danger" toggle={() => setError("")}>
              {error}
            </Alert>
          ) : null}
          {message ? (
            <Alert color="success" toggle={() => setMessage("")}>
              {message}
            </Alert>
          ) : null}

          <PreviewCard>
            <div className="d-flex gap-2 mb-3 flex-wrap">
              <button
                type="button"
                className={`btn btn-sm ${hubFilter === "all" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setHubFilter("all")}
              >
                All ({peers.length})
              </button>
              {hubs.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  className={`btn btn-sm ${hubFilter === id ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setHubFilter(id)}
                >
                  {hubShort(name)} ({peers.filter((p) => p.hub_id === id).length})
                </button>
              ))}
            </div>

            <DataTable
              columns={columns}
              data={filtered}
              progressPending={loading}
              pagination
              paginationPerPage={25}
              dense
              highlightOnHover
              responsive
              noDataComponent={
                <div className="py-4 text-soft">
                  No VPN peers in TonyComm yet.{" "}
                  <Link to={`${process.env.PUBLIC_URL}/admin/networking/vpn/dashboard`}>Open dashboard</Link>{" "}
                  and use <strong>Import peers</strong> to pull live WireGuard peers from your hubs.
                </div>
              }
            />
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default VpnList;
