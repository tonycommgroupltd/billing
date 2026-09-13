import React, { useState, useEffect } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Row, Badge } from "reactstrap";
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
    RSelect,
} from "../../components/Component";
import { http } from '../../helpers';
import dateFormat from 'dateformat';
import DateRangePicker from 'react-bootstrap-daterangepicker';
import moment from 'moment';
import 'bootstrap-daterangepicker/daterangepicker.css';
import { useLocation } from 'react-router-dom';
import { toast } from "react-toastify";
import { invoiceStatusOptions } from "../components/forms/SelectData";
import { connect } from 'react-redux';

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
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

const Invoices = ({ user }) => {
    let expandableRows = false;
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const status = searchParams.get('status') || '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('id');
    const [searchText, setSearchText] = useState("");
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const [smOption, setSmOption] = useState(false);
    const [startDate, setStartDate] = useState(dateFormat(moment().startOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [endDate, setEndDate] = useState(dateFormat(moment().endOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [invoiceStatus, setInvoiceStatus] = useState(status);

    const execToast = (placement, message) => {
        toast.error(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const successToast = (placement, message) => {
        toast.success(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const onChangeStatus = (e) => {
        setInvoiceStatus(e.value);
        if (page === 1) {
            setReload(!reload);
        } else {
            setPage(1);
        }
    };

    const columns = [
        {
            id: 1,
            name: "Status",
            cell: (row) =>
                row.status && row.status?.value === 1 ? <Badge color="danger">Unpaid</Badge> : row.status && row.status?.value === 2 ? <Badge color="success">Paid</Badge> : ''
            ,
            selector: (row) => row.status,
            wrap: true,
            sortable: true,
            ref: "invoices.status->value"
        },
        {
            id: 3,
            name: "Date",
            selector: (row) => dateFormat(row.invoice_date, "yyyy-mm-dd"),
            wrap: true,
            sortable: true,
            ref: "invoice_date",
            hide: "sm",
        },
        {
            id: 4,
            name: "Total",
            selector: (row) => Number(row.total).toFixed(2) + ' Sh',
            wrap: true,
            sortable: true,
            ref: "total",
        },
        {
            id: 5,
            name: "Due",
            cell: (row) => row.due ? Number(row.due).toFixed(2) + ' Sh' : '',
            selector: (row) => row.due,
            wrap: true,
            sortable: false,
            ref: "due",
        },
        {
            id: 6,
            name: "Payment date",
            cell: (row) => row.payment_date ? dateFormat(row.payment_date, "yyyy-mm-dd") : '',
            selector: (row) => row.payment_date,
            wrap: true,
            sortable: false,
            ref: "payment_date",
            hide: "sm",
        },
    ];

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
        const fetchInvoices = async () => {
            setLoading(true);
            const response = await http.get(`${process.env.REACT_APP_API_URL}/list-customer-invoices-2/${user.id}?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}&start=${startDate}&end=${endDate}&status=${invoiceStatus}`);
            
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchInvoices();

    }, [page, perPage, sortCol, sort, searchText, reload]);

    const handleCallback = (start, end, label) => {
        setStartDate(dateFormat(start, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setEndDate(dateFormat(end, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setReload(!reload);
    }

    return (
        <>
            <Head title="Invoices" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page>Invoices</BlockTitle>
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
                                            <label className="overline-title overline-title-alt pe-1">Status</label>
                                            <div style={{ width: "180px" }}>
                                                <RSelect options={invoiceStatusOptions} placeholder="Any Status" onChange={(e) => onChangeStatus(e)} defaultValue={status === '1' ? { label: "Unpaid", value: 1 } : status === '2' ? { label: "Paid", value: 2 } : ''} />
                                            </div>
                                        </li>
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
                    <PreviewCard>
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
                                //expandableRowsComponent={ExpandableRowComponent}
                                //expandableRows={mobileView}
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
        </>
    );
};

const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(Invoices);
