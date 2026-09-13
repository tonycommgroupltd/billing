import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import DataTable from "react-data-table-component";
import {
    Badge,
    Col,
    Row,
    Nav,
    NavItem,
    NavLink,
    TabContent,
    TabPane,
    Spinner,
    Alert,
} from "reactstrap";
import classnames from "classnames";
import {
    Block,
    BlockHead,
    BlockBetween,
    BlockHeadContent,
    BlockTitle,
    BlockDes,
    PreviewCard,
    Button,
    Icon,
    BackTo,
} from "../../components/Component";
import { BarChartExample } from "../../components/charts/Chart";
import { oltHttp } from "../../helpers/oltHttp";
import { useParams } from "react-router-dom";
import { resolveOltPublicWebUrl } from "../../utils/oltPublicWeb";

const safeGet = (url, config) => oltHttp.get(url, config).catch((err) => ({ data: null, error: err }));

const StatusBadge = ({ ok, mode }) => (
    ok
        ? <Badge color="success" pill>{mode === "trap" ? "Traps OK" : "Online"}</Badge>
        : <Badge color="warning" pill>{mode === "trap" ? "No traps" : "Offline"}</Badge>
);

const OltDetail = () => {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState("overview");
    const [config, setConfig] = useState(null);
    const [status, setStatus] = useState(null);
    const [info, setInfo] = useState(null);
    const [onus, setOnus] = useState(null);
    const [logs, setLogs] = useState(null);
    const [error, setError] = useState("");
    const [loadingShell, setLoadingShell] = useState(true);
    const [loadingInfo, setLoadingInfo] = useState(true);
    const [loadingOnus, setLoadingOnus] = useState(true);
    const [loadingLogs, setLoadingLogs] = useState(true);

    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, [id]);

    const applyRes = (res, setter, fallbackError) => {
        if (!mountedRef.current) return;
        if (res.data) setter(res.data);
        else if (res.error) {
            setter(
                fallbackError
                    ? {
                          ok: false,
                          error:
                              res.error?.response?.data?.error ||
                              res.error?.message ||
                              "Request failed",
                      }
                    : { items: [], error: res.error?.response?.data?.error || res.error?.message }
            );
        }
    };

    const loadAll = useCallback(async (refresh = false) => {
        setError("");
        const params = refresh ? { refresh: "1" } : {};

        setLoadingShell(true);
        setLoadingInfo(true);
        setLoadingOnus(true);
        setLoadingLogs(true);

        // Fast shell first (config + cached status) so the page is usable immediately.
        const [configRes, statusRes] = await Promise.all([
            safeGet(`/olts/${id}/config`),
            safeGet(`/olts/${id}`, { params }),
        ]);
        if (!mountedRef.current) return;

        if (configRes.data) setConfig(configRes.data);
        if (statusRes.data) setStatus(statusRes.data);
        if (configRes.error && statusRes.error) {
            setError(configRes.error?.response?.data?.error || "Failed to load OLT");
        }
        setLoadingShell(false);

        // Heavy SNMP polls in parallel — update UI as each finishes (do not block the page).
        const infoP = safeGet(`/olts/${id}/info`, { params }).then((res) => {
            applyRes(res, setInfo, true);
            if (mountedRef.current) setLoadingInfo(false);
        });
        const onusP = safeGet(`/olts/${id}/onus`, { params }).then((res) => {
            applyRes(res, setOnus, true);
            if (mountedRef.current) setLoadingOnus(false);
        });
        const logsP = safeGet(`/olts/${id}/logs`, { params: { limit: 200 } }).then((res) => {
            applyRes(res, setLogs, false);
            if (mountedRef.current) setLoadingLogs(false);
        });

        await Promise.all([infoP, onusP, logsP]);
    }, [id]);

    useEffect(() => {
        // Use cache on open; only "Refresh all" forces live SNMP (can take 1–5 min).
        setConfig(null);
        setStatus(null);
        setInfo(null);
        setOnus(null);
        setLogs(null);
        loadAll(false);
    }, [loadAll]);

    const onuStats = onus?.stats || { total: 0, online: 0, offline: 0 };
    const name = config?.name || status?.summary?.name || id;
    const host = config?.host || status?.summary?.host || "";
    const monitorMode = status?.summary?.monitorMode || config?.monitorMode || "poll";

    const onuChartData = useMemo(() => ({
        labels: ["Online", "Offline"],
        datasets: [
            {
                label: "ONUs",
                backgroundColor: ["#1ee0ac", "#8094ae"],
                borderRadius: 6,
                data: [onuStats.online || 0, onuStats.offline || 0],
            },
        ],
    }), [onuStats.online, onuStats.offline]);

    const onuColumns = [
        {
            name: "Status",
            width: "90px",
            cell: (row) => (
                row.online
                    ? <Badge color="success" pill>Online</Badge>
                    : <Badge color="secondary" pill>Offline</Badge>
            ),
        },
        { name: "PON", selector: (row) => row.ponPort || `EPON0/${row.pon}`, width: "100px" },
        { name: "ONU #", selector: (row) => row.onu, width: "80px" },
        {
            name: config?.mibFamily === "gpon" ? "Serial" : "MAC",
            selector: (row) => row.mac || "—",
            wrap: true,
            minWidth: "140px",
        },
        { name: "Type", selector: (row) => row.onuType || "—", wrap: true },
        { name: "Description", selector: (row) => row.description || "—", wrap: true },
        {
            name: "RX dBm",
            selector: (row) => (row.rxPowerDbm != null ? row.rxPowerDbm : "—"),
            width: "90px",
        },
        { name: "Distance", selector: (row) => row.distance ?? "—", width: "90px" },
        { name: "Last reg", selector: (row) => row.lastRegTime || "—", wrap: true, minWidth: "140px" },
    ];

    const logColumns = [
        {
            name: "Time",
            selector: (row) => new Date(row.receivedAt).toLocaleString(),
            width: "160px",
        },
        { name: "Level", selector: (row) => row.level || "—", width: "80px" },
        { name: "Message", selector: (row) => row.message || row.raw || "—", wrap: true },
    ];

    const pageLoading = loadingShell && !config && !status;

    return (
        <React.Fragment>
            <Head title={`OLT — ${name}`} />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BackTo link="/admin/company/olt-monitoring" icon="arrow-left">
                                OLT Monitoring
                            </BackTo>
                            <BlockTitle page tag="h3" className="mt-2">
                                {name}
                            </BlockTitle>
                            <BlockDes className="text-soft">
                                {host}
                                {config?.model ? ` · ${config.model}` : ""}
                                {config?.snmpProfile ? ` · ${config.snmpProfile}` : ""}
                                {" · "}
                                <StatusBadge ok={status?.summary?.ok} mode={monitorMode} />
                            </BlockDes>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="d-flex flex-wrap gap-2">
                                {resolveOltPublicWebUrl(config || status?.summary || { id, host }) ? (
                                    <a
                                        href={resolveOltPublicWebUrl(config || status?.summary || { id, host })}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-outline-success"
                                    >
                                        <Icon name="external" className="me-1" />
                                        Public web UI
                                    </a>
                                ) : null}
                                <Button color="primary" outline onClick={() => loadAll(true)}>
                                    <Icon name="reload" className="me-1" />
                                    Refresh all (live SNMP)
                                </Button>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>

                {error ? <Alert color="danger">{error}</Alert> : null}

                {pageLoading ? (
                    <div className="text-center py-5"><Spinner color="primary" /></div>
                ) : (
                    <>
                        <Block>
                            <Row className="g-gs">
                                <Col md="6" lg="3">
                                    <PreviewCard>
                                        <span className="sub-text">Total ONUs</span>
                                        <h4 className="title">{loadingOnus ? "…" : onuStats.total}</h4>
                                    </PreviewCard>
                                </Col>
                                <Col md="6" lg="3">
                                    <PreviewCard>
                                        <span className="sub-text">Online</span>
                                        <h4 className="title text-success">{loadingOnus ? "…" : onuStats.online}</h4>
                                    </PreviewCard>
                                </Col>
                                <Col md="6" lg="3">
                                    <PreviewCard>
                                        <span className="sub-text">Offline</span>
                                        <h4 className="title text-secondary">{loadingOnus ? "…" : onuStats.offline}</h4>
                                    </PreviewCard>
                                </Col>
                                <Col md="6" lg="3">
                                    <PreviewCard>
                                        <span className="sub-text">Firmware</span>
                                        <h6 className="title mb-0">{info?.info?.firmware || "—"}</h6>
                                    </PreviewCard>
                                </Col>
                            </Row>
                        </Block>

                        <Block>
                            <Row className="g-gs">
                                <Col lg="5">
                                    <PreviewCard>
                                        <BlockHeadContent className="mb-2">
                                            <BlockTitle tag="h6">ONU status</BlockTitle>
                                        </BlockHeadContent>
                                        {loadingOnus ? (
                                            <div className="py-4 text-center">
                                                <Spinner size="sm" color="primary" className="me-2" />
                                                Loading ONU counts…
                                            </div>
                                        ) : onus?.ok ? (
                                            <div style={{ height: 280 }}>
                                                <BarChartExample data={onuChartData} stacked={false} />
                                            </div>
                                        ) : (
                                            <Alert color="light" className="mb-0">
                                                {onus?.error || "ONU data not available for this OLT."}
                                            </Alert>
                                        )}
                                    </PreviewCard>
                                </Col>
                                <Col lg="7">
                                    <PreviewCard>
                                        <BlockHeadContent className="mb-2">
                                            <BlockTitle tag="h6">OLT hardware</BlockTitle>
                                        </BlockHeadContent>
                                        {loadingInfo ? (
                                            <div className="py-4 text-center"><Spinner size="sm" color="primary" /></div>
                                        ) : info?.ok ? (
                                            <Row className="g-3">
                                                <Col sm="6">
                                                    <table className="table table-sm mb-0">
                                                        <tbody>
                                                            <tr><td>Hostname</td><td>{info.info?.hostname || "—"}</td></tr>
                                                            <tr><td>Serial</td><td>{info.info?.serial || "—"}</td></tr>
                                                            <tr><td>MAC</td><td>{info.info?.mac || "—"}</td></tr>
                                                            <tr><td>Hardware</td><td>{info.info?.hardware || "—"}</td></tr>
                                                        </tbody>
                                                    </table>
                                                </Col>
                                                <Col sm="6">
                                                    <table className="table table-sm mb-0">
                                                        <tbody>
                                                            <tr><td>Uptime</td><td>{info.info?.uptimeText || "—"}</td></tr>
                                                            <tr><td>CPU</td><td>{info.info?.cpuLoad ?? "—"}%</td></tr>
                                                            <tr><td>Memory</td><td>{info.info?.memoryLoad ?? "—"}%</td></tr>
                                                            <tr><td>Temp</td><td>{info.info?.temperatureC ?? "—"} °C</td></tr>
                                                        </tbody>
                                                    </table>
                                                </Col>
                                            </Row>
                                        ) : (
                                            <Alert color="light" className="mb-0">{info?.error || "OLT info unavailable."}</Alert>
                                        )}
                                        {config?.setupHints ? (
                                            <Alert color="info" className="mt-3 mb-0">
                                                Syslog on OLT:{" "}
                                                <code>syslog server ip {config.setupHints.syslogServer} port {config.setupHints.syslogPort}</code>
                                            </Alert>
                                        ) : null}
                                    </PreviewCard>
                                </Col>
                            </Row>
                        </Block>

                        <Block>
                            <PreviewCard>
                                <Nav tabs className="nav-tabs-mb-icon nav-tabs-card">
                                    <NavItem>
                                        <NavLink
                                            tag="a"
                                            href="#tab"
                                            className={classnames({ active: activeTab === "onus" })}
                                            onClick={(e) => { e.preventDefault(); setActiveTab("onus"); }}
                                        >
                                            <Icon name="users" />
                                            <span>ONU list</span>
                                            {!loadingOnus && onus?.ok ? (
                                                <Badge color="light" className="ms-1">{onuStats.total}</Badge>
                                            ) : null}
                                        </NavLink>
                                    </NavItem>
                                    <NavItem>
                                        <NavLink
                                            tag="a"
                                            href="#tab"
                                            className={classnames({ active: activeTab === "logs" })}
                                            onClick={(e) => { e.preventDefault(); setActiveTab("logs"); }}
                                        >
                                            <Icon name="file-text" />
                                            <span>Logs</span>
                                        </NavLink>
                                    </NavItem>
                                </Nav>

                                <TabContent activeTab={activeTab}>
                                    <TabPane tabId="onus">
                                        {loadingOnus ? (
                                            <div className="py-4 text-center">
                                                <Spinner color="primary" className="me-2" />
                                                Loading ONU list via SNMP (can take 1–5 min on first/live refresh)…
                                            </div>
                                        ) : onus?.ok ? (
                                            <DataTable
                                                columns={onuColumns}
                                                data={onus.items || []}
                                                pagination
                                                paginationPerPage={25}
                                                highlightOnHover
                                                responsive
                                                dense
                                                noDataComponent="No ONUs found"
                                            />
                                        ) : (
                                            <Alert color="light">{onus?.error || "Could not load ONU list."}</Alert>
                                        )}
                                    </TabPane>
                                    <TabPane tabId="logs">
                                        {loadingLogs ? (
                                            <div className="py-4 text-center"><Spinner size="sm" color="primary" /></div>
                                        ) : (
                                            <>
                                                <p className="text-soft">
                                                    {logs?.items?.length || 0} entries
                                                    {logs?.stats?.lastAt ? ` · last ${new Date(logs.stats.lastAt).toLocaleString()}` : ""}
                                                </p>
                                                <DataTable
                                                    columns={logColumns}
                                                    data={logs?.items || []}
                                                    pagination
                                                    paginationPerPage={20}
                                                    highlightOnHover
                                                    responsive
                                                    dense
                                                    noDataComponent="No syslog yet — configure remote syslog on the OLT"
                                                />
                                            </>
                                        )}
                                    </TabPane>
                                </TabContent>
                            </PreviewCard>
                        </Block>
                    </>
                )}
            </Content>
        </React.Fragment>
    );
};

export default OltDetail;
