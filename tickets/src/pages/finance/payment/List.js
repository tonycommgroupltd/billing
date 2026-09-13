import React, { useState, useEffect } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalBody, Row } from "reactstrap";
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
import { httpNode } from '../../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import dateFormat from 'dateformat';
import DateRangePicker from 'react-bootstrap-daterangepicker';
import moment from 'moment';
import 'bootstrap-daterangepicker/daterangepicker.css';
import { Link } from 'react-router-dom';

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

const List = ({ ...props }) => {
    let expandableRows = true;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('id');
    const [searchText, setSearchText] = useState("");
    const [mobileView, setMobileView] = useState();
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const [smOption, setSmOption] = useState(false);
    const [startDate, setStartDate] = useState(dateFormat(moment().startOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [endDate, setEndDate] = useState(dateFormat(moment().endOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));

    const ExpandableRowComponent = ({ data }) => {
        return (
            <ul className="dtr-details p-2 border-bottom ms-1">
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Customer name</span> <span className="dtr-data">{data.name}</span>
                </li>
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Date</span> <span className="dtr-data">{dateFormat(data.date, "dS, mmm yy")}</span>
                </li>
                <div className="d-flex align-items-center pt-1 d-sm-none">
                    <span className="dtr-title">Actions</span>
                    <div className="dtr-data">
                        <ul className="nk-tb-actions gx-1">
                            <li onClick={() => confirmDelete(data.id, data.id)}>
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

    const columns = [
        {
            id: 1,
            name: "Payment Type",
            selector: (row) => row.payment_type_label,
            wrap: true,
            sortable: true,
            ref: "payment_type"
        },
        {
            id: 2,
            name: "Customer name",
            selector: (row) => <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.customer_id}`}>{row.name}</Link>,
            wrap: false,
            sortable: false,
            ref: "customer_name",
            hide: "sm"
        },
        {
            id: 3,
            name: "Date",
            selector: (row) => dateFormat(row.date, "dS, mmm yy"),
            wrap: true,
            sortable: true,
            ref: "date",
            hide: "sm",
        },
        {
            id: 4,
            name: "Sum",
            selector: (row) => Number(row.sum).toFixed(2) + ' Sh',
            wrap: true,
            sortable: true,
            ref: "sum",
        },
        {
            id: 5,
            name: "Invoice Number",
            selector: (row) => row.invoice_id,
            wrap: true,
            sortable: true,
            ref: "invoice_id",
        },
        {
            name: "Actions",
            cell: (row) => (
                <ul className="nk-tb-actions gx-1">
                    <li onClick={() => confirmDelete(row.id, row.id)}>
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
        const fetchPayments = async () => {
            setLoading(true);
            const response = await httpNode.get(`/finance/payments?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}&start=${startDate}&end=${endDate}`);
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchPayments();

    }, [page, perPage, sortCol, sort, searchText, reload]);

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
                httpNode
                    .delete(`/finance/payments/${id}`)
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

    useEffect(() => {
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        return () => {
            window.removeEventListener("resize", viewChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <Head title="Payments" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page>Payments</BlockTitle>
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
                                            <Export data={data} />
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
        </>
    );
};

export default List;
