import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import DataTable from "react-data-table-component";
import { Badge, Col, Row, Spinner, Alert } from "reactstrap";
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
import { oltHttp } from "../../helpers/oltHttp";
import { Link } from "react-router-dom";
import { resolveOltPublicWebUrl } from "../../utils/oltPublicWeb";

const StatusBadge = ({ ok, mode }) => (
    ok
        ? <Badge color="success" pill>{mode === "trap" ? "Traps OK" : "Online"}</Badge>
        : <Badge color="warning" pill>{mode === "trap" ? "No traps" : "Offline"}</Badge>
);

const OltMonitoring = () => {
    const [items, setItems] = useState([]);
    const [traps, setTraps] = useState([]);
    const [setup, setSetup] = useState(null);
    const [gateway, setGateway] = useState(null);
    const [stats, setStats] = useState({ total: 0, online: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchList = useCallback(async (refresh = false) => {
        setLoading(true);
        setError("");
        try {
            const [gwRes, listRes, trapRes, setupRes] = await Promise.all([
                oltHttp.get("/gateway").catch(() => ({ data: null })),
                oltHttp.get("/olts", { params: refresh ? { refresh: "1" } : {} }),
                oltHttp.get("/traps", { params: { limit: 30 } }),
                oltHttp.get("/setup"),
            ]);
            setGateway(gwRes.data);
            setItems(listRes.data.items || []);
            setTraps(trapRes.data.items || []);
            setSetup(setupRes.data);
            setStats({
                total: listRes.data.total || 0,
                online: listRes.data.online || 0,
            });
        } catch (err) {
            setError(err.response?.data?.error || err.message || "Failed to load OLT data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchList();
        const t = setInterval(() => fetchList(), 60000);
        return () => clearInterval(t);
    }, [fetchList]);

    const columns = [
        {
            name: "Status",
            width: "100px",
            cell: (row) => <StatusBadge ok={row.ok} mode={row.monitorMode} />,
        },
        { name: "Name", selector: (row) => row.name, wrap: true, minWidth: "160px" },
        { name: "Host", selector: (row) => row.host, wrap: true, minWidth: "120px" },
        { name: "Mode", selector: (row) => row.monitorMode || "poll", width: "70px" },
        { name: "Model", selector: (row) => row.model || "—", wrap: true },
        {
            name: "Last activity",
            selector: (row) => {
                const t = row.lastTrapAt || row.polledAt;
                return t ? new Date(t).toLocaleString() : "—";
            },
            wrap: true,
            minWidth: "150px",
        },
        {
            name: "Info",
            selector: (row) => row.lastTrapSummary || row.system?.description || row.system?.name || row.error || "—",
            wrap: true,
        },
        {
            name: "Public web",
            width: "130px",
            cell: (row) => {
                const url = resolveOltPublicWebUrl(row);
                if (!url) return <span className="text-soft">—</span>;
                return (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-outline-success"
                        title={url}
                    >
                        <Icon name="external" className="me-1" />
                        Open
                    </a>
                );
            },
        },
        {
            name: "",
            width: "100px",
            cell: (row) => (
                <Link to={`/admin/company/olt-monitoring/${row.id}`} className="btn btn-sm btn-outline-primary">
                    Details
                </Link>
            ),
        },
    ];

    const trapColumns = [
        {
            name: "Time",
            selector: (row) => new Date(row.receivedAt).toLocaleString(),
            width: "160px",
        },
        { name: "Source", selector: (row) => row.sourceIp, width: "120px" },
        { name: "OLT", selector: (row) => row.oltName || "—", wrap: true },
        { name: "Summary", selector: (row) => row.summary || "—", wrap: true },
        { name: "Ver", selector: (row) => row.version || "—", width: "60px" },
    ];

    return (
        <React.Fragment>
            <Head title="OLT Monitoring" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page tag="h3">OLT Monitoring</BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <Button color="primary" outline disabled={loading} onClick={() => fetchList(true)}>
                                <Icon name="reload" />
                            </Button>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>

                {error ? <Alert color="danger">{error}</Alert> : null}

                {setup ? (
                    <Block>
                        <Alert color="info" className="mb-0">
                            Each OLT has its own profile in <code>olts.json</code>.
                            Syslog receiver: UDP {setup.vps?.syslogPort || 5514} · Traps: UDP {setup.vps?.trapPort || 3162}.
                            Public web: V1600D → <code>:8101</code>, V1600G0B → <code>:8200</code> on hub <code>102.0.15.254</code>.
                        </Alert>
                    </Block>
                ) : null}

                <Block>
                    <Row className="g-gs mb-3">
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">OLTs enabled</span>
                                <h4 className="title">{stats.total}</h4>
                            </PreviewCard>
                        </Col>
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">Active</span>
                                <h4 className="title text-success">{stats.online}</h4>
                            </PreviewCard>
                        </Col>
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">Traps received</span>
                                <h4 className="title">{traps.length}</h4>
                            </PreviewCard>
                        </Col>
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">Syslog port</span>
                                <h4 className="title">UDP {setup?.vps?.syslogPort || 5514}</h4>
                            </PreviewCard>
                        </Col>
                    </Row>

                    <PreviewCard>
                        <BlockHeadContent className="mb-2">
                            <BlockTitle tag="h6">OLTs</BlockTitle>
                        </BlockHeadContent>
                        {loading ? (
                            <div className="text-center py-4"><Spinner color="primary" /></div>
                        ) : (
                            <DataTable
                                columns={columns}
                                data={items}
                                highlightOnHover
                                responsive
                                noDataComponent="No OLTs configured"
                            />
                        )}
                    </PreviewCard>
                </Block>

                <Block>
                    <PreviewCard>
                        <BlockHeadContent className="mb-2">
                            <BlockTitle tag="h6">Recent SNMP traps</BlockTitle>
                        </BlockHeadContent>
                        <DataTable
                            columns={trapColumns}
                            data={traps}
                            highlightOnHover
                            responsive
                            dense
                            noDataComponent="No traps yet"
                        />
                    </PreviewCard>
                </Block>
            </Content>
        </React.Fragment>
    );
};

export default OltMonitoring;
