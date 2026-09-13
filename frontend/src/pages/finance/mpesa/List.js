import React, { useState, useEffect, useRef, useMemo } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalBody, ModalHeader, ModalFooter, Row, Spinner, Badge, Alert } from "reactstrap";
import {
    Block,
    BlockBetween,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    PreviewCard,
    Button,
    DataTablePagination,
    Icon,
    TooltipComponent,
} from "../../../components/Component";
import { http } from '../../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import dateFormat from 'dateformat';
import DateRangePicker from 'react-bootstrap-daterangepicker';
import moment from 'moment';
import 'bootstrap-daterangepicker/daterangepicker.css';
import { useSearchParams } from "react-router-dom";
import { connect } from "react-redux";
import { ROLES } from "../../../config/roles";

/** Acc Balance / tracker / report are hidden from plain administrator (not super-admin/ICT). */
function shouldHideAccBalance(user) {
    const roles = user?.all_roles || [];
    if (!roles.includes(ROLES.Admin)) return false;
    if (roles.includes(ROLES.SuperAdmin) || roles.includes(ROLES.ICT)) return false;
    return true;
}

const Export = ({ data }) => {
    const [modal, setModal] = useState(false);

    useEffect(() => {
        if (modal === true) {
            setTimeout(() => setModal(false), 2000);
        }
    }, [modal]);

    const fileName = "user-data";

    const exportCSV = () => {
        const exportType = exportFromJSON.types.csv;
        exportFromJSON({ data, fileName, exportType });
    };

    const exportExcel = () => {
        const exportType = exportFromJSON.types.xls;
        exportFromJSON({ data, fileName, exportType });
    };

    const copyToClipboard = () => {
        setModal(true);
    };

    return (
        <React.Fragment>
            <div className="dt-export-buttons d-flex align-center">
                <div className="dt-export-title d-none d-md-inline-block">Export</div>
                <div className="dt-buttons btn-group flex-wrap">
                    <CopyToClipboard text={JSON.stringify(data)}>
                        <Button className="btn btn-secondary buttons-copy buttons-html5" onClick={() => copyToClipboard()}>
                            <span>Copy</span>
                        </Button>
                    </CopyToClipboard>{" "}
                    <button className="btn btn-secondary buttons-csv buttons-html5" type="button" onClick={() => exportCSV()}>
                        <span>CSV</span>
                    </button>{" "}
                    <button className="btn btn-secondary buttons-excel buttons-html5" type="button" onClick={() => exportExcel()}>
                        <span>Excel</span>
                    </button>{" "}
                </div>
            </div>
            <Modal isOpen={modal} className="modal-dialog-centered text-center" size="sm">
                <ModalBody className="text-center m-2">
                    <h5>Copied to clipboard</h5>
                </ModalBody>
                <div className="p-3 bg-light">
                    <div className="text-center">Copied {data.length} rows to clipboard</div>
                </div>
            </Modal>
        </React.Fragment>
    );
};

const CustomCheckbox = React.forwardRef(({ onClick, ...rest }, ref) => (
    <div className="custom-control custom-control-sm custom-checkbox notext">
        <input
            id={rest.name}
            type="checkbox"
            className="custom-control-input"
            ref={ref}
            onClick={onClick}
            {...rest}
        />
        <label className="custom-control-label" htmlFor={rest.name} />
    </div>
));

const List = ({ user, ...props }) => {
    let expandableRows = true;
    const hideAccBalance = shouldHideAccBalance(user);
    const [searchParams] = useSearchParams();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('desc');
    const [sortCol, setSortCol] = useState('TransTime');
    const [searchText, setSearchText] = useState("");
    const [mobileView, setMobileView] = useState();
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const [smOption, setSmOption] = useState(false);
    const [startDate, setStartDate] = useState(dateFormat(moment().startOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [endDate, setEndDate] = useState(dateFormat(moment().endOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [customerFilterLabel, setCustomerFilterLabel] = useState("");
    const [statusModal, setStatusModal] = useState(false);
    const [statusTransId, setStatusTransId] = useState("");
    const [statusBusy, setStatusBusy] = useState(false);
    const [statusPolling, setStatusPolling] = useState(false);
    const [statusError, setStatusError] = useState("");
    const [statusResult, setStatusResult] = useState(null);
    const statusPollRef = useRef(null);

    // Apply deep-link filters from customer view (?customer_q= / ?q=)
    useEffect(() => {
        const q = (searchParams.get('customer_q') || searchParams.get('q') || '').trim();
        const name = (searchParams.get('customer_name') || '').trim();
        if (!q) return;

        setSearchText(q);
        setCustomerFilterLabel(name || q);
        // Widen range so customer history is not limited to the current month
        setStartDate(dateFormat(moment().subtract(24, 'months').startOf('day').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setEndDate(dateFormat(moment().endOf('day').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setPage(1);
    }, [searchParams]);

    const ExpandableRowComponent = ({ data }) => {
        return (
            <ul className="dtr-details p-2 border-bottom ms-1">
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Customer name</span> <span className="dtr-data">{[data.FirstName, data.MiddleName, data.LastName].filter(Boolean).join(" ")}</span>
                </li>
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Sender number</span> <span className="dtr-data">{data.sender_phone || "—"}</span>
                </li>
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Date</span> <span className="dtr-data">{dateFormat(data.TransTime, "dS, mmm yy h:MM TT")}</span>
                </li>
                {!hideAccBalance ? (
                    <li className="d-block d-sm-none">
                        <span className="dtr-title">Acc Balance</span> <span className="dtr-data">{Number(data.OrgAccountBalance).toFixed(2) + ' Sh'}</span>
                    </li>
                ) : null}
                <div className="d-flex align-items-center pt-1 d-sm-none">
                    <span className="dtr-title">Actions</span>
                    <div className="dtr-data">
                        <ul className="nk-tb-actions gx-1">
                            <li onClick={() => confirmDelete(data.id, data.TransID)}>
                                <TooltipComponent
                                    tag="a"
                                    containerClassName="btn btn-trigger btn-icon"
                                    id={"delete" + data.id}
                                    icon="trash-alt"
                                    direction="top"
                                    text="Delete"
                                />
                            </li>
                        </ul>
                    </div>
                </div>
            </ul>
        );
    };

    const columns = useMemo(() => {
        const cols = [
        {
            id: 1,
            name: "Trans ID",
            selector: (row) => row.TransID,
            wrap: true,
            sortable: false,
            ref: "TransID"
        },
        {
            id: 2,
            name: "Customer name",
            selector: (row) => [row.FirstName, row.MiddleName, row.LastName].filter(Boolean).join(" "),
            wrap: false,
            sortable: false,
            ref: "customer_name",
            hide: "sm"
        },
        {
            id: 3,
            name: "Sender number",
            selector: (row) => row.sender_phone || "—",
            wrap: true,
            sortable: false,
            ref: "sender_phone",
            width: "130px",
        },
        {
            id: 4,
            name: "Date",
            selector: (row) => dateFormat(row.TransTime, "dS, mmm yy h:MM TT"),
            wrap: true,
            sortable: true,
            ref: "TransTime",
            hide: "sm",
            width: "180px",
        },
        {
            id: 5,
            name: "Sum",
            selector: (row) => Number(row.TransAmount).toFixed(2) + ' Sh',
            wrap: true,
            sortable: true,
            ref: "TransAmount",
        },
        {
            id: 6,
            name: "Reference",
            selector: (row) => row.BillRefNumber,
            wrap: true,
            sortable: true,
            ref: "BillRefNumber",
        },
        ];
        if (!hideAccBalance) {
            cols.push({
                id: 7,
                name: "Acc Balance",
                selector: (row) => Number(row.OrgAccountBalance).toFixed(2) + ' Sh',
                wrap: true,
                sortable: true,
                ref: "OrgAccountBalance",
                hide: "sm"
            });
        }
        cols.push({
            name: "Actions",
            cell: (row) => (
                <ul className="nk-tb-actions gx-1">
                    <li onClick={() => openStatusModal(row.TransID)}>
                        <TooltipComponent
                            tag="a"
                            containerClassName="btn btn-trigger btn-icon"
                            id={"status" + row.id}
                            icon="reload"
                            direction="top"
                            text="Check status"
                        />
                    </li>
                    <li onClick={() => confirmDelete(row.id, row.TransID)}>
                        <TooltipComponent
                            tag="a"
                            containerClassName="btn btn-trigger btn-icon"
                            id={"delete" + row.id}
                            icon="trash-alt"
                            direction="top"
                            text="Delete"
                        />
                    </li>
                </ul>
            ),
            ignoreRowClick: true,
            allowOverflow: true,
            hide: "sm"
        });
        return cols;
    }, [hideAccBalance]);

    const exportData = useMemo(() => {
        if (!hideAccBalance) return data;
        return data.map(({ OrgAccountBalance, ...rest }) => rest);
    }, [data, hideAccBalance]);

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
    const handleSort = async (column, sortDirection) => {
        //setSort(column.name);
        //setOrder(sortDirection);
        setSort(sortDirection);
        setSortCol(column.ref);
    };
    useEffect(() => {
        const fetchPayments = async () => {
            setLoading(true);
            const params = new URLSearchParams({
                q: searchText || '',
                page: String(page),
                per_page: String(perPage),
                sort_col: sortCol,
                sort,
                start: startDate,
                end: endDate,
            });
            const response = await http.get(`${process.env.REACT_APP_API_URL}/list-mpesa?${params.toString()}`);
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchPayments();

    }, [page, perPage, sortCol, sort, searchText, reload, startDate, endDate]);

    // function to change the design view under 1200 px
    const viewChange = () => {
        if (window.innerWidth < 960 && expandableRows) {
            setMobileView(true);
        } else {
            setMobileView(false);
        }
    };

    const confirmDelete = (id, title) => {
        Swal.fire({
            title: "Delete Payment",
            text: `Are you sure you want to delete "${title}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
        }).then((result) => {
            if (result.isConfirmed) {
                http
                    .delete(`/mpesa/${id}`)
                    .then(response => {
                        if (response.data?.message) {
                            Swal.fire("Deleted!", response.data?.message, "success");
                            if (page === 1) {
                                setReload(!reload);
                            } else {
                                setPage(1);
                            }
                        }
                    })
                    .catch(err => {
                        Swal.fire("Error!", err.message, "warning");
                    })

            }
        });
    };

    const handleCallback = (start, end, label) => {
        setStartDate(dateFormat(start, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setEndDate(dateFormat(end, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setReload(!reload);
    }

    const stopStatusPoll = () => {
        if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
            statusPollRef.current = null;
        }
        setStatusPolling(false);
    };

    const openStatusModal = (prefill = '') => {
        stopStatusPoll();
        setStatusTransId(String(prefill || '').trim().toUpperCase());
        setStatusError('');
        setStatusResult(null);
        setStatusModal(true);
    };

    const closeStatusModal = () => {
        stopStatusPoll();
        setStatusModal(false);
        setStatusBusy(false);
    };

    const applyStatusResult = (result) => {
        setStatusResult(result || null);
        if (result?.trans_id) {
            setSearchText(result.trans_id);
            setPage(1);
        }
    };

    const pollStatusResult = (transId) => {
        stopStatusPoll();
        setStatusPolling(true);
        let attempts = 0;
        statusPollRef.current = setInterval(async () => {
            attempts += 1;
            try {
                const res = await http.get(`/mpesa/status/${encodeURIComponent(transId)}`, { timeout: 20000 });
                if (res?.data?.ready && res?.data?.result) {
                    applyStatusResult(res.data.result);
                    stopStatusPoll();
                    return;
                }
                if (res?.data?.result) {
                    setStatusResult(res.data.result);
                }
            } catch {
                // keep waiting; callback may still arrive
            }
            if (attempts >= 24) {
                stopStatusPoll();
                setStatusError('Timed out waiting for Safaricom callback. Try again in a moment, or check the receipt in the list if it was a local paybill payment.');
            }
        }, 2500);
    };

    const submitStatusCheck = async () => {
        const transId = statusTransId.trim().toUpperCase().replace(/\s+/g, '');
        if (!transId) {
            setStatusError('Enter an M-Pesa receipt / TransID (e.g. UH3HA1BYGW).');
            return;
        }
        setStatusBusy(true);
        setStatusError('');
        setStatusResult(null);
        stopStatusPoll();
        try {
            const res = await http.post('/mpesa/status', { trans_id: transId }, { timeout: 45000 });
            const data = res?.data || {};
            if (data.result) applyStatusResult(data.result);
            if (data.ready) {
                // local hit or already completed
            } else if (data.queued) {
                pollStatusResult(transId);
            } else if (data.success === false) {
                setStatusError(data.message || 'Status query failed.');
            }
        } catch (err) {
            const msg =
                err?.response?.data?.message ||
                err?.response?.data?.error ||
                err?.message ||
                'Status query failed.';
            setStatusError(msg);
        } finally {
            setStatusBusy(false);
        }
    };

    useEffect(() => () => stopStatusPoll(), []);

    useEffect(() => {
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        return () => {
            window.removeEventListener("resize", viewChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <Head title="Mpesa" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page>Mpesa</BlockTitle>
                            {customerFilterLabel ? (
                                <div className="text-soft small mt-1">
                                    Filtered for customer: {customerFilterLabel}
                                </div>
                            ) : null}
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
                                            <label>Period&nbsp;&nbsp;</label>
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
                                        <li>
                                            <Button color="primary" outline className="btn-white" onClick={() => openStatusModal('')}>
                                                <Icon name="reload"></Icon>
                                                <span>Check TransID</span>
                                            </Button>
                                        </li>
                                        <li>
                                            <Button color="light" outline className="btn-white">
                                                <Icon name="download-cloud"></Icon>
                                                <span>Export</span>
                                            </Button>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>
                <Block>
                    <PreviewCard>
                        <div className="dataTables_wrapper dt-bootstrap4 no-footer">
                            <Row className="justify-between g-2 with-export">
                                <Col className="col-7 text-start" sm="4">
                                    <div id="DataTables_Table_0_filter" className="dataTables_filter">
                                        <label>
                                            <input
                                                type="search"
                                                className="form-control form-control-sm"
                                                placeholder="Search by name, code, phone"
                                                value={searchText}
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
                                            <Export data={exportData} />
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
                                                        </select>{" "}
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <DataTable
                                data={data}
                                columns={columns}
                                defaultSortFieldId={1}
                                defaultSortAsc={true}
                                sortServer
                                onSort={handleSort}
                                progressPending={loading}
                                selectableRows={true}
                                selectableRowsComponent={CustomCheckbox}
                                clearSelectedRows={toggleCleared}
                                expandableRowsComponent={ExpandableRowComponent}
                                expandableRows={mobileView}
                                noDataComponent={<div className="p-2">There are no records found</div>}
                                sortIcon={
                                    <div>
                                        <span>&darr;</span>
                                        <span>&uarr;</span>
                                    </div>
                                }
                                pagination={true}
                                paginationServer
                                paginationComponent={({ currentPage, rowsPerPage, rowCount, onChangePage, onChangeRowsPerPage }) => (
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
                    </PreviewCard>
                </Block>
            </Content>

            <Modal isOpen={statusModal} toggle={closeStatusModal} className="modal-dialog-centered" size="md">
                <ModalHeader toggle={closeStatusModal}>Check M-Pesa TransID</ModalHeader>
                <ModalBody>
                    <p className="text-soft small">
                        Looks up a receipt in our paybill records first. If missing, asks Safaricom
                        and waits for the status callback.
                    </p>
                    <div className="form-group">
                        <label className="form-label">Receipt / TransID</label>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. UH3HA1BYGW"
                            value={statusTransId}
                            onChange={(ev) => setStatusTransId(ev.target.value.toUpperCase())}
                            onKeyDown={(ev) => {
                                if (ev.key === 'Enter') {
                                    ev.preventDefault();
                                    submitStatusCheck();
                                }
                            }}
                            disabled={statusBusy || statusPolling}
                            autoFocus
                        />
                    </div>

                    {statusError ? (
                        <Alert color="warning" className="alert-icon">
                            <Icon name="alert-circle" /> {statusError}
                        </Alert>
                    ) : null}

                    {(statusBusy || statusPolling) && !statusResult?.status ? (
                        <div className="d-flex align-items-center g-2 text-soft py-2">
                            <Spinner size="sm" />
                            <span>{statusPolling ? 'Waiting for Safaricom callback…' : 'Checking…'}</span>
                        </div>
                    ) : null}

                    {statusResult ? (
                        <div className="border rounded p-3 bg-lighter">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <strong>{statusResult.trans_id}</strong>
                                <Badge
                                    color={
                                        String(statusResult.status || '').toLowerCase().includes('complete')
                                            ? 'success'
                                            : String(statusResult.status || '').toLowerCase().includes('fail')
                                                || String(statusResult.status || '').toLowerCase().includes('timeout')
                                                ? 'danger'
                                                : String(statusResult.status || '').toLowerCase().includes('pending')
                                                    ? 'warning'
                                                    : 'info'
                                    }
                                    pill
                                >
                                    {statusResult.status || 'Unknown'}
                                </Badge>
                            </div>
                            <div className="small">
                                <div><span className="text-soft">Amount:</span> {statusResult.amount != null ? `KES ${Number(statusResult.amount).toFixed(2)}` : '—'}</div>
                                <div><span className="text-soft">Account / Ref:</span> {statusResult.account || '—'}</div>
                                <div><span className="text-soft">Phone / party:</span> {statusResult.phone || '—'}</div>
                                {statusResult.local_first_name ? (
                                    <div><span className="text-soft">Payer name:</span> {statusResult.local_first_name}</div>
                                ) : null}
                                {statusResult.local_mpesa_time ? (
                                    <div><span className="text-soft">Paybill time:</span> {String(statusResult.local_mpesa_time)}</div>
                                ) : null}
                                <div className="mt-1">
                                    <span className="text-soft">In local M-Pesa list:</span>{' '}
                                    {statusResult.in_local_mpesa ? 'Yes' : 'No'}
                                    {statusResult.local_mpesa_status != null ? ` (status ${statusResult.local_mpesa_status})` : ''}
                                </div>
                                {statusResult.updated_at ? (
                                    <div className="text-soft mt-1">Updated {statusResult.updated_at}</div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </ModalBody>
                <ModalFooter className="bg-light">
                    <Button color="light" onClick={closeStatusModal} disabled={statusBusy}>
                        Close
                    </Button>
                    <Button color="primary" onClick={submitStatusCheck} disabled={statusBusy || statusPolling}>
                        {statusBusy ? <Spinner size="sm" /> : null}
                        <span>{statusPolling ? 'Waiting…' : 'Check status'}</span>
                    </Button>
                </ModalFooter>
            </Modal>
        </>
    );
};

export default connect((state) => ({
    user: state.auth.currentUser,
}))(List);
