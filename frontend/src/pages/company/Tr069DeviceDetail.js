import React, { useState, useEffect, useCallback } from "react";
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
import { tr069Http } from "../../helpers/tr069Http";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";

const OnlineBadge = ({ online }) => (
    online ? <Badge color="success" pill>Online</Badge> : <Badge color="secondary" pill>Offline</Badge>
);

const opticalAlertClass = (severity) => {
    if (severity === "critical") return "danger";
    if (severity === "warning") return "warning";
    if (severity === "good") return "success";
    return "secondary";
};

const Tr069DeviceDetail = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const deviceId = decodeURIComponent(id);
    const customerId = searchParams.get("customerId");
    const serviceId = searchParams.get("serviceId");

    const [device, setDevice] = useState(null);
    const [live, setLive] = useState(null);
    const [pppoeComparison, setPppoeComparison] = useState(null);
    const [loading, setLoading] = useState(true);
    const [liveLoading, setLiveLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState("");
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("1");
    const [hostFilter, setHostFilter] = useState("active");

    const [ssid, setSsid] = useState("");
    const [wifiPass, setWifiPass] = useState("");
    const [pppoeUser, setPppoeUser] = useState("");
    const [pppoePass, setPppoePass] = useState("");
    const [showAcsPass, setShowAcsPass] = useState(false);

    const loadLive = useCallback(async () => {
        setLiveLoading(true);
        try {
            const params = {};
            if (customerId) params.customerId = customerId;
            if (serviceId) params.serviceId = serviceId;
            const response = await tr069Http.get(
                `/devices/${encodeURIComponent(deviceId)}/live`,
                { params }
            );
            setLive(response.data);
            setPppoeComparison(response.data.pppoeComparison);
            if (response.data.pppoe?.username) setPppoeUser(response.data.pppoe.username);
            if (response.data.wlan?.[0]?.ssid) setSsid(response.data.wlan[0].ssid);
            else if (response.data.summary?.wifiSsid) setSsid(response.data.summary.wifiSsid);
            setError("");
        } catch (err) {
            setError(err.response?.data?.error || err.message || "Failed to load live data");
        } finally {
            setLiveLoading(false);
        }
    }, [deviceId, customerId, serviceId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError("");
            try {
                const response = await tr069Http.get(
                    `/devices/${encodeURIComponent(deviceId)}`
                );
                if (!cancelled) {
                    setDevice(response.data.device);
                    setSsid(response.data.device?.wifi_ssid || "");
                    if (response.data.device?.pppoe_username) {
                        setPppoeUser(response.data.device.pppoe_username);
                    }
                }
                await loadLive();
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.error || err.message || "Device not found");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [deviceId, loadLive]);

    const runAction = async (name, fn) => {
        setActionLoading(name);
        try {
            const response = await fn();
            toast.success(response.data?.message || "Done");
            await loadLive();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || "Action failed");
        } finally {
            setActionLoading("");
        }
    };

    const syncFromBilling = () => runAction("sync", () =>
        tr069Http.post(`/devices/${encodeURIComponent(deviceId)}/sync-pppoe`, {
            customerId: customerId ? Number(customerId) : device?.customer_id,
            serviceId: serviceId ? Number(serviceId) : device?.service_id,
        })
    );

    if (loading) {
        return (
            <Content>
                <div className="text-center py-5"><Spinner color="primary" /></div>
            </Content>
        );
    }

    if (error && !device) {
        return (
            <Content>
                <Alert color="danger">{error}</Alert>
                <BackTo link="/admin/company/tr069" icon="arrow-left">TR-069 devices</BackTo>
            </Content>
        );
    }

    const summary = live?.summary || {};
    const pppoe = live?.pppoe || {};
    const optical = live?.optical || {};
    const online = summary.online ?? device?.online;
    const activeHosts = live?.activeDevices || [];
    const offlineHosts = live?.offlineDevices || [];
    const allHosts = live?.connectedDevices || [];
    const filteredHosts = hostFilter === "active"
        ? activeHosts
        : hostFilter === "offline"
            ? offlineHosts
            : allHosts;

    const hostColumns = [
        {
            name: "Status",
            width: "90px",
            cell: (row) => (
                row.online ? <Badge color="success" pill>Online</Badge>
                    : row.offline ? <Badge color="secondary" pill>Offline</Badge>
                        : <Badge color="light" pill>Unknown</Badge>
            ),
        },
        { name: "Hostname", selector: (row) => row.hostname || "—", wrap: true },
        { name: "IP", selector: (row) => row.ip || "—", wrap: true },
        { name: "MAC", selector: (row) => row.mac || "—", wrap: true },
    ];

    return (
        <React.Fragment>
            <Head title={`ONU ${device?.serial_number || deviceId}`} />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BackTo link="/admin/company/tr069" icon="arrow-left">
                                TR-069 devices
                            </BackTo>
                            <BlockTitle page tag="h3" className="mt-2">
                                {device?.serial_number || deviceId}
                                {" "}
                                <OnlineBadge online={online} />
                            </BlockTitle>
                            <BlockDes className="text-soft">
                                {device?.product_class} · {device?.manufacturer || "—"}
                                {device?.customer_name ? (
                                    <>
                                        {" · "}
                                        <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${device.customer_id}`}>
                                            {device.customer_name}
                                        </Link>
                                        {device.customer_phone ? ` (${device.customer_phone})` : ""}
                                    </>
                                ) : null}
                            </BlockDes>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="d-flex gap-2 flex-wrap">
                                <Button
                                    color="primary"
                                    outline
                                    disabled={liveLoading}
                                    onClick={loadLive}
                                >
                                    <Icon name="reload" className="me-1" />
                                    {liveLoading ? "Refreshing…" : "Refresh"}
                                </Button>
                                <Button
                                    color="warning"
                                    outline
                                    disabled={!!actionLoading}
                                    onClick={() => runAction("refresh", () =>
                                        tr069Http.post(
                                            `/devices/${encodeURIComponent(deviceId)}/refresh`,
                                            { objectName: "InternetGatewayDevice." }
                                        )
                                    )}
                                >
                                    Refresh parameters
                                </Button>
                                <Button
                                    color="danger"
                                    outline
                                    disabled={!!actionLoading}
                                    onClick={() => {
                                        if (window.confirm("Queue remote reboot on this ONU?")) {
                                            runAction("reboot", () =>
                                                tr069Http.post(
                                                    `/devices/${encodeURIComponent(deviceId)}/reboot`
                                                )
                                            );
                                        }
                                    }}
                                >
                                    Reboot ONU
                                </Button>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>

                {error ? <Alert color="danger">{error}</Alert> : null}

                {pppoeComparison?.usernameMismatch ? (
                    <Alert color="warning" className="alert-icon">
                        <Icon name="alert-circle" />
                        <strong>PPPoE mismatch — </strong>
                        {pppoeComparison.message}
                        {" "}
                        Billing expects <code>{pppoeComparison.billingUsername}</code>
                        {pppoeComparison.billingPasswordAvailable ? (
                            <div className="mt-2">
                                <Button
                                    color="warning"
                                    size="sm"
                                    disabled={!!actionLoading}
                                    onClick={syncFromBilling}
                                >
                                    {actionLoading === "sync"
                                        ? "Applying…"
                                        : "Apply billing PPPoE to ONU"}
                                </Button>
                            </div>
                        ) : (
                            <span className="d-block mt-1 text-soft">
                                Billing password missing — set mikrotik_password on the service first.
                            </span>
                        )}
                    </Alert>
                ) : pppoeComparison?.hasBilling ? (
                    <Alert color="success" className="alert-icon">
                        <Icon name="check-circle" />
                        PPPoE username matches TonyComm billing ({pppoeComparison.billingUsername}).
                    </Alert>
                ) : null}

                <Block>
                    <Row className="g-gs">
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">GPON RX</span>
                                <h4 className={`title text-${opticalAlertClass(optical.severity)}`}>
                                    {optical.rxPowerDbm || "—"}
                                </h4>
                                <span className="sub-text">{optical.label || "No reading"}</span>
                            </PreviewCard>
                        </Col>
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">GPON TX</span>
                                <h4 className="title">{optical.txPowerDbm || "—"}</h4>
                            </PreviewCard>
                        </Col>
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">PPPoE status</span>
                                <h4 className="title">{pppoe.connectionStatus || "—"}</h4>
                                <span className="sub-text">{pppoe.externalIp || "No WAN IP"}</span>
                            </PreviewCard>
                        </Col>
                        <Col sm="6" lg="3">
                            <PreviewCard>
                                <span className="sub-text">LAN clients</span>
                                <h4 className="title">
                                    {live?.activeHostCount ?? 0} online / {live?.hostCount ?? 0} total
                                </h4>
                            </PreviewCard>
                        </Col>
                    </Row>
                </Block>

                <Block>
                    <PreviewCard>
                        <Nav tabs>
                            <NavItem>
                                <NavLink
                                    tag="a"
                                    href="#tab"
                                    className={classnames({ active: activeTab === "1" })}
                                    onClick={(e) => { e.preventDefault(); setActiveTab("1"); }}
                                >
                                    PPPoE & WiFi
                                </NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink
                                    tag="a"
                                    href="#tab"
                                    className={classnames({ active: activeTab === "2" })}
                                    onClick={(e) => { e.preventDefault(); setActiveTab("2"); }}
                                >
                                    Connected devices
                                </NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink
                                    tag="a"
                                    href="#tab"
                                    className={classnames({ active: activeTab === "3" })}
                                    onClick={(e) => { e.preventDefault(); setActiveTab("3"); }}
                                >
                                    LAN ports & WAN
                                </NavLink>
                            </NavItem>
                        </Nav>
                        <TabContent activeTab={activeTab} className="mt-4">
                            <TabPane tabId="1">
                                <Row className="g-gs">
                                    <Col lg="6">
                                        <h6 className="overline-title mb-3">PPPoE on ONU (ACS)</h6>
                                        <table className="table table-sm table-borderless">
                                            <tbody>
                                                <tr><td className="text-soft w-40">Username</td><td><code>{pppoe.username || "—"}</code></td></tr>
                                                <tr><td className="text-soft">WAN MAC</td><td><code>{pppoe.mac || summary?.wanMac || device?.wan_mac || "—"}</code></td></tr>
                                                <tr>
                                                    <td className="text-soft">Password (ACS)</td>
                                                    <td>
                                                        {pppoe.passwordReadable ? (
                                                            <>
                                                                <code>{showAcsPass ? (pppoe.password || "—") : "••••••••"}</code>
                                                                {" "}
                                                                <Button
                                                                    size="sm"
                                                                    color="link"
                                                                    className="p-0"
                                                                    onClick={() => setShowAcsPass((v) => !v)}
                                                                >
                                                                    {showAcsPass ? "Hide" : "Show"}
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <span className="text-soft">Hidden by ONT</span>
                                                        )}
                                                    </td>
                                                </tr>
                                                <tr><td className="text-soft">Status</td><td>{pppoe.connectionStatus || "—"}</td></tr>
                                                <tr><td className="text-soft">External IP</td><td>{pppoe.externalIp || "—"}</td></tr>
                                                <tr><td className="text-soft">Uptime</td><td>{pppoe.uptimeFormatted || "—"}</td></tr>
                                            </tbody>
                                        </table>
                                        {pppoeComparison?.billing ? (
                                            <>
                                                <h6 className="overline-title mb-3 mt-4">TonyComm billing</h6>
                                                <table className="table table-sm table-borderless">
                                                    <tbody>
                                                        <tr><td className="text-soft w-40">Username</td><td><code>{pppoeComparison.billingUsername}</code></td></tr>
                                                        <tr><td className="text-soft">Customer</td><td>{pppoeComparison.billing.customer_name}</td></tr>
                                                        <tr><td className="text-soft">Phone</td><td>{pppoeComparison.billing.phone}</td></tr>
                                                    </tbody>
                                                </table>
                                            </>
                                        ) : null}
                                        <h6 className="overline-title mb-3 mt-4">Change PPPoE manually</h6>
                                        <div className="form-group mb-2">
                                            <input
                                                className="form-control"
                                                value={pppoeUser}
                                                onChange={(e) => setPppoeUser(e.target.value)}
                                                placeholder="PPPoE username"
                                            />
                                        </div>
                                        <div className="form-group mb-2">
                                            <input
                                                type="password"
                                                className="form-control"
                                                value={pppoePass}
                                                onChange={(e) => setPppoePass(e.target.value)}
                                                placeholder="New PPPoE password (min 6 chars)"
                                            />
                                        </div>
                                        <Button
                                            color="primary"
                                            size="sm"
                                            disabled={!!actionLoading || !pppoeUser.trim() || pppoePass.length < 6}
                                            onClick={() => runAction("pppoe", () =>
                                                tr069Http.post(
                                                    `/devices/${encodeURIComponent(deviceId)}/pppoe`,
                                                    {
                                                        username: pppoeUser.trim(),
                                                        password: pppoePass,
                                                        productClass: device?.product_class,
                                                    }
                                                )
                                            )}
                                        >
                                            Apply PPPoE
                                        </Button>
                                    </Col>
                                    <Col lg="6">
                                        <h6 className="overline-title mb-3">WiFi</h6>
                                        {(live?.wlan || []).map((w) => (
                                            <div key={w.index} className="mb-3 p-3 border rounded">
                                                <strong>Radio {w.index}</strong>
                                                <div className="text-soft small">SSID: {w.ssid || "—"} · Ch: {w.channel ?? "—"} · {w.status || "—"}</div>
                                            </div>
                                        ))}
                                        <div className="form-group mb-2">
                                            <label className="form-label">SSID</label>
                                            <input
                                                className="form-control"
                                                value={ssid}
                                                onChange={(e) => setSsid(e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group mb-2">
                                            <label className="form-label">WiFi password (optional)</label>
                                            <input
                                                type="password"
                                                className="form-control"
                                                value={wifiPass}
                                                onChange={(e) => setWifiPass(e.target.value)}
                                                placeholder="Leave blank to change SSID only"
                                            />
                                        </div>
                                        <Button
                                            color="primary"
                                            size="sm"
                                            disabled={!!actionLoading || !ssid.trim()}
                                            onClick={() => runAction("wifi", () =>
                                                tr069Http.post(
                                                    `/devices/${encodeURIComponent(deviceId)}/wifi`,
                                                    {
                                                        ssid: ssid.trim(),
                                                        password: wifiPass || undefined,
                                                        productClass: device?.product_class,
                                                    }
                                                )
                                            )}
                                        >
                                            Apply WiFi
                                        </Button>
                                    </Col>
                                </Row>
                            </TabPane>
                            <TabPane tabId="2">
                                <div className="d-flex gap-2 mb-3 flex-wrap">
                                    {[
                                        ["active", `Online (${activeHosts.length})`],
                                        ["offline", `Offline (${offlineHosts.length})`],
                                        ["all", `All (${allHosts.length})`],
                                    ].map(([key, label]) => (
                                        <Button
                                            key={key}
                                            size="sm"
                                            color={hostFilter === key ? "primary" : "light"}
                                            onClick={() => setHostFilter(key)}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                                <DataTable
                                    columns={hostColumns}
                                    data={filteredHosts}
                                    dense
                                    highlightOnHover
                                    responsive
                                    noDataComponent="No connected devices — try Refresh parameters, wait ~1 min."
                                />
                            </TabPane>
                            <TabPane tabId="3">
                                <Row className="g-gs">
                                    <Col lg="6">
                                        <h6 className="overline-title mb-3">LAN ports</h6>
                                        <Row className="g-2">
                                            {(live?.lanPorts || []).map((p) => (
                                                <Col sm="6" key={p.port}>
                                                    <div className="border rounded p-3">
                                                        <strong>Port {p.port}</strong>
                                                        <div className="small mt-1">
                                                            {p.linkUp === true ? (
                                                                <Badge color="success">Link up</Badge>
                                                            ) : p.linkUp === false ? (
                                                                <Badge color="secondary">No link</Badge>
                                                            ) : (
                                                                <Badge color="light">Unknown</Badge>
                                                            )}
                                                        </div>
                                                        {p.speed ? <div className="text-soft small">{p.speed}</div> : null}
                                                    </div>
                                                </Col>
                                            ))}
                                        </Row>
                                    </Col>
                                    <Col lg="6">
                                        <h6 className="overline-title mb-3">WAN</h6>
                                        {(live?.wan || []).length === 0 ? (
                                            <p className="text-soft">No WAN data.</p>
                                        ) : (
                                            (live.wan || []).map((w, i) => (
                                                <div key={`${w.type}-${i}`} className="border rounded p-3 mb-2">
                                                    <strong>{w.name}</strong>
                                                    <Badge color="light" className="ms-2">{w.type}</Badge>
                                                    <div className="small text-soft mt-1">
                                                        {w.connectionStatus} · {w.externalIp || "no IP"}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </Col>
                                </Row>
                                {(live?.faults || []).length > 0 ? (
                                    <>
                                        <h6 className="overline-title mb-3 mt-4">ACS faults</h6>
                                        <ul className="list-unstyled small text-soft">
                                            {live.faults.map((f) => (
                                                <li key={f._id} className="mb-1">
                                                    {f.timestamp ? new Date(f.timestamp).toLocaleString() : ""}
                                                    {" — "}
                                                    {f.message || JSON.stringify(f)}
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : null}
                            </TabPane>
                        </TabContent>
                    </PreviewCard>
                </Block>
            </Content>
        </React.Fragment>
    );
};

export default Tr069DeviceDetail;
