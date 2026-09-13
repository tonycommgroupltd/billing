import React, { useState, useEffect } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
    Block,
    BlockHead,
    BlockBetween,
    BlockHeadContent,
    BlockTitle,
    Icon
} from "../../components/Component";
import DateRangePicker from 'react-bootstrap-daterangepicker';
import moment from 'moment';
import 'bootstrap-daterangepicker/daterangepicker.css';
import { ArrowSwap20Regular, Info20Regular } from '@fluentui/react-icons';
import DataTable from "react-data-table-component";
import { http } from '../../helpers';
import prettyBytes from 'pretty-bytes';
import { Row, Col } from "reactstrap";
import "../../components/charts/registerChartJs";
import { Bar } from "react-chartjs-2";
import {
    DataTablePagination,
} from "../../components/Component";
import dateFormat from 'dateformat';

const chartpluginsset = [
    {
        afterDraw: (chart) => {
            var showEmptyDataLabel = true;

            chart.data.datasets.forEach(dataset => {
                if (dataset.data.length > 0) {
                    showEmptyDataLabel = false;
                }
            });

            const { ctx } = chart
            let chartWidth = chart.width;

            if (showEmptyDataLabel) {
                chart.clear();

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#323232';
                ctx.font = "14px sans-serif";
                ctx.fillText('No data to display', chartWidth / 2, 100);
                ctx.restore();
            }
        }
    }
];

const BarChart = ({ data, stacked }) => {
    return (
        <Bar
            data={data}
            options={{
                legend: {
                    display: false,
                    labels: {
                        boxWidth: 30,
                        padding: 20,
                        fontColor: "#6783b8",
                    },
                },
                maintainAspectRatio: false,
                responsive: true,
                tooltips: {
                    enabled: true,
                    backgroundColor: "#eff6ff",
                    titleFontSize: 13,
                    titleFontColor: "#6783b8",
                    titleMarginBottom: 6,
                    bodyFontColor: "#9eaecf",
                    bodyFontSize: 12,
                    bodySpacing: 4,
                    yPadding: 10,
                    xPadding: 10,
                    footerMarginTop: 0,
                    displayColors: false,
                },
                scales: {
                    y:
                    {
                        display: true,
                        stacked: stacked ? true : false,
                        ticks: {
                            beginAtZero: true,
                            fontSize: 12,
                            fontColor: "#9eaecf",
                            padding: 5,
                            callback: (value) => {
                                return prettyBytes(value);
                            }
                        },
                        gridLines: {
                            tickMarkLength: 0,
                        },
                    },
                    x:
                    {
                        display: true,
                        stacked: stacked ? true : false,
                        ticks: {
                            fontSize: 12,
                            fontColor: "#9eaecf",
                            source: "auto",
                            padding: 5,
                        },
                        gridLines: {
                            color: "transparent",
                            tickMarkLength: 10,
                            zeroLineColor: "transparent",
                        },
                    },

                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                return "Date" + ': ' + context[0].label;
                            },
                            beforeBody: (tooltipItems) => {
                                let totalUsage = 0;
                                if (tooltipItems.length > 0) {
                                    tooltipItems.forEach((item) => {
                                        totalUsage += parseInt(item.parsed.y);
                                    });
                                }

                                return "Total usage: " + prettyBytes(totalUsage);
                            },
                            label: function (context) {
                                let label = context.dataset.label || '';

                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += prettyBytes(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }}
            plugins={chartpluginsset}
        />
    );
};

const InternetStats = () => {
    const [reload, setReload] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);
    const [apiSessionLoading, setApiSessionLoading] = useState(false);
    const [dataOnlineSessions, setDataOnlineSessions] = useState([]);
    const [dataDailySessions, setDataDailySessions] = useState([]);
    const [dataTotalSessions, setDataTotalSessions] = useState([]);
    const [startDate, setStartDate] = useState(dateFormat(moment().startOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [endDate, setEndDate] = useState(dateFormat(moment().endOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(100);
    const [searchText, setSearchText] = useState("");
    const [toggleCleared, setToggleCleared] = useState(false);
    const [sort, setSort] = useState('desc');
    const [sortCol, setSortCol] = useState('start_time');
    const [smOption, setSmOption] = useState(false);

    const handleSort = async (column, sortDirection) => {
        setSort(sortDirection);
        setSortCol(column.ref);
    };

    const handleCallback = (start, end) => {
        setStartDate(dateFormat(start, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setEndDate(dateFormat(end, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setReload(!reload);
    }

    const handlePageChange = page => {
        setPage(page);
        setToggleCleared(!toggleCleared);
    };

    const handlePerRowsChange = (e, perPageO) => {

        let newPage = 1;
        if (parseInt(perPageO) > parseInt(e.target.value) && page !== 1) {
            newPage = (Math.ceil((parseInt(perPageO) / parseInt(e.target.value))) * (page - 1)) + 1;
        } else if (page !== 1) {
            newPage = Math.ceil((parseInt(perPageO) / parseInt(e.target.value)) * page);
        }
        setPerPage(e.target.value);
        setPage(newPage);
        setToggleCleared(!toggleCleared);
    };

    useEffect(() => {
        const fetchOnlineSessions = async () => {
            setApiLoading(true);
            try {
                const response = await http.get(`${process.env.REACT_APP_API_URL}/cust-online-sessions`);

                if (response.data?.online_sessions) {
                    setDataOnlineSessions(response.data.online_sessions);
                }

                setApiLoading(false);
            } catch (error) {
                //setApiLoading(false);
            }
        };

        fetchOnlineSessions();

        return () => {
            setApiLoading(false);
        };
    }, []);

    useEffect(() => {
        const fetchDailySessions = async () => {
            //setApiLoading(true);
            try {
                const response = await http.get(`${process.env.REACT_APP_API_URL}/cust-daily-sessions?from=${startDate}&to=${endDate}`);
                if (response.data?.daily_sessions) {
                    setDataDailySessions(response.data.daily_sessions);
                }

                //setApiLoading(false);
            } catch (error) {
                //setApiLoading(false);
            }
        };

        fetchDailySessions();

        /*return () => {
            setApiLoading(false);
        };*/
    }, [reload]);

    useEffect(() => {
        const fetchTotalSessions = async () => {
            setApiSessionLoading(true);
            try {
                const response = await http.get(`${process.env.REACT_APP_API_URL}/cust-total-sessions?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}&from=${startDate}&to=${endDate}`);
                if (response.data?.data) {
                    setDataTotalSessions(response.data.data);
                    setTotalRows(response.data.total);
                }
                setApiSessionLoading(false);
            } catch (error) {
                //setApiLoading(false);
            }
        };

        fetchTotalSessions();

        return () => {
            setApiSessionLoading(false);
        };
    }, [reload, searchText, page, perPage, sortCol, sort]);

    const columns = [
        {
            id: 1,
            name: "Login",
            selector: (row) => row.username,
        },
        {
            id: 2,
            name: "In",
            selector: (row) => row.download && row.download > 0 ? prettyBytes(row.download) : '0.00 MB',
        },
        {
            id: 3,
            name: "Out",
            selector: (row) => row.upload && row.upload > 0 ? prettyBytes(row.upload) : '0.00 MB',
        },
        {
            id: 4,
            name: "Start at",
            selector: (row) => new Date(row.start_time),
        },
        {
            id: 5,
            name: "Time",
            selector: (row) => row.time_diff,
        },
        {
            id: 6,
            name: "IP",
            selector: (row) => row.ip_address,
            wrap: true,
            sortable: false,
        },
        {
            id: 7,
            name: "MAC",
            selector: (row) => row.mac_address,
            wrap: true,
            sortable: false,
        },
    ];

    const columnSessions = [
        {
            id: 1,
            name: "#",
            selector: (row) => row.id,
            wrap: true,
            sortable: true,
            ref: "pppoe_sessions.id"
        },
        {
            id: 2,
            name: "Connected",
            selector: (row) => new Date(row.start_time),
            wrap: true,
            sortable: true,
            ref: "start_time"
        },
        {
            id: 3,
            name: "Disconnected",
            selector: (row) => new Date(row.end_time),
            wrap: true,
            sortable: true,
            ref: "end_time"
        },
        {
            id: 4,
            name: "Time",
            selector: (row) => row.time_diff,
            sortable: false
        },
        {
            id: 5,
            name: "Download MB",
            selector: (row) => row.download && row.download > 0 ? (row.download / 1048576).toFixed(2) : '0.00 MB',
            sortable: true,
            ref: "download"
        },
        {
            id: 6,
            name: "Upload MB",
            selector: (row) => row.upload && row.upload > 0 ? (row.upload / 1048576).toFixed(2) : '0.00 MB',
            sortable: true,
            ref: "upload"
        },
        {
            id: 7,
            name: "Ipv4",
            selector: (row) => row.ip_address,
            sortable: true,
            ref: "ip_address"
        },
        {
            id: 8,
            name: "MAC",
            selector: (row) => row.mac_address,
            sortable: true,
            ref: "mac_address"
        },
    ];

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

    return (
        <>
            <Head title="Internet statistics" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                Statistics / <strong className="text-primary">Internet</strong>
                            </BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="toggle-wrap nk-block-tools-toggle">
                                <a
                                    href="#toggle"
                                    onClick={(ev) => {
                                        ev.preventDefault();
                                        setSmOption(!smOption);
                                    }}
                                    className="btn btn-icon btn-trigger toggle-expand me-n1"
                                >
                                    <Icon name="menu-alt-r"></Icon>
                                </a>
                                <div className="toggle-expand-content" style={{ display: smOption ? "block" : "none" }}>

                                    <ul className="nk-block-tools g-3">
                                        <li className="align-items-center">
                                            <label className="overline-title overline-title-alt pe-1">Period&nbsp;&nbsp;</label>
                                            <DateRangePicker
                                                initialSettings={{
                                                    ranges: {
                                                        Today: [moment().toDate(), moment().toDate()],
                                                        Yesterday: [
                                                            moment().subtract(1, 'days').toDate(),
                                                            moment().subtract(1, 'days').toDate(),
                                                        ],
                                                        'Last 7 Days': [
                                                            moment().subtract(6, 'days').toDate(),
                                                            moment().toDate(),
                                                        ],
                                                        'Last 30 Days': [
                                                            moment().subtract(29, 'days').toDate(),
                                                            moment().toDate(),
                                                        ],
                                                        'This Month': [
                                                            moment().startOf('month').toDate(),
                                                            moment().endOf('month').toDate(),
                                                        ],
                                                        'Last Month': [
                                                            moment().subtract(1, 'month').startOf('month').toDate(),
                                                            moment().subtract(1, 'month').endOf('month').toDate(),
                                                        ],
                                                    },
                                                    alwaysShowCalendars: true,
                                                    opens: "left",
                                                    startDate: moment().startOf('month').toDate(),
                                                    endDate: moment().endOf('month').toDate(),
                                                }}
                                                onCallback={handleCallback}
                                            >
                                                <input type="text" className="form-control" style={{ minWidth: "180px" }} />
                                            </DateRangePicker>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>
                <Block>
                    <div className="page-panel">
                        <Row className="mb-3">
                            <Col>
                                <div className="card statistics-internet-online">
                                    <div className="card-header">
                                        <span className="icon-wrap">
                                            <ArrowSwap20Regular />
                                        </span>
                                        <strong>Online sessions</strong>
                                    </div>
                                    <div className="card-body">
                                        <div className="dataTables_wrapper dt-bootstrap4 no-footer">
                                            <DataTable
                                                data={dataOnlineSessions}
                                                columns={columns}
                                                progressPending={apiLoading}
                                                noDataComponent={<div className="p-2">There are no records found</div>}
                                                pagination={false}
                                            ></DataTable>
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="mb-3">
                            <Col>
                                <div className="card">
                                    <div className="card-header">
                                        <span className="icon-wrap">
                                            <Info20Regular />
                                        </span>
                                        <strong>Usage by day</strong>
                                    </div>
                                    <div className="card-body">
                                        <div style={{ height: '400px' }}>
                                            <BarChart stacked data={barChartMultiple} />
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row>
                            <Col>
                                <div className="card">
                                    <div className="card-header">
                                        <span className="icon-wrap">
                                            <ArrowSwap20Regular />
                                        </span>
                                        <strong>Sessions</strong>
                                    </div>
                                    <div className="card-body">
                                        <div className="dataTables_wrapper dt-bootstrap4 no-footer">
                                            <Row className="justify-between g-2 with-export">
                                                <Col className="col-7 text-start" sm="4">
                                                    <div id="DataTables_Table_0_filter" className="dataTables_filter">
                                                        <label>
                                                            <input
                                                                type="search"
                                                                className="form-control form-control-sm"
                                                                placeholder="Table search"
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
                                                defaultSortDesc={true}
                                                sortServer
                                                onSort={handleSort}
                                                sortIcon={
                                                    <div>
                                                        <span>&darr;</span>
                                                        <span>&uarr;</span>
                                                    </div>
                                                }
                                                pagination={true}
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
                                            ></DataTable>
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    </div>
                </Block>
            </Content>
        </>
    );
}

export default InternetStats;