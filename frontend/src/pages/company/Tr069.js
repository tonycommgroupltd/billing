import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import DataTable from "react-data-table-component";
import { Badge, Col, Row } from "reactstrap";
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
import { tr069Http } from "../../helpers/tr069Http";
import { Link } from "react-router-dom";

const OnlineBadge = ({ online }) => (
    online ? (
        <Badge color="success" pill>Online</Badge>
    ) : (
        <Badge color="secondary" pill>Offline</Badge>
    )
);

const Tr069 = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [stats, setStats] = useState(null);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(50);
    const [searchText, setSearchText] = useState("");
    const [onlineFilter, setOnlineFilter] = useState("all");
    const [reload, setReload] = useState(false);

    const fetchStats = useCallback(async () => {
        try {
            const response = await tr069Http.get("/stats");
            setStats(response.data);
        } catch (_) {
            /* stats optional */
        }
    }, []);

    const fetchDevices = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await tr069Http.get("/devices", {
                params: {
                    search: searchText || undefined,
                    online: onlineFilter === "all" ? undefined : onlineFilter,
                    limit: perPage,
                    offset: (page - 1) * perPage,
                },
            });
            setData(response.data.items || []);
            setTotalRows(response.data.total || 0);
        } catch (err) {
            console.error('[TR-069]', err.response?.status, err.response?.data || err.message);
            setError(
                err.response?.data?.error
                || err.response?.data?.hint
                || err.message
                || "Failed to load TR-069 devices"
            );
            setData([]);
            setTotalRows(0);
        } finally {
            setLoading(false);
        }
    }, [searchText, onlineFilter, page, perPage]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats, reload]);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices, reload]);

    const columns = [
        {
            name: "Status",
            width: "90px",
            cell: (row) => <OnlineBadge online={row.online} />,
        },
        {
            name: "Serial",
            cell: (row) => (
                <Link
                    to={`${process.env.PUBLIC_URL}/admin/company/tr069/device/${encodeURIComponent(row.genieacs_id)}?customerId=${row.customer_id || ""}&serviceId=${row.service_id || ""}`}
                >
                    {row.serial_number || row.genieacs_id}
                </Link>
            ),
            selector: (row) => row.serial_number || "—",
            wrap: true,
            minWidth: "140px",
        },
        {
            name: "Model",
            selector: (row) => row.product_class || "—",
            wrap: true,
            minWidth: "100px",
        },
        {
            name: "PPPoE username",
            selector: (row) => row.pppoe_username || "—",
            wrap: true,
            minWidth: "140px",
        },
        {
            name: "WAN MAC",
            selector: (row) => row.wan_mac || "—",
            wrap: true,
            minWidth: "140px",
            cell: (row) => (
                row.wan_mac ? <code className="small">{row.wan_mac}</code> : "—"
            ),
        },
        {
            name: "Customer",
            cell: (row) => (
                row.customer_id ? (
                    <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.customer_id}`}>
                        {row.customer_name || `#${row.customer_id}`}
                    </Link>
                ) : "—"
            ),
            wrap: true,
            minWidth: "140px",
        },
        {
            name: "Phone",
            selector: (row) => row.customer_phone || "—",
            wrap: true,
            minWidth: "120px",
        },
        {
            name: "WiFi SSID",
            selector: (row) => row.wifi_ssid || "—",
            wrap: true,
            minWidth: "120px",
        },
        {
            name: "Last inform",
            selector: (row) => (
                row.last_inform
                    ? new Date(row.last_inform).toLocaleString()
                    : "—"
            ),
            wrap: true,
            minWidth: "160px",
        },
    ];

    const handlePageChange = (newPage) => setPage(newPage);

    const handlePerRowsChange = (newPerPage, newPage) => {
        setPerPage(newPerPage);
        setPage(newPage);
    };

    return (
        <React.Fragment>
            <Head title="TR-069" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page tag="h3">
                                TR-069 / ACS Devices
                            </BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <Button
                                color="primary"
                                outline
                                className="btn-icon"
                                onClick={() => setReload((r) => !r)}
                            >
                                <Icon name="reload" />
                            </Button>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>

                {stats ? (
                    <Block>
                        <Row className="g-gs">
                            <Col sm="6" lg="3">
                                <PreviewCard>
                                    <span className="sub-text">Total ONUs</span>
                                    <h4 className="title">{stats.total}</h4>
                                </PreviewCard>
                            </Col>
                            <Col sm="6" lg="3">
                                <PreviewCard>
                                    <span className="sub-text">Online</span>
                                    <h4 className="title text-success">{stats.online}</h4>
                                </PreviewCard>
                            </Col>
                            <Col sm="6" lg="3">
                                <PreviewCard>
                                    <span className="sub-text">With PPPoE</span>
                                    <h4 className="title">{stats.linked_pppoe}</h4>
                                </PreviewCard>
                            </Col>
                            <Col sm="6" lg="3">
                                <PreviewCard>
                                    <span className="sub-text">Matched customers</span>
                                    <h4 className="title">{stats.linked_customer}</h4>
                                </PreviewCard>
                            </Col>
                        </Row>
                    </Block>
                ) : null}

                <Block>
                    <PreviewCard>
                        <Row className="g-3 mb-3">
                            <Col md="6">
                                <input
                                    type="search"
                                    className="form-control"
                                    placeholder="Search serial, PPPoE, phone, customer…"
                                    value={searchText}
                                    onChange={(e) => {
                                        setSearchText(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </Col>
                            <Col md="3">
                                <select
                                    className="form-select"
                                    value={onlineFilter}
                                    onChange={(e) => {
                                        setOnlineFilter(e.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="all">All status</option>
                                    <option value="1">Online only</option>
                                    <option value="0">Offline only</option>
                                </select>
                            </Col>
                        </Row>

                        {error ? (
                            <div className="alert alert-danger">{error}</div>
                        ) : null}

                        <DataTable
                            columns={columns}
                            data={data}
                            progressPending={loading}
                            pagination
                            paginationServer
                            paginationTotalRows={totalRows}
                            paginationDefaultPage={page}
                            paginationPerPage={perPage}
                            onChangePage={handlePageChange}
                            onChangeRowsPerPage={handlePerRowsChange}
                            highlightOnHover
                            responsive
                            noDataComponent={
                                loading
                                    ? "Loading devices…"
                                    : "No TR-069 devices found"
                            }
                        />
                    </PreviewCard>
                </Block>
            </Content>
        </React.Fragment>
    );
};

export default Tr069;
