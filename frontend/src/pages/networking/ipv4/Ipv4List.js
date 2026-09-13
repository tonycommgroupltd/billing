import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import DataTable from "react-data-table-component";
import { Badge, Alert } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, PreviewCard } from "../../../components/Component";
import { http } from "../../../helpers";

const statusBadge = (status) =>
  status === "used"
    ? <Badge color="danger">In use</Badge>
    : <Badge color="success">Free</Badge>;

const Ipv4List = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const mountedRef = useRef(false);
  const requestRef = useRef(null);

  const fetchScan = useCallback(async () => {
    requestRef.current?.cancel("IPv4 list request replaced");
    const request = axios.CancelToken.source();
    requestRef.current = request;

    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const resp = await http.get("/ipv4-scan", { cancelToken: request.token });
      if (!mountedRef.current || requestRef.current !== request) return;
      const scan = resp.data || {};
      const publicNets = scan.public_networks || (scan.networks || []).filter((n) => n.type === "wan_block");
      const privateNets = scan.private_networks || (scan.networks || []).filter((n) => n.type === "private");
      const flat = [];

      publicNets.forEach((net) => {
        (net.addresses || []).forEach((addr) => {
          flat.push({
            ...addr,
            network: net.title,
            cidr: net.cidr,
            section: "Public",
            location: net.location || "",
          });
        });
      });

      privateNets.forEach((net) => {
        (net.addresses || []).forEach((addr) => {
          flat.push({
            ...addr,
            network: net.title,
            cidr: net.cidr,
            section: "Private",
            location: net.location || net.pool_name || "",
          });
        });
      });

      setRows(flat);
    } catch (error) {
      if (axios.isCancel(error) || !mountedRef.current || requestRef.current !== request) return;
      setRows([]);
    } finally {
      if (!mountedRef.current || requestRef.current !== request) return;
      requestRef.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchScan();
    return () => {
      mountedRef.current = false;
      requestRef.current?.cancel("IPv4 list unmounted");
      requestRef.current = null;
    };
  }, [fetchScan]);

  const filtered = useMemo(() => {
    if (filter === "used") return rows.filter((r) => r.status === "used");
    if (filter === "free") return rows.filter((r) => r.status !== "used");
    if (filter === "public") return rows.filter((r) => r.section === "Public");
    if (filter === "private") return rows.filter((r) => r.section === "Private");
    return rows;
  }, [rows, filter]);

  const columns = useMemo(
    () => [
      { name: "IP", selector: (row) => row.ip, sortable: true, width: "140px" },
      { name: "Section", selector: (row) => row.section, sortable: true, width: "90px" },
      { name: "Network", selector: (row) => row.network, sortable: true, wrap: true },
      { name: "Status", cell: (row) => statusBadge(row.status), width: "100px" },
      { name: "Used for", selector: (row) => row.purpose || "—", wrap: true, grow: 2 },
      { name: "Detail", selector: (row) => row.detail || row.where || "—", wrap: true },
      { name: "Location", selector: (row) => row.location || "—", wrap: true },
    ],
    []
  );

  const usedCount = rows.filter((r) => r.status === "used").length;
  const freeCount = rows.length - usedCount;

  return (
    <React.Fragment>
      <Head title="IPv4 List" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <BlockTitle page tag="h3">IPv4 — List</BlockTitle>
              <Link to={`${process.env.PUBLIC_URL}/admin/networking/ipv4/add`} className="btn btn-primary btn-sm">
                Add network
              </Link>
            </div>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Alert color="light" className="mb-3">
            {rows.length} addresses · <strong className="text-danger">{usedCount}</strong> in use · <strong className="text-success">{freeCount}</strong> free
          </Alert>

          <PreviewCard>
            <div className="d-flex gap-2 mb-3 flex-wrap">
              {[
                ["all", "All"],
                ["public", "Public"],
                ["private", "Private"],
                ["used", "In use"],
                ["free", "Free"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <DataTable
              columns={columns}
              data={filtered}
              progressPending={loading}
              pagination
              paginationPerPage={50}
              dense
              highlightOnHover
              noDataComponent="No addresses loaded. Run a scan from the dashboard."
            />
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Ipv4List;
