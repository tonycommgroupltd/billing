import React, { useState, useEffect } from "react";
import dateFormat from "dateformat";
import DateRangePicker from "react-bootstrap-daterangepicker";
import moment from "moment";
import "bootstrap-daterangepicker/daterangepicker.css";
import { ArrowSwap20Regular, Info20Regular } from "@fluentui/react-icons";
import DataTable from "react-data-table-component";
import { http } from "../../helpers";
import prettyBytes from "pretty-bytes";
import { Row, Col } from "reactstrap";
import "../../components/charts/registerChartJs";
import { Bar } from "react-chartjs-2";
import { DataTablePagination } from "../../components/Component";

const chartpluginsset = [
    {
        afterDraw: (chart) => {
            let showEmptyDataLabel = chart.data.datasets.every(
                (dataset) => dataset.data.length === 0
            );

            if (showEmptyDataLabel) {
                const { ctx } = chart;
                const chartWidth = chart.width;
                chart.clear();
                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#323232";
                ctx.font = "14px sans-serif";
                ctx.fillText("No data to display", chartWidth / 2, 100);
                ctx.restore();
            }
        },
    },
];

const BarChart = ({ data, stacked }) => (
    <Bar
        data={data}
        options={{
            maintainAspectRatio: false,
            responsive: true,
            interaction: { mode: "index", intersect: false },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (ctx) => "Date: " + ctx[0].label,
                        beforeBody: (items) => {
                            let total = items.reduce((acc, i) => acc + parseInt(i.parsed.y), 0);
                            return "Total usage: " + prettyBytes(total);
                        },
                        label: (ctx) => {
                            let label = ctx.dataset.label || "";
                            if (label) label += ": ";
                            if (ctx.parsed.y !== null) label += prettyBytes(ctx.parsed.y);
                            return label;
                        },
                    },
                },
            },
            scales: {
                y: {
                    stacked: stacked || false,
                    ticks: { callback: (v) => prettyBytes(v), beginAtZero: true },
                },
                x: { stacked: stacked || false },
            },
        }}
        plugins={chartpluginsset}
    />
);

const formatDuration = (seconds) => {
    if (!seconds) return "0:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const StatsTab = ({ customer_id }) => {
    const [reload, setReload] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);
    const [apiSessionLoading, setApiSessionLoading] = useState(false);
    const [dataOnlineSessions, setDataOnlineSessions] = useState([]);
    const [dataDailySessions, setDataDailySessions] = useState([]);
    const [dataTotalSessions, setDataTotalSessions] = useState([]);
    const [startDate, setStartDate] = useState(
        dateFormat(moment().startOf("month").toDate(), "yyyy-mm-dd HH:MM:ss")
    );
    const [endDate, setEndDate] = useState(
        dateFormat(moment().endOf("month").toDate(), "yyyy-mm-dd HH:MM:ss")
    );
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(100);
    const [searchText, setSearchText] = useState("");
    const [sort, setSort] = useState("desc");
    const [sortCol, setSortCol] = useState("start_time");

    const handleSort = (column, sortDirection) => {
        setSort(sortDirection);
        setSortCol(column.ref);
    };

    const handleCallback = (start, end) => {
        setStartDate(dateFormat(start, "yyyy-mm-dd HH:MM:ss"));
        setEndDate(dateFormat(end, "yyyy-mm-dd HH:MM:ss"));
        setReload(!reload);
    };

    const handlePageChange = (page) => {
        setPage(page);
    };

    const handlePerRowsChange = (e, perPageO) => {
        setPerPage(e.target.value);
    };

    const barChartMultiple = {
        labels: dataDailySessions.map((item) => item.date),
        datasets: [
            {
                label: "Download",
                backgroundColor: "#9cabff",
                data: dataDailySessions.map((item) => item.download),
            },
            {
                label: "Upload",
                backgroundColor: "#f4aaa4",
                data: dataDailySessions.map((item) => item.upload),
            },
        ],
    };

    const formatBytesToMB = (bytes, precision = 2) => {
        if (!bytes || bytes === 0) return "0";
        const mb = bytes / (1024 * 1024); // bytes → MB
        return `${mb.toFixed(precision)}`;
    }

    // ---- API fetches ----
    useEffect(() => {
        const fetchOnlineSessions = async (id) => {
            if (!id) return;
            setApiLoading(true);
            try {
                const response = await http.get(
                    `${process.env.REACT_APP_API_URL}/list-online-sessions/${id}`
                );
                if (response.data?.online_sessions) {
                    setDataOnlineSessions(response.data.online_sessions);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setApiLoading(false);
            }
        };
        fetchOnlineSessions(customer_id);
    }, [customer_id]);

    useEffect(() => {
        const fetchDailySessions = async (id) => {
            if (!id) return;
            try {
                const response = await http.get(
                    `${process.env.REACT_APP_API_URL}/list-daily-sessions/${id}?from=${startDate}&to=${endDate}`
                );
                if (response.data?.daily_sessions) {
                    setDataDailySessions(response.data.daily_sessions);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchDailySessions(customer_id);
    }, [customer_id, reload, startDate, endDate]);

    useEffect(() => {
        const fetchTotalSessions = async (id) => {
            if (!id) return;
            setApiSessionLoading(true);
            try {
                const response = await http.get(
                    `${process.env.REACT_APP_API_URL}/list-total-sessions/${id}?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}&from=${startDate}&to=${endDate}`
                );
                if (response.data?.data?.data) {
                    setDataTotalSessions(response.data.data.data); // <-- fix here
                    setTotalRows(response.data.data.total);        // <-- fix here
                }
            } catch (err) {
                console.error(err);
            } finally {
                setApiSessionLoading(false);
            }
        };
        fetchTotalSessions(customer_id);
    }, [customer_id, reload, searchText, page, perPage, sortCol, sort, startDate, endDate]);

    // ---- Columns ----
    const columns = [
        { name: "Login", selector: (row) => row.username },
        {
            name: "In",
            selector: (row) => row.download,
        },
        {
            name: "Out",
            selector: (row) => row.upload,
        },
        {
            name: "Start at",
            selector: (row) =>
                row.start_time ? dateFormat(new Date(row.start_time), "yyyy-mm-dd HH:MM:ss") : "-",
            wrap: true
        },
        { name: "Time", selector: (row) => formatDuration(row.time_diff) },
        { name: "IP", selector: (row) => row.ip_address, wrap: true },
        { name: "MAC", selector: (row) => row.mac_address },
    ];

    const columnSessions = [
        { name: "#", selector: (row) => row.id, sortable: true, ref: "radacct.radacctid" },
        {
            name: "Connected",
            selector: (row) =>
                row.start_time ? dateFormat(new Date(row.start_time), "yyyy-mm-dd HH:MM:ss") : "-",
            sortable: true,
            ref: "start_time",
            wrap: true
        },
        {
            name: "Disconnected",
            selector: (row) =>
                row.end_time ? dateFormat(new Date(row.end_time), "yyyy-mm-dd HH:MM:ss") : "-",
            sortable: true,
            ref: "end_time",
            wrap: true
        },
        { name: "Time", selector: (row) => formatDuration(row.time_diff), sortable: false },
        {
            name: "Download MB",
            selector: (row) => formatBytesToMB(row.download),
            sortable: true,
            ref: "download",
        },
        {
            name: "Upload MB",
            selector: (row) => formatBytesToMB(row.upload),
            sortable: true,
            ref: "upload",
        },
        { name: "IPv4", selector: (row) => row.ip_address, sortable: true, ref: "ip_address", wrap: true },
        { name: "MAC", selector: (row) => row.mac_address, sortable: true, ref: "mac_address" },
    ];

    return (
        <div className="main-tab-holder pt-1 pb-1">
            {/* Period Filter */}
            <div className="top-nav">
                <div className="filters-nav">
                    <div className="filter-inputs">
                        <div className="filter-input">
                            <label>Period:</label>
                            <DateRangePicker
                                initialSettings={{
                                    ranges: {
                                        Today: [moment().toDate(), moment().toDate()],
                                        Yesterday: [
                                            moment().subtract(1, "days").toDate(),
                                            moment().subtract(1, "days").toDate(),
                                        ],
                                        "Last 7 Days": [moment().subtract(6, "days").toDate(), moment().toDate()],
                                        "Last 30 Days": [moment().subtract(29, "days").toDate(), moment().toDate()],
                                        "This Month": [moment().startOf("month").toDate(), moment().endOf("month").toDate()],
                                        "Last Month": [
                                            moment().subtract(1, "month").startOf("month").toDate(),
                                            moment().subtract(1, "month").endOf("month").toDate(),
                                        ],
                                    },
                                    alwaysShowCalendars: true,
                                    opens: "left",
                                    startDate: moment().startOf("month").toDate(),
                                    endDate: moment().endOf("month").toDate(),
                                }}
                                onCallback={handleCallback}
                            >
                                <input type="text" className="form-control" style={{ width: "180px" }} />
                            </DateRangePicker>
                        </div>
                    </div>
                </div>
            </div>

            {/* Online Sessions */}
            <div id="online_section">
                <div className="card-block">
                    <div className="card-block-header">
                        <ArrowSwap20Regular />
                        <strong>Online sessions</strong>
                    </div>
                    <div className="card-block-body">
                        <DataTable
                            data={dataOnlineSessions}
                            columns={columns}
                            progressPending={apiLoading}
                            noDataComponent={<div className="p-2">There are no records found</div>}
                            pagination={false}
                        />
                    </div>
                </div>
            </div>

            {/* Daily Usage Chart */}
            <div id="total_section" className="mt-4">
                <Row>
                    <Col>
                        <div className="card-block traffic-report-app-wrapper">
                            <div className="card-block-header">
                                <Info20Regular />
                                <strong>Usage by day</strong>
                            </div>
                            <div className="card-block-body" style={{ height: "400px" }}>
                                <BarChart stacked data={barChartMultiple} />
                            </div>
                        </div>
                    </Col>
                </Row>
            </div>

            {/* Total Sessions Table */}
            <div id="online_section" className="mt-4">
                <div className="card-block">
                    <div className="card-block-body">
                        {/*<Row className="justify-between g-2 with-export mb-2">
                            <Col sm="4">
                                <input
                                    type="search"
                                    className="form-control form-control-sm"
                                    placeholder="Table search"
                                    onChange={(ev) => {
                                        setSearchText(ev.target.value);
                                        setPage(1);
                                    }}
                                />
                            </Col>
                            <Col sm="8" className="text-end">
                                <select
                                    className="custom-select custom-select-sm form-control form-control-sm"
                                    onChange={(e) => handlePerRowsChange(e, perPage)}
                                    value={perPage}
                                >
                                    <option value="10">10</option>
                                    <option value="25">25</option>
                                    <option value="40">40</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </Col>
                        </Row>*/}
                        <div className="dataTables_wrapper dt-bootstrap4 no-footer">
                            <Row className="justify-between g-2 with-export">
                                <Col className="col-7 text-start" sm="4">
                                    <div id="DataTables_Table_0_filter" className="dataTables_filter">
                                        <label>
                                            <input
                                                type="search"
                                                className="form-control form-control-sm"
                                                placeholder="Search"
                                                onChange={(ev) => {
                                                    setSearchText(ev.target.value);
                                                    setPage(1);
                                                }
                                                }
                                            />
                                        </label>
                                    </div>
                                </Col>
                                <Col className="col-5 text-end" sm="8">
                                    <div className="datatable-filter">
                                        <div className="d-flex justify-content-end g-2">
                                            <div className="dataTables_length" id="DataTables_Table_0_length">
                                                <label>
                                                    <span className="d-none d-sm-inline-block">Show</span>
                                                    <div className="form-control-select">
                                                        {" "}
                                                        <select
                                                            name="DataTables_Table_0_length"
                                                            className="custom-select custom-select-sm form-control form-control-sm"
                                                            onChange={(e) => handlePerRowsChange(e, perPage)}
                                                            value={perPage}
                                                        >
                                                            <option value="10">10</option>
                                                            <option value="25">25</option>
                                                            <option value="40">40</option>
                                                            <option value="50">50</option>
                                                            <option value="100">100</option>
                                                        </select>{" "}
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <DataTable
                                data={dataTotalSessions}
                                columns={columnSessions}
                                progressPending={apiSessionLoading}
                                noDataComponent={<div className="p-2">There are no records found</div>}
                                defaultSortFieldId={1}
                                defaultSortDesc
                                sortServer
                                onSort={handleSort}
                                pagination
                                paginationServer
                                paginationComponent={() => (
                                    <DataTablePagination
                                        customItemPerPage={perPage}
                                        itemPerPage={perPage}
                                        totalItems={totalRows}
                                        paginate={handlePageChange}
                                        currentPage={page}
                                        onChangeRowsPerPage={handlePerRowsChange}
                                        setRowsPerPage={setPerPage}
                                    />
                                )}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsTab;